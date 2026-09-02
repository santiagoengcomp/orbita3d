import { useEffect, useRef, useState, type ReactNode } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFExporter } from "three/addons/exporters/GLTFExporter.js";
import type { ModelData, ScanMeta, ViewMode } from "../lib/types";
import { applyRelief, MODEL_H, RELIEF_DEFAULT, RELIEF_MAX } from "../lib/pipeline";
import {
  IconBack,
  IconCube,
  IconDownload,
  IconLayers,
  IconPhoto,
  IconPoints,
  IconRestart,
  IconSpin,
  IconTrash,
  IconWire,
} from "./Icons";

interface Props {
  model: ModelData;
  meta: ScanMeta;
  onNewScan: () => void;
  onDelete?: () => void;
}

export default function Viewer({ model, meta, onNewScan, onDelete }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const groupRef = useRef<THREE.Group | null>(null);
  const exportMeshRef = useRef<THREE.Mesh | null>(null);

  const [mode, setMode] = useState<ViewMode>("textura");
  const [auto, setAuto] = useState(true);
  const [relief, setRelief] = useState(Math.round((RELIEF_DEFAULT / RELIEF_MAX) * 100));
  const autoRef = useRef(true);
  autoRef.current = auto;

  /* ---------------- montagem da cena ---------------- */
  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;

    const renderer = new THREE.WebGLRenderer({
      antialias: true,
      alpha: true,
      preserveDrawingBuffer: true,
    });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;

    const camera = new THREE.PerspectiveCamera(42, 1, 0.1, 60);
    camera.position.set(2.3, 1.0, 2.7);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.enablePan = false;
    controls.minDistance = 1.3;
    controls.maxDistance = 6.5;
    controls.maxPolarAngle = Math.PI * 0.66;
    controls.target.set(0, 0.02, 0);
    controls.addEventListener("start", () => setAuto(false));

    /* luzes */
    scene.add(new THREE.HemisphereLight(0xe6eef6, 0x141a21, 1.15));
    const key = new THREE.DirectionalLight(0xffffff, 1.4);
    key.position.set(3, 4.5, 2.5);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0xbcd4e2, 0.45);
    fill.position.set(-3.5, 2, 3);
    scene.add(fill);
    const rim = new THREE.PointLight(0x3fe0c5, 6, 14);
    rim.position.set(-3.2, 1.4, -2.4);
    scene.add(rim);
    const warm = new THREE.PointLight(0xff7a1f, 3.2, 12);
    warm.position.set(2.6, -0.6, -2.8);
    scene.add(warm);

    /* grupo do modelo */
    const group = new THREE.Group();
    groupRef.current = group;
    scene.add(group);

    const texture = new THREE.CanvasTexture(model.texture);
    texture.colorSpace = THREE.SRGBColorSpace;
    texture.wrapS = THREE.RepeatWrapping;
    texture.anisotropy = renderer.capabilities.getMaxAnisotropy();

    const texMat = new THREE.MeshStandardMaterial({
      map: texture,
      roughness: 0.88,
      metalness: 0.03,
      side: THREE.DoubleSide,
    });
    const texMesh = new THREE.Mesh(model.geometry, texMat);
    texMesh.name = "orbita-malha";
    group.add(texMesh);
    exportMeshRef.current = texMesh;

    const clayMat = new THREE.MeshStandardMaterial({
      color: 0xc9d3de,
      roughness: 0.95,
      metalness: 0,
      flatShading: true,
      side: THREE.DoubleSide,
    });
    const clayMesh = new THREE.Mesh(model.geometry, clayMat);
    clayMesh.visible = false;
    group.add(clayMesh);

    const wireMat = new THREE.MeshBasicMaterial({
      color: 0xff7a1f,
      wireframe: true,
      transparent: true,
      opacity: 0.22,
    });
    const wireMesh = new THREE.Mesh(model.geometry, wireMat);
    wireMesh.visible = false;
    group.add(wireMesh);

    const ptsGeo = new THREE.BufferGeometry();
    ptsGeo.setAttribute("position", new THREE.BufferAttribute(model.points.positions, 3));
    ptsGeo.setAttribute("color", new THREE.BufferAttribute(model.points.colors, 3));
    const ptsMat = new THREE.PointsMaterial({ size: 0.02, vertexColors: true, sizeAttenuation: true });
    const pts = new THREE.Points(ptsGeo, ptsMat);
    pts.visible = false;
    group.add(pts);

    /* piso */
    const grid = new THREE.PolarGridHelper(1.55, 24, 6, 72, 0x2c3844, 0x1b232d);
    grid.position.y = -MODEL_H / 2 - 0.02;
    (grid.material as THREE.Material).transparent = true;
    (grid.material as THREE.Material).opacity = 0.85;
    scene.add(grid);
    const shadow = new THREE.Mesh(
      new THREE.CircleGeometry(0.95, 48),
      new THREE.MeshBasicMaterial({ color: 0x000000, transparent: true, opacity: 0.32 })
    );
    shadow.rotation.x = -Math.PI / 2;
    shadow.position.y = -MODEL_H / 2 - 0.015;
    scene.add(shadow);

    const applyMode = (m: ViewMode) => {
      texMesh.visible = m === "textura";
      clayMesh.visible = m === "malha";
      wireMesh.visible = m === "malha";
      pts.visible = m === "pontos";
    };
    applyMode(mode);
    (group as THREE.Group & { applyMode?: (m: ViewMode) => void }).applyMode = applyMode;

    const resize = () => {
      const w = mount.clientWidth;
      const h = mount.clientHeight;
      renderer.setSize(w, h);
      camera.aspect = w / h;
      camera.updateProjectionMatrix();
    };
    resize();
    const ro = new ResizeObserver(resize);
    ro.observe(mount);

    const clock = new THREE.Clock();
    let rafId = 0;
    const tick = () => {
      const dt = clock.getDelta();
      if (autoRef.current) group.rotation.y += dt * 0.42;
      controls.update();
      renderer.render(scene, camera);
      rafId = requestAnimationFrame(tick);
    };
    tick();

    return () => {
      cancelAnimationFrame(rafId);
      ro.disconnect();
      controls.dispose();
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
      scene.traverse((obj) => {
        const mesh = obj as THREE.Mesh;
        if (mesh.geometry) mesh.geometry.dispose();
        const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
        if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
        else mat?.dispose();
      });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [model]);

  /* troca de modo sem remontar cena */
  useEffect(() => {
    const g = groupRef.current as (THREE.Group & { applyMode?: (m: ViewMode) => void }) | null;
    g?.applyMode?.(mode);
  }, [mode]);

  /* relevo ao vivo */
  useEffect(() => {
    applyRelief(model, (relief / 100) * RELIEF_MAX);
  }, [relief, model]);

  /* ---------------- exportações ---------------- */
  const exportGLB = () => {
    const mesh = exportMeshRef.current;
    if (!mesh) return;
    const exporter = new GLTFExporter();
    const wasVisible = mesh.visible;
    mesh.visible = true;
    exporter.parse(
      mesh,
      (result) => {
        mesh.visible = wasVisible;
        const blob = new Blob([result as ArrayBuffer], { type: "model/gltf-binary" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = "orbita-modelo.glb";
        a.click();
        setTimeout(() => URL.revokeObjectURL(a.href), 4000);
      },
      (err) => console.warn("Falha ao exportar GLB:", err),
      { binary: true }
    );
  };

  const exportPNG = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const a = document.createElement("a");
    a.href = renderer.domElement.toDataURL("image/png");
    a.download = "orbita-captura.png";
    a.click();
  };

  const modeBtns: { id: ViewMode; label: string; icon: ReactNode }[] = [
    { id: "textura", label: "Textura", icon: <IconCube size={15} /> },
    { id: "malha", label: "Malha", icon: <IconWire size={15} /> },
    { id: "pontos", label: "Pontos", icon: <IconPoints size={15} /> },
  ];

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-line bg-deep">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(63,224,197,0.06),transparent_55%),radial-gradient(ellipse_at_70%_85%,rgba(255,122,31,0.07),transparent_50%)]" />
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      {/* barra superior */}
      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3.5">
        <div className="pointer-events-auto flex items-center gap-2">
          <button
            onClick={onNewScan}
            className="press flex items-center gap-1.5 rounded-md border border-line bg-panel/85 px-3 py-2 text-xs font-semibold backdrop-blur"
          >
            <IconBack size={14} />
            Novo scan
          </button>
          {onDelete && (
            <button
              onClick={onDelete}
              aria-label="Excluir modelo"
              className="press flex items-center gap-1.5 rounded-md border border-line bg-panel/85 px-3 py-2 text-xs font-semibold text-muted backdrop-blur hover:text-danger"
            >
              <IconTrash size={14} />
            </button>
          )}
        </div>
        <div className="pointer-events-auto rounded-md border border-line bg-panel/85 px-3.5 py-2 text-right backdrop-blur">
          <p className="font-display text-[11px] font-bold leading-tight">{meta.name}</p>
          <p className="mt-0.5 font-mono text-[9.5px] tracking-[0.16em] text-muted">
            {new Date(meta.createdAt).toLocaleDateString("pt-BR")} ·{" "}
            {new Date(meta.createdAt).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
            {meta.demo && <span className="ml-1.5 text-scan">DEMO</span>}
            {model.stats.hull && <span className="ml-1.5 text-scan">HULL</span>}
          </p>
        </div>
      </div>

      {/* estatísticas */}
      <div className="pointer-events-none absolute bottom-3.5 left-3.5 z-10 hidden rounded-md border border-line bg-panel/85 px-3.5 py-2.5 font-mono text-[10px] leading-relaxed text-muted backdrop-blur sm:block">
        <p>
          <span className="text-scan">▲</span> {model.stats.triangles.toLocaleString("pt-BR")} triângulos
        </p>
        <p>
          <span className="text-accent">●</span> {model.stats.points.toLocaleString("pt-BR")} pontos
        </p>
        <p>
          <span className="text-ink/70">◫</span> {model.stats.frames} quadros ·{" "}
          {model.stats.vertices.toLocaleString("pt-BR")} vértices
        </p>
        <p>{model.stats.hull ? <span className="text-scan">◈ silhueta → visual hull</span> : <span className="text-accent-soft">◈ perfil cilíndrico</span>}</p>
      </div>

      <p className="pointer-events-none absolute bottom-3.5 left-1/2 z-10 -translate-x-1/2 whitespace-nowrap font-mono text-[9.5px] tracking-[0.18em] text-dim sm:bottom-4">
        ARRASTE PARA ORBITAR · PINÇA/SCROLL P/ ZOOM
      </p>

      {/* doca de controles */}
      <div className="absolute inset-x-0 bottom-3.5 z-10 flex justify-center px-3 sm:bottom-4">
        <div className="pointer-events-auto flex flex-wrap items-center justify-center gap-1.5 rounded-lg border border-line bg-panel/90 p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur">
          <div className="flex items-center gap-1 rounded-md bg-deep/70 p-1">
            {modeBtns.map((b) => (
              <button
                key={b.id}
                onClick={() => setMode(b.id)}
                className={`press flex items-center gap-1.5 rounded-[5px] px-2.5 py-1.5 text-[11.5px] font-semibold ${
                  mode === b.id ? "bg-accent text-deep" : "text-muted hover:text-ink"
                }`}
              >
                {b.icon}
                <span className="hidden sm:inline">{b.label}</span>
              </button>
            ))}
          </div>

          <label className="flex items-center gap-2 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-muted">
            <IconLayers size={15} className="text-scan" />
            <span className="hidden md:inline">Relevo</span>
            <input
              type="range"
              min={0}
              max={100}
              value={relief}
              onChange={(e) => setRelief(+e.target.value)}
              className="h-1 w-20 cursor-pointer accent-accent sm:w-24"
            />
            <span className="w-8 text-right font-mono text-[10px] text-scan">{relief}%</span>
          </label>

          <span className="mx-0.5 hidden h-6 w-px bg-line sm:block" />
          <button
            onClick={() => setAuto((a) => !a)}
            aria-label="Rotação automática"
            className={`press flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold ${
              auto ? "bg-scan/15 text-scan" : "text-muted hover:text-ink"
            }`}
          >
            <IconSpin size={15} className={auto ? "anim-orbit-fast" : ""} style={{ transformOrigin: "center" }} />
            <span className="hidden sm:inline">Girar</span>
          </button>
          <button
            onClick={exportGLB}
            className="press flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"
            title="Baixar modelo .glb"
          >
            <IconDownload size={15} />
            <span className="hidden sm:inline">GLB</span>
          </button>
          <button
            onClick={exportPNG}
            className="press flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"
            title="Salvar captura PNG"
          >
            <IconPhoto size={15} />
            <span className="hidden sm:inline">PNG</span>
          </button>
          <button
            onClick={onNewScan}
            className="press flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-bold text-deep"
          >
            <IconRestart size={15} />
            <span className="hidden sm:inline">Escanear outro</span>
          </button>
        </div>
      </div>
    </div>
  );
}
