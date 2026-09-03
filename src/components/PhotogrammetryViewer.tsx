import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import type { PhotogrammetryModelData, ScanMeta } from "../lib/types";
import { IconBack, IconDownload, IconPhoto, IconRestart, IconSpin, IconTrash } from "./Icons";

interface Props {
  model: PhotogrammetryModelData;
  meta: ScanMeta;
  onNewScan: () => void;
  onDelete?: () => void;
}

export default function PhotogrammetryViewer({ model, meta, onNewScan, onDelete }: Props) {
  const mountRef = useRef<HTMLDivElement>(null);
  const rendererRef = useRef<THREE.WebGLRenderer | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const autoRef = useRef(true);
  const [auto, setAuto] = useState(true);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  autoRef.current = auto;

  useEffect(() => {
    const mount = mountRef.current;
    if (!mount) return;
    const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    mount.appendChild(renderer.domElement);
    rendererRef.current = renderer;

    const scene = new THREE.Scene();
    sceneRef.current = scene;
    const camera = new THREE.PerspectiveCamera(42, 1, 0.01, 100);
    camera.position.set(2.4, 1.5, 2.8);
    cameraRef.current = camera;
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.06;
    controls.addEventListener("start", () => setAuto(false));

    scene.add(new THREE.HemisphereLight(0xffffff, 0x18202a, 1.5));
    const key = new THREE.DirectionalLight(0xffffff, 2.2);
    key.position.set(4, 6, 3);
    scene.add(key);
    const fill = new THREE.DirectionalLight(0x8fcfff, 0.8);
    fill.position.set(-4, 2, -3);
    scene.add(fill);

    const orbitGroup = new THREE.Group();
    scene.add(orbitGroup);
    new GLTFLoader().load(
      model.glb,
      (gltf) => {
        const object = gltf.scene;
        const box = new THREE.Box3().setFromObject(object);
        const size = box.getSize(new THREE.Vector3());
        const center = box.getCenter(new THREE.Vector3());
        const largest = Math.max(size.x, size.y, size.z, 0.001);
        object.position.sub(center);
        object.scale.setScalar(1.8 / largest);
        object.traverse((child) => {
          const mesh = child as THREE.Mesh;
          if (mesh.isMesh) {
            mesh.castShadow = true;
            mesh.receiveShadow = true;
          }
        });
        orbitGroup.add(object);
        controls.target.set(0, 0, 0);
        controls.minDistance = 0.7;
        controls.maxDistance = 8;
        controls.update();
        setLoading(false);
      },
      undefined,
      () => {
        setError("Não foi possível abrir o arquivo GLB gerado.");
        setLoading(false);
      }
    );

    const grid = new THREE.PolarGridHelper(1.5, 24, 6, 72, 0x2c3844, 0x1b232d);
    grid.position.y = -1;
    scene.add(grid);

    const resize = () => {
      const width = mount.clientWidth;
      const height = mount.clientHeight;
      renderer.setSize(width, height);
      camera.aspect = width / Math.max(1, height);
      camera.updateProjectionMatrix();
    };
    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(mount);
    const clock = new THREE.Clock();
    let raf = 0;
    const render = () => {
      if (autoRef.current) orbitGroup.rotation.y += clock.getDelta() * 0.32;
      else clock.getDelta();
      controls.update();
      renderer.render(scene, camera);
      raf = requestAnimationFrame(render);
    };
    render();

    return () => {
      cancelAnimationFrame(raf);
      observer.disconnect();
      controls.dispose();
      scene.traverse((child) => {
        const mesh = child as THREE.Mesh;
        mesh.geometry?.dispose();
        const materials = Array.isArray(mesh.material) ? mesh.material : mesh.material ? [mesh.material] : [];
        materials.forEach((material) => {
          const standard = material as THREE.MeshStandardMaterial;
          standard.map?.dispose();
          material.dispose();
        });
      });
      renderer.dispose();
      if (renderer.domElement.parentElement === mount) mount.removeChild(renderer.domElement);
    };
  }, [model.glb]);

  const download = () => {
    const anchor = document.createElement("a");
    anchor.href = model.glb;
    anchor.download = `orbita-${model.jobId.slice(0, 8)}.glb`;
    anchor.click();
  };
  const screenshot = () => {
    const renderer = rendererRef.current;
    const scene = sceneRef.current;
    const camera = cameraRef.current;
    if (!renderer || !scene || !camera) return;
    renderer.render(scene, camera);
    const anchor = document.createElement("a");
    anchor.href = renderer.domElement.toDataURL("image/png");
    anchor.download = "orbita-captura.png";
    anchor.click();
  };

  return (
    <div className="relative h-full min-h-0 overflow-hidden rounded-lg border border-line bg-deep">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_50%_30%,rgba(63,224,197,0.06),transparent_55%),radial-gradient(ellipse_at_70%_85%,rgba(255,122,31,0.07),transparent_50%)]" />
      <div ref={mountRef} className="absolute inset-0 cursor-grab active:cursor-grabbing" />

      <div className="pointer-events-none absolute inset-x-0 top-0 z-10 flex items-start justify-between gap-3 p-3.5">
        <div className="pointer-events-auto flex items-center gap-2">
          <button onClick={onNewScan} className="press flex items-center gap-1.5 rounded-md border border-line bg-panel/85 px-3 py-2 text-xs font-semibold backdrop-blur">
            <IconBack size={14} /> Novo scan
          </button>
          {onDelete && <button onClick={onDelete} className="press rounded-md border border-line bg-panel/85 p-2 text-muted hover:text-danger"><IconTrash size={14} /></button>}
        </div>
        <div className="rounded-md border border-scan/40 bg-panel/90 px-3.5 py-2 text-right backdrop-blur">
          <p className="font-display text-[11px] font-bold">{meta.name}</p>
          <p className="mt-0.5 font-mono text-[9px] tracking-[0.14em] text-scan">FOTOGRAMETRIA REAL · {model.stats.registeredFrames}/{model.stats.frames} CÂMERAS</p>
        </div>
      </div>

      {(loading || error) && <div className="absolute inset-0 z-20 flex items-center justify-center bg-deep/80 font-mono text-xs tracking-wide text-scan">{error || "CARREGANDO MODELO TEXTURIZADO…"}</div>}

      <div className="pointer-events-none absolute bottom-3.5 left-3.5 z-10 hidden rounded-md border border-line bg-panel/85 px-3.5 py-2.5 font-mono text-[10px] leading-relaxed text-muted backdrop-blur sm:block">
        <p><span className="text-scan">▲</span> {model.stats.triangles.toLocaleString("pt-BR")} triângulos</p>
        <p><span className="text-accent">◫</span> {model.stats.vertices.toLocaleString("pt-BR")} vértices</p>
        <p className="text-scan">◈ malha calculada das fotos</p>
      </div>

      <div className="absolute inset-x-0 bottom-3.5 z-10 flex justify-center px-3">
        <div className="pointer-events-auto flex items-center gap-1.5 rounded-lg border border-line bg-panel/90 p-1.5 shadow-[0_10px_40px_rgba(0,0,0,0.45)] backdrop-blur">
          <button onClick={() => setAuto((value) => !value)} className={`press flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold ${auto ? "bg-scan/15 text-scan" : "text-muted"}`}>
            <IconSpin size={15} className={auto ? "anim-orbit-fast" : ""} /> Girar
          </button>
          <button onClick={download} className="press flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"><IconDownload size={15} /> GLB</button>
          <button onClick={screenshot} className="press flex items-center gap-1.5 rounded-md px-2.5 py-1.5 text-[11.5px] font-semibold text-muted hover:text-ink"><IconPhoto size={15} /> PNG</button>
          <button onClick={onNewScan} className="press flex items-center gap-1.5 rounded-md bg-accent px-3 py-1.5 text-[11.5px] font-bold text-deep"><IconRestart size={15} /> Escanear outro</button>
        </div>
      </div>
    </div>
  );
}

