import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import Scanner from "./components/Scanner";
import Processing from "./components/Processing";
import Viewer from "./components/Viewer";
import { makeDemoFrames } from "./lib/demo";
import {
  deleteScan,
  loadScans,
  newId,
  nextScanName,
  saveScan,
} from "./lib/storage";
import type { ModelData, SavedScan, ScanFrame, ScanMeta, Stage } from "./lib/types";
import {
  IconAlert,
  IconCheck,
  IconCube,
  IconHand,
  IconInstall,
  IconOrbit,
  IconSun,
  IconTrash,
  LogoMark,
} from "./components/Icons";

/* eslint-disable @typescript-eslint/no-explicit-any */

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
}

const STEPS_RAIL = [
  { icon: <IconOrbit size={15} />, title: "Orbite o objeto", desc: "12–24 capturas ao redor" },
  { icon: <IconSun size={15} />, title: "Luz difusa", desc: "sem sombras duras" },
  { icon: <IconHand size={15} />, title: "Gire a peça", desc: "mantenha o telefone parado" },
  { icon: <IconCube size={15} />, title: "Reconstrua", desc: "hull + textura + malha" },
];

export default function App() {
  const [stage, setStage] = useState<Stage>("scan");
  const [pending, setPending] = useState<{ frames: ScanFrame[]; meta: ScanMeta } | null>(null);
  const [model, setModel] = useState<ModelData | null>(null);
  const [meta, setMeta] = useState<ScanMeta | null>(null);
  const [gallery, setGallery] = useState<SavedScan[]>(() => loadScans());
  const [toast, setToast] = useState("");
  const [demoBusy, setDemoBusy] = useState(false);
  const [installEvt, setInstallEvt] = useState<BeforeInstallPromptEvent | null>(null);
  const toastTimer = useRef<number | null>(null);

  const showToast = useCallback((msg: string) => {
    setToast(msg);
    if (toastTimer.current) window.clearTimeout(toastTimer.current);
    toastTimer.current = window.setTimeout(() => setToast(""), 3600);
  }, []);

  useEffect(() => {
    const handler = (e: Event) => {
      e.preventDefault();
      setInstallEvt(e as BeforeInstallPromptEvent);
    };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  const installApp = async () => {
    if (!installEvt) {
      showToast('No Chrome Android: menu ⋮ → "Adicionar à tela inicial".');
      return;
    }
    await installEvt.prompt();
    const choice = await installEvt.userChoice;
    if (choice.outcome === "accepted") showToast("App instalado — procure ÓRBITA na gaveta de apps.");
    setInstallEvt(null);
  };

  /* ---------------- fluxo ---------------- */
  const handleFrames = useCallback(
    (frames: ScanFrame[]) => {
      const m: ScanMeta = {
        id: newId(),
        name: nextScanName(gallery),
        createdAt: Date.now(),
        frameCount: frames.length,
      };
      setPending({ frames, meta: m });
      setStage("processing");
    },
    [gallery]
  );

  const handleDemo = useCallback(async () => {
    if (demoBusy) return;
    setDemoBusy(true);
    try {
      const frames = makeDemoFrames(12);
      const m: ScanMeta = {
        id: newId(),
        name: "Vaso cerâmico · demo",
        createdAt: Date.now(),
        frameCount: frames.length,
        demo: true,
      };
      setPending({ frames, meta: m });
      setStage("processing");
    } catch {
      showToast("Não foi possível preparar o objeto de demonstração.");
    } finally {
      setDemoBusy(false);
    }
  }, [demoBusy, showToast]);

  const handleProcessed = useCallback(
    (built: ModelData) => {
      if (!pending) return;
      // reabertura de scan já salvo: não grava de novo (evita duplicar/degradar)
      if (!gallery.some((g) => g.id === pending.meta.id)) {
        setGallery(saveScan(pending.frames, pending.meta));
      }
      setModel(built);
      setMeta(pending.meta);
      setStage("view");
    },
    [pending, gallery]
  );

  const handleProcessingError = useCallback(() => {
    setStage("scan");
    setPending(null);
    showToast("Falha ao processar os quadros. Tente capturar novamente.");
  }, [showToast]);

  const reopenScan = useCallback(
    async (scan: SavedScan) => {
      if (!scan.frames.length) {
        showToast("Este registro ficou só com a miniatura (armazenamento cheio).");
        return;
      }
      try {
        const frames: ScanFrame[] = await Promise.all(
          scan.frames.map(async (url) => {
            const img = new Image();
            await new Promise((res, rej) => {
              img.onload = res;
              img.onerror = rej;
              img.src = url;
            });
            const canvas = document.createElement("canvas");
            canvas.width = 384;
            canvas.height = 512;
            const ctx = canvas.getContext("2d")!;
            ctx.drawImage(img, 0, 0, 384, 512);
            return { canvas, url };
          })
        );
        setPending({
          frames,
          meta: { id: scan.id, name: scan.name, createdAt: scan.createdAt, frameCount: scan.frameCount || scan.frames.length, demo: scan.demo },
        });
        setStage("processing");
      } catch {
        showToast("Não foi possível reabrir este escaneamento.");
      }
    },
    [showToast]
  );

  const removeScan = (id: string) => {
    setGallery(deleteScan(id));
    showToast("Escaneamento removido da galeria.");
  };

  const handleNewScan = () => {
    setStage("scan");
    setPending(null);
    setModel(null);
    setMeta(null);
  };

  const stepState = useMemo(
    () => ({
      scan: stage === "scan" ? "active" : "done",
      proc: stage === "processing" ? "active" : stage === "view" ? "done" : "todo",
      view: stage === "view" ? "active" : "todo",
    }),
    [stage]
  );

  return (
    <div className="ambient-bg relative flex h-full min-h-[100dvh] flex-col overflow-hidden">
      <div className="blueprint-grid pointer-events-none absolute inset-0" />
      <div className="noise-overlay" />

      {/* ---------- cabeçalho ---------- */}
      <header className="relative z-20 flex items-center justify-between gap-3 border-b border-line bg-bg/70 px-4 py-3 backdrop-blur md:px-6">
        <div className="flex items-center gap-3">
          <div className="relative">
            <LogoMark size={34} />
            <span className="anim-orbit-fast absolute -right-1 -top-1 h-2 w-2 rounded-full bg-scan" style={{ transformOrigin: "-6px 20px" }} />
          </div>
          <div>
            <h1 className="font-display text-base font-black leading-none tracking-tight">
              ÓRBITA<span className="text-accent">·</span>3D
            </h1>
            <p className="mt-1 font-mono text-[9px] tracking-[0.24em] text-muted">FOTOGRAMETRIA DE BOLSO</p>
          </div>
        </div>

        <nav className="hidden items-center gap-1 lg:flex">
          {[
            { id: "scan", label: "Captura" },
            { id: "processing", label: "Reconstrução" },
            { id: "view", label: "Modelo 3D" },
          ].map((s) => (
            <span
              key={s.id}
              className={`rounded-md border px-3 py-1.5 font-mono text-[10.5px] tracking-[0.14em] transition-colors ${
                stage === s.id ? "border-accent/60 bg-accent/10 text-accent" : "border-transparent text-dim"
              }`}
            >
              {s.label.toUpperCase()}
            </span>
          ))}
        </nav>

        <div className="flex items-center gap-2">
          <span className="hidden rounded-md border border-line bg-panel px-2.5 py-1.5 font-mono text-[10px] tracking-wide text-muted md:inline-flex">
            {gallery.length}/6 locais
          </span>
          <button
            onClick={installApp}
            className="press flex items-center gap-1.5 rounded-md border border-scan/40 bg-scan/10 px-3 py-1.5 text-xs font-semibold text-scan"
          >
            <IconInstall size={15} />
            <span className="hidden sm:inline">Instalar app</span>
          </button>
        </div>
      </header>

      {/* ---------- corpo ---------- */}
      <div className="relative z-10 mx-auto flex w-full max-w-7xl flex-1 gap-4 overflow-hidden p-3 md:p-5">
        {/* trilho lateral */}
        <aside className="hidden w-72 shrink-0 flex-col gap-3 overflow-y-auto pr-1 md:flex">
          <div className="rounded-lg border border-line bg-panel/70 p-4 backdrop-blur">
            <p className="font-mono text-[9.5px] tracking-[0.24em] text-dim">PIPELINE</p>
            <ol className="mt-3 space-y-2.5">
              {[
                { id: "scan", n: "01", label: "Captura orbital" },
                { id: "processing", n: "02", label: "Reconstrução" },
                { id: "view", n: "03", label: "Modelo 3D" },
              ].map((s) => {
                const st = stepState[s.id as keyof typeof stepState];
                return (
                  <li key={s.id} className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 items-center justify-center rounded-md border font-mono text-[10px] ${
                        st === "active"
                          ? "border-accent bg-accent text-deep"
                          : st === "done"
                            ? "border-scan/50 bg-scan/10 text-scan"
                            : "border-line2 text-dim"
                      }`}
                    >
                      {st === "done" ? <IconCheck size={13} /> : s.n}
                    </span>
                    <span className={`text-sm font-semibold ${st === "todo" ? "text-dim" : ""}`}>{s.label}</span>
                    {st === "active" && <span className="ml-auto h-1.5 w-1.5 animate-pulse rounded-full bg-accent" />}
                  </li>
                );
              })}
            </ol>
          </div>

          <div className="rounded-lg border border-line bg-panel/70 p-4 backdrop-blur">
            <p className="font-mono text-[9.5px] tracking-[0.24em] text-dim">COMO CAPTURAR</p>
            <ul className="mt-3 space-y-2.5">
              {STEPS_RAIL.map((t) => (
                <li key={t.title} className="flex items-start gap-2.5">
                  <span className="mt-0.5 text-scan">{t.icon}</span>
                  <span className="min-w-0">
                    <span className="block text-[13px] font-semibold leading-tight">{t.title}</span>
                    <span className="block font-mono text-[10px] text-muted">{t.desc}</span>
                  </span>
                </li>
              ))}
            </ul>
            <p className="mt-3 rounded-md border border-scan/25 bg-scan/5 p-2.5 font-mono text-[10px] leading-relaxed text-scan">
              ◈ novo: a silhueta de cada quadro vira o volume do modelo (visual hull) — o objeto ganha forma real, visto de todos os ângulos.
            </p>
          </div>

          {/* galeria */}
          <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-line bg-panel/70 p-4 backdrop-blur">
            <div className="flex items-center justify-between">
              <p className="font-mono text-[9.5px] tracking-[0.24em] text-dim">GALERIA LOCAL</p>
              <span className="font-mono text-[10px] text-muted">{gallery.length}/6</span>
            </div>
            {gallery.length === 0 ? (
              <p className="mt-3 text-xs leading-relaxed text-dim">
                Nenhum escaneamento salvo ainda. Seu primeiro modelo aparece aqui — fica no aparelho, sem nuvem.
              </p>
            ) : (
              <ul className="mt-3 space-y-2 overflow-y-auto">
                {gallery.map((s) => (
                  <li
                    key={s.id}
                    className="group flex items-center gap-3 rounded-md border border-transparent bg-deep/50 p-2 transition-colors hover:border-line2"
                  >
                    <button onClick={() => reopenScan(s)} className="press flex min-w-0 flex-1 items-center gap-3 text-left">
                      <img src={s.thumb} alt="" className="h-12 w-9 shrink-0 rounded object-cover" />
                      <span className="min-w-0">
                        <span className="block truncate text-[12.5px] font-semibold">{s.name}</span>
                        <span className="block font-mono text-[9.5px] text-muted">
                          {s.frameCount || s.frames.length} quadros · {new Date(s.createdAt).toLocaleDateString("pt-BR")}
                          {s.demo && <span className="ml-1 text-scan">DEMO</span>}
                        </span>
                      </span>
                    </button>
                    <button
                      onClick={() => removeScan(s.id)}
                      aria-label={`Excluir ${s.name}`}
                      className="press rounded p-1.5 text-dim hover:text-danger"
                    >
                      <IconTrash size={14} />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* palco */}
        <main className="relative min-h-0 min-w-0 flex-1">
          {stage === "scan" && <Scanner onReady={handleFrames} onDemo={handleDemo} demoBusy={demoBusy} />}
          {stage === "processing" && pending && (
            <Processing frames={pending.frames} onDone={handleProcessed} onError={handleProcessingError} />
          )}
          {stage === "view" && model && meta && (
            <Viewer
              model={model}
              meta={meta}
              onNewScan={handleNewScan}
              onDelete={meta.demo ? undefined : () => removeScan(meta.id)}
            />
          )}
        </main>
      </div>

      {/* ---------- rodapé ---------- */}
      <footer className="relative z-10 flex items-center justify-between border-t border-line bg-bg/70 px-4 py-2 font-mono text-[9.5px] tracking-[0.14em] text-dim backdrop-blur md:px-6">
        <span>
          ÓRBITA · PWA <span className="text-scan">v2.0</span> · PROCESSAMENTO 100% LOCAL
        </span>
        <span className="hidden sm:inline">WEBGL · THREE.JS · VISUAL HULL</span>
      </footer>

      {/* ---------- toast ---------- */}
      {toast && (
        <div className="anim-rise fixed bottom-6 left-1/2 z-50 -translate-x-1/2">
          <div className="flex items-center gap-2.5 rounded-md border border-accent/50 bg-panel px-4 py-2.5 text-sm shadow-[0_10px_40px_rgba(0,0,0,0.5)]">
            <IconAlert size={15} className="text-accent" />
            {toast}
          </div>
        </div>
      )}
    </div>
  );
}
