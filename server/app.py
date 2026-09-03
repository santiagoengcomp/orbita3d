from __future__ import annotations

import os
import importlib.util
import re
import subprocess
import threading
import traceback
import uuid
from pathlib import Path
from typing import Any

import trimesh
from fastapi import BackgroundTasks, FastAPI, File, Form, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse


ROOT = Path(__file__).resolve().parents[1]
WORKSPACES = Path(__file__).resolve().parent / "workspaces"
COLMAP_ROOT = ROOT / ".tools" / "colmap-4.2.0"
COLMAP = COLMAP_ROOT / "bin" / "colmap.exe"
OPENMVS_BIN = ROOT / ".tools" / "openmvs-2.4.0" / "vc17" / "x64" / "Release"
INTERFACE_COLMAP = OPENMVS_BIN / "InterfaceCOLMAP.exe"
DENSIFY = OPENMVS_BIN / "DensifyPointCloud.exe"
RECONSTRUCT = OPENMVS_BIN / "ReconstructMesh.exe"
TEXTURE = OPENMVS_BIN / "TextureMesh.exe"

MIN_IMAGES = 12
MIN_REGISTERED_IMAGES = 8
MAX_IMAGES = 48
MAX_FILE_BYTES = 12 * 1024 * 1024
THREADS = 4
# Um modelo compacto ja instalado atende os tres fluxos sem download durante o scan.
# Modelos especializados maiores ficam como melhoria opcional, nao como dependencia fragil.
SEGMENT_MODELS = {"object": "u2netp", "face": "u2netp", "body": "u2netp"}
os.environ.setdefault("U2NET_HOME", str(ROOT / ".tools" / "rembg-models"))

app = FastAPI(title="Órbita 3D Reconstruction", version="1.0")
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

jobs: dict[str, dict[str, Any]] = {}
jobs_lock = threading.Lock()


def _engines() -> dict[str, bool]:
    return {
        "colmap": COLMAP.is_file(),
        "openmvs": all(p.is_file() for p in (INTERFACE_COLMAP, DENSIFY, RECONSTRUCT, TEXTURE)),
        "recognition": importlib.util.find_spec("rembg") is not None,
    }


def _set_job(job_id: str, **values: Any) -> None:
    with jobs_lock:
        jobs[job_id].update(values)


def _append_log(job_id: str, message: str) -> None:
    with jobs_lock:
        current = jobs[job_id].setdefault("log", [])
        current.append(message)
        jobs[job_id]["log"] = current[-20:]


def _process_env() -> dict[str, str]:
    env = os.environ.copy()
    env["PATH"] = f"{COLMAP_ROOT / 'bin'};{OPENMVS_BIN};{env.get('PATH', '')}"
    env["QT_PLUGIN_PATH"] = str(COLMAP_ROOT / "plugins")
    return env


def _run(job_id: str, args: list[str], cwd: Path, stage: str, progress: int) -> None:
    _set_job(job_id, stage=stage, progress=progress)
    _append_log(job_id, stage)
    log_path = Path(jobs[job_id]["workspace"]) / "reconstruction.log"
    with log_path.open("a", encoding="utf-8", errors="replace") as log:
        log.write(f"\n\n===== {stage} =====\n")
        log.write(" ".join(args) + "\n")
        log.flush()
        completed = subprocess.run(
            args,
            cwd=cwd,
            env=_process_env(),
            stdout=log,
            stderr=subprocess.STDOUT,
            timeout=4 * 60 * 60,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            check=False,
        )
    if completed.returncode != 0:
        tail = log_path.read_text(encoding="utf-8", errors="replace")[-4000:]
        raise RuntimeError(f"{stage} falhou (código {completed.returncode}).\n{tail}")


def _largest_sparse_model(sparse_root: Path) -> Path:
    candidates = [p for p in sparse_root.iterdir() if p.is_dir() and (p / "images.bin").is_file()]
    if not candidates:
        raise RuntimeError("O COLMAP não conseguiu localizar câmeras suficientes. Capture novamente com mais sobreposição e textura.")
    return max(candidates, key=lambda p: (p / "points3D.bin").stat().st_size if (p / "points3D.bin").exists() else 0)


def _registered_images(model: Path, fallback: int) -> int:
    try:
        result = subprocess.run(
            [str(COLMAP), "model_analyzer", "--path", str(model)],
            cwd=model,
            env=_process_env(),
            capture_output=True,
            text=True,
            timeout=120,
            creationflags=getattr(subprocess, "CREATE_NO_WINDOW", 0),
            check=False,
        )
        match = re.search(r"Registered images:\s*(\d+)", result.stdout + result.stderr)
        return int(match.group(1)) if match else fallback
    except Exception:
        return fallback


def _mesh_stats(path: Path) -> tuple[int, int]:
    try:
        loaded = trimesh.load(path, force="scene")
        geometries = list(loaded.geometry.values()) if isinstance(loaded, trimesh.Scene) else [loaded]
        vertices = sum(len(g.vertices) for g in geometries if hasattr(g, "vertices"))
        triangles = sum(len(g.faces) for g in geometries if hasattr(g, "faces"))
        return vertices, triangles
    except Exception:
        return 0, 0


def _ply_vertex_count(path: Path) -> int:
    try:
        with path.open("rb") as stream:
            for _ in range(100):
                line = stream.readline().decode("ascii", errors="ignore").strip()
                match = re.fullmatch(r"element vertex (\d+)", line)
                if match:
                    return int(match.group(1))
                if line == "end_header" or not line:
                    break
    except OSError:
        pass
    return 0


def _create_masks(job_id: str, source: Path, destination: Path, model_name: str, openmvs: bool = False) -> None:
    """Reconhece o primeiro plano. Preto e ignorado pelos motores; branco preserva o assunto."""
    from PIL import Image, ImageFilter
    from rembg import new_session, remove

    files = sorted(p for p in source.rglob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png"})
    if not files:
        raise RuntimeError("Nenhuma foto foi encontrada para o reconhecimento do assunto.")
    destination.mkdir(parents=True, exist_ok=True)
    session = new_session(model_name)
    for index, path in enumerate(files):
        with Image.open(path) as image:
            mask = remove(image.convert("RGB"), session=session, only_mask=True, post_process_mask=True).convert("L")
        # Remove o halo probabilistico do fundo e expande dois pixels para proteger a silhueta.
        mask = mask.point(lambda value: 255 if value >= 32 else 0).filter(ImageFilter.MaxFilter(5))
        relative = path.relative_to(source)
        suffix = ".mask.png" if openmvs else ".png"
        output = destination / relative.parent / f"{relative.name}{suffix}"
        output.parent.mkdir(parents=True, exist_ok=True)
        mask.save(output, optimize=True)
        if index == 0 and not openmvs:
            _set_job(job_id, preview=str(output))
        _set_job(job_id, progress=3 + int((index + 1) / len(files) * 4))


def _reconstruct_job(job_id: str) -> None:
    job = jobs[job_id]
    workspace = Path(job["workspace"])
    images = workspace / "images"
    colmap_ws = workspace / "colmap"
    mvs_ws = workspace / "mvs"
    colmap_masks = workspace / "masks-colmap"
    colmap_ws.mkdir(parents=True, exist_ok=True)
    mvs_ws.mkdir(parents=True, exist_ok=True)

    try:
        _set_job(job_id, status="running")
        scan_type = job.get("scanType", "object")
        model_name = SEGMENT_MODELS.get(scan_type, "u2netp")
        _set_job(job_id, stage="Reconhecendo e isolando o assunto", progress=2)
        _append_log(job_id, f"Recorte inteligente: modo {scan_type}")
        _create_masks(job_id, images, colmap_masks, model_name)
        _run(job_id, [
            str(COLMAP), "automatic_reconstructor", "--workspace_path", str(colmap_ws),
            "--image_path", str(images), "--data_type", "video", "--quality", "medium",
            "--camera_model", "SIMPLE_RADIAL", "--single_camera", "1", "--dense", "0",
            "--use_gpu", "0", "--num_threads", str(THREADS), "--mask_path", str(colmap_masks),
        ], workspace, "Localizando a câmera em cada foto", 8)

        sparse = _largest_sparse_model(colmap_ws / "sparse")
        registered = _registered_images(sparse, job["frames"])
        if registered < MIN_REGISTERED_IMAGES:
            raise RuntimeError(
                f"Apenas {registered} de {job['frames']} fotos puderam ser alinhadas. "
                "Faça uma volta lenta, com o objeto imóvel e 70% de sobreposição entre fotos."
            )
        _set_job(job_id, registeredFrames=registered, progress=42)
        _append_log(job_id, f"{registered} câmeras alinhadas")

        _run(job_id, [
            str(COLMAP), "image_undistorter", "--image_path", str(images),
            "--input_path", str(sparse), "--output_path", str(mvs_ws),
            "--output_type", "COLMAP", "--max_image_size", "1600",
        ], workspace, "Corrigindo a lente das fotos", 45)
        _set_job(job_id, stage="Ajustando a silhueta às fotos corrigidas", progress=48)
        _create_masks(job_id, mvs_ws / "images", mvs_ws / "masks", model_name, openmvs=True)
        _run(job_id, [
            str(INTERFACE_COLMAP), "-i", ".", "-o", "scene.mvs",
            "--image-folder", "images", "--max-threads", str(THREADS),
        ], mvs_ws, "Preparando a reconstrução densa", 51)
        _run(job_id, [
            str(DENSIFY), "scene.mvs", "--resolution-level", "1", "--number-views", "4",
            "--max-threads", str(THREADS), "--estimate-roi", "1.1", "--remove-dmaps", "1",
            "--mask-path", "masks",
        ], mvs_ws, "Calculando profundidade (etapa mais demorada)", 56)
        _run(job_id, [
            str(RECONSTRUCT), "scene_dense.mvs", "-p", "scene_dense.ply",
            "--remove-spurious", "4", "--close-holes", "30", "--smooth", "2",
            "--max-threads", str(THREADS),
        ], mvs_ws, "Transformando pontos em malha 3D", 84)
        _run(job_id, [
            str(TEXTURE), "scene_dense.mvs", "-m", "scene_dense_mesh.ply",
            "-o", "orbita_result.mvs", "--export-type", "glb", "--resolution-level", "1",
            "--max-texture-size", "4096", "--max-threads", str(THREADS),
        ], mvs_ws, "Aplicando a textura das fotos", 93)

        result = mvs_ws / "orbita_result.glb"
        if not result.is_file():
            matches = sorted(mvs_ws.glob("*.glb"), key=lambda p: p.stat().st_mtime, reverse=True)
            if not matches:
                raise RuntimeError("O OpenMVS terminou, mas não exportou o modelo GLB.")
            result = matches[0]
        vertices, triangles = _mesh_stats(result)
        points = _ply_vertex_count(mvs_ws / "scene_dense.ply")
        _set_job(job_id, status="complete", stage="Modelo 3D concluído", progress=100,
                 result=str(result), vertices=vertices, triangles=triangles, points=points)
        _append_log(job_id, "Modelo texturizado pronto para visualizar")
    except Exception as exc:
        traceback.print_exc()
        message = str(exc).strip() or "Falha desconhecida na reconstrução."
        _set_job(job_id, status="failed", stage="Reconstrução interrompida", error=message, progress=0)
        _append_log(job_id, message.splitlines()[0])


@app.get("/api/health")
def health() -> dict[str, Any]:
    engines = _engines()
    return {"ok": all(engines.values()), "engines": engines, "mode": "cpu", "minImages": MIN_IMAGES}


@app.post("/api/jobs", status_code=202)
async def create_job(
    background: BackgroundTasks,
    images: list[UploadFile] = File(...),
    scan_type: str = Form("object"),
) -> dict[str, str]:
    engines = _engines()
    if not all(engines.values()):
        raise HTTPException(503, detail=f"Motores de reconstrução ausentes: {engines}")
    if not MIN_IMAGES <= len(images) <= MAX_IMAGES:
        raise HTTPException(400, detail=f"Envie entre {MIN_IMAGES} e {MAX_IMAGES} fotos.")
    if scan_type not in SEGMENT_MODELS:
        raise HTTPException(400, detail="Tipo de escaneamento invalido.")

    job_id = uuid.uuid4().hex
    workspace = WORKSPACES / job_id
    image_dir = workspace / "images"
    image_dir.mkdir(parents=True, exist_ok=False)
    try:
        for index, upload in enumerate(images):
            content = await upload.read(MAX_FILE_BYTES + 1)
            if len(content) > MAX_FILE_BYTES:
                raise HTTPException(413, detail=f"A foto {index + 1} excede 12 MB.")
            if len(content) < 1024:
                raise HTTPException(400, detail=f"A foto {index + 1} está vazia ou corrompida.")
            (image_dir / f"frame-{index:03d}.jpg").write_bytes(content)
    finally:
        for upload in images:
            await upload.close()

    jobs[job_id] = {
        "id": job_id, "status": "queued", "stage": "Aguardando início", "progress": 1,
        "frames": len(images), "registeredFrames": 0, "workspace": str(workspace),
        "scanType": scan_type,
        "log": [f"{len(images)} fotos recebidas em alta qualidade"],
    }
    background.add_task(_reconstruct_job, job_id)
    return {"id": job_id}


@app.get("/api/jobs/{job_id}")
def get_job(job_id: str) -> dict[str, Any]:
    with jobs_lock:
        job = jobs.get(job_id)
        if not job:
            raise HTTPException(404, detail="Reconstrução não encontrada.")
        public = {k: v for k, v in job.items() if k not in {"workspace", "result", "preview"}}
    if job.get("status") == "complete":
        public["resultUrl"] = f"/api/jobs/{job_id}/result"
    if job.get("preview"):
        public["previewUrl"] = f"/api/jobs/{job_id}/preview"
    return public


@app.get("/api/jobs/{job_id}/preview")
def get_preview(job_id: str) -> FileResponse:
    job = jobs.get(job_id)
    if not job or not job.get("preview"):
        raise HTTPException(404, detail="Previa do recorte ainda indisponivel.")
    return FileResponse(Path(job["preview"]), media_type="image/png")


@app.get("/api/jobs/{job_id}/result")
def get_result(job_id: str) -> FileResponse:
    job = jobs.get(job_id)
    if not job or job.get("status") != "complete":
        raise HTTPException(404, detail="Modelo ainda não está disponível.")
    result = Path(job["result"])
    return FileResponse(result, media_type="model/gltf-binary", filename=f"orbita-{job_id[:8]}.glb")
