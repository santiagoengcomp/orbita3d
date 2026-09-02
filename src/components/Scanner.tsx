import { useCallback, useEffect, useRef, useState } from "react";
import type { ScanFrame } from "../lib/types";
import { captureFromVideo, MAX_FRAMES, MIN_FRAMES, TARGET_FRAMES } from "../lib/pipeline";
import { IconAlert, IconLayers, IconOrbit, IconShutter, IconTrash, IconX } from "./Icons";

type CamState = "starting" | "live" | "error";

const TIPS = [
  "O fundo é removido automaticamente — o app isola só o objeto.",
  "Mantenha a mesma distância ao orbitar o objeto.",
  "Luz difusa e uniforme revela mais relevo na malha.",
  "Gire devagar: 30° entre cada captura é o ideal.",
  "Centralize o objeto e enquadre ele por inteiro.",
  "Evite reflexos fortes e objetos encostados na peça.",
];

interface Props {
  onReady: (frames: ScanFrame[]) => void;
  onDemo: () => void;
  demoBusy: boolean;
}

export default function Scanner({ onReady, onDemo, demoBusy }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const burstRef = useRef<number | null>(null);
  const [cam, setCam] = useState<CamState>("starting");
  const [camMsg, setCamMsg] = useState("");
  const [frames, setFrames] = useState<ScanFrame[]>([]);
  const [flashKey, setFlashKey] = useState(0);
  const [sweepKey, setSweepKey] = useState(-1);
  const [tipIdx, setTipIdx] = useState(0);
  const [res, setRes] = useState("");
  const framesRef = useRef<ScanFrame[]>([]);
  framesRef.current = frames;
  const insecure = typeof window !== "undefined" && !window.isSecureContext;

  /* ---------------- câmera ---------------- */
  const start = useCallback(async () => {
    setCam("starting");
    try {
      if (!navigator.mediaDevices?.getUserMedia) throw new Error("incompatível");
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      streamRef.current = stream;
      const v = videoRef.current;
      if (v) {
        v.srcObject = stream;
        await v.play().catch(() => {});
        setRes(`${v.videoWidth || 1280}×${v.videoHeight || 720}`);
      }
      setCam("live");
    } catch (e) {
      const err = e as DOMException;
      setCamMsg(
        !window.isSecureContext
          ? "Conexão não segura: o navegador só libera a câmera em páginas HTTPS (ou localhost)."
          : err?.name === "NotAllowedError"
            ? "Permissão de câmera negada. Libere o acesso nas configurações do navegador."
            : err?.name === "NotFoundError"
              ? "Nenhuma câmera encontrada neste dispositivo."
              : "Não foi possível abrir a câmera neste contexto."
      );
      setCam("error");
    }
  }, []);

  useEffect(() => {
    start();
    return () => {
      streamRef.current?.getTracks().forEach((t) => t.stop());
      if (burstRef.current) window.clearInterval(burstRef.current);
    };
  }, [start]);

  useEffect(() => {
    const t = window.setInterval(() => setTipIdx((i) => i + 1), 4200);
    return () => window.clearInterval(t);
  }, []);

  /* ---------------- captura ---------------- */
  const capture = useCallback(() => {
    const v = videoRef.current;
    if (!v || cam !== "live") return;
    if (framesRef.current.length >= MAX_FRAMES) return;
    const frame = captureFromVideo(v);
    setFrames((f) => (f.length >= MAX_FRAMES ? f : [...f, frame]));
    setFlashKey((k) => k + 1);
    setSweepKey((k) => k + 1);
    if ("vibrate" in navigator) navigator.vibrate?.(28);
  }, [cam]);

  const burstStart = useCallback(() => {
    if (cam !== "live") return;
    capture();
    burstRef.current = window.setInterval(() => {
      if (framesRef.current.length >= MAX_FRAMES) {
        if (burstRef.current) window.clearInterval(burstRef.current);
        burstRef.current = null;
        return;
      }
      capture();
    }, 720);
  }, [cam, capture]);

  const burstStop = useCallback(() => {
    if (burstRef.current) {
      window.clearInterval(burstRef.current);
      burstRef.current = null;
    }
  }, []);

  const removeFrame = (i: number) => setFrames((f) => f.filter((_, j) => j !== i));

  const canProcess = frames.length >= MIN_FRAMES;

  /* ---------------- anel orbital do obturador ---------------- */
  const ringTicks = Array.from({ length: TARGET_FRAMES }, (_, i) => {
    const a = (i / TARGET_FRAMES) * Math.PI * 2 - Math.PI / 2;
    const r1 = 40,
      r2 = 46;
    return {
      x1: 52 + Math.cos(a) * r1,
      y1: 52 + Math.sin(a) * r1,
      x2: 52 + Math.cos(a) * r2,
      y2: 52 + Math.sin(a) * r2,
      done: i < frames.length,
      next: i === frames.length,
    };
  });

  return (
    <div className="relative flex h-full min-h-0 flex-col overflow-hidden rounded-lg border border-line bg-deep">
      {/* ---------- visor ---------- */}
      <div className="relative min-h-0 flex-1 overflow-hidden">
        <video ref={videoRef} playsInline muted autoPlay className="absolute inset-0 h-full w-full object-cover" />

        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(ellipse_at_center,transparent_52%,rgba(6,8,11,0.55)_100%)]" />

        {flashKey > 0 && (
          <div key={flashKey} className="anim-flash pointer-events-none absolute inset-0 z-20 bg-white/80" />
        )}

        {sweepKey >= 0 && (
          <div key={`sw-${sweepKey}`} className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
            <div className="anim-sweep absolute inset-x-0 top-0 h-[9%] bg-gradient-to-b from-transparent via-scan/35 to-transparent shadow-[0_0_40px_rgba(63,224,197,0.25)]" />
          </div>
        )}

        <div className="hud-corner left-3 top-3 rounded-tl border-l-2 border-t-2" />
        <div className="hud-corner right-3 top-3 rounded-tr border-r-2 border-t-2" />
        <div className="hud-corner bottom-3 left-3 rounded-bl border-b-2 border-l-2" />
        <div className="hud-corner bottom-3 right-3 rounded-br border-b-2 border-r-2" />

        <div className="absolute inset-x-0 top-0 z-10 flex items-center justify-between px-4 py-2.5 font-mono text-[10px] tracking-[0.14em] text-ink/85">
          <div className="flex items-center gap-2">
            <span className={`inline-block h-2 w-2 rounded-full ${cam === "live" ? "animate-pulse bg-danger" : "bg-dim"}`} />
            <span>{cam === "live" ? "VISOR ATIVO" : cam === "starting" ? "INICIANDO…" : "SEM SINAL"}</span>
          </div>
          <div className="flex items-center gap-3 text-muted">
            <span>{res || "———"}</span>
            <span className="hidden text-scan sm:inline">3:4 · 384×512</span>
          </div>
        </div>

        {/* retícula orbital */}
        <svg
          className="pointer-events-none absolute left-1/2 top-1/2 z-10 h-40 w-40 -translate-x-1/2 -translate-y-1/2 text-ink/50"
          viewBox="0 0 160 160"
          fill="none"
          stroke="currentColor"
        >
          <circle
            cx="80"
            cy="80"
            r="52"
            strokeWidth="1"
            strokeDasharray="4 7"
            className="anim-orbit"
            style={{ transformOrigin: "80px 80px" }}
          />
          <circle cx="80" cy="80" r="2.4" fill="currentColor" stroke="none" />
          <path d="M80 62v12M80 86v12M62 80h12M86 80h12" strokeWidth="1.2" />
          <path d="M80 20v10M80 130v10M20 80h10M130 80h10" strokeWidth="1" opacity="0.6" />
        </svg>

        {/* contador gigante */}
        <div className="pointer-events-none absolute right-4 top-1/2 z-10 hidden -translate-y-1/2 text-right sm:block">
          <div className="font-display text-6xl font-black leading-none tabular-nums text-ink/90">
            {String(frames.length).padStart(2, "0")}
          </div>
          <div className="mt-1 font-mono text-[10px] tracking-[0.3em] text-muted">/ {TARGET_FRAMES} QUADROS</div>
        </div>

        {/* dica rotativa */}
        <div className="absolute inset-x-0 bottom-2 z-10 flex justify-center px-6">
          <p
            key={tipIdx}
            className="anim-rise max-w-md truncate rounded-full border border-line bg-deep/70 px-4 py-1.5 text-center font-mono text-[10.5px] tracking-wide text-muted backdrop-blur-sm"
          >
            <span className="mr-2 text-scan">◆</span>
            {TIPS[tipIdx % TIPS.length]}
          </p>
        </div>

        {/* estados: iniciando / erro */}
        {cam === "starting" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-4 bg-deep">
            <div className="relative h-16 w-16">
              <div className="absolute inset-0 rounded-full border-2 border-line" />
              <div className="anim-orbit-fast absolute inset-0 rounded-full border-2 border-transparent border-t-accent" />
            </div>
            <p className="font-mono text-xs tracking-[0.2em] text-muted">SOLICITANDO CÂMERA…</p>
          </div>
        )}

        {cam === "error" && (
          <div className="absolute inset-0 z-30 flex flex-col items-center justify-center gap-5 bg-deep px-8 text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-md border border-danger/40 bg-danger/10 text-danger">
              <IconAlert size={26} />
            </div>
            <div>
              <p className="font-display text-sm font-bold tracking-wide">Câmera indisponível</p>
              <p className="mx-auto mt-2 max-w-xs text-sm leading-relaxed text-muted">{camMsg}</p>
              {insecure && (
                <div className="mx-auto mt-3 max-w-sm rounded-md border border-scan/30 bg-scan/5 p-3 text-left">
                  <p className="font-mono text-[11px] tracking-wide text-scan">
                    endereço atual → {window.location.host} (http)
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-muted">
                    No celular, abra uma URL <b className="text-ink">https://</b>: crie um túnel com{" "}
                    <span className="font-mono text-[10.5px] text-ink/90">npx cloudflared tunnel --url http://localhost:5173</span>{" "}
                    ou publique a pasta <span className="font-mono text-[10.5px] text-ink/90">dist/</span> na Vercel/Netlify.
                  </p>
                </div>
              )}
            </div>
            <div className="flex flex-col gap-2.5 sm:flex-row">
              <button
                onClick={start}
                className="press rounded-md border border-line bg-panel px-5 py-2.5 text-sm font-semibold hover:border-accent/60"
              >
                Tentar novamente
              </button>
              <button
                onClick={onDemo}
                disabled={demoBusy}
                className="press rounded-md bg-accent px-5 py-2.5 text-sm font-bold text-deep disabled:opacity-60"
              >
                {demoBusy ? "Preparando…" : "Usar objeto de demonstração"}
              </button>
            </div>
          </div>
        )}
      </div>

      {/* ---------- controles ---------- */}
      <div className="shrink-0 border-t border-line bg-panel/80 px-4 py-4 backdrop-blur">
        <div className="mx-auto flex max-w-2xl items-center justify-between gap-3">
          {/* lixeira + contagem */}
          <div className="flex w-28 flex-col items-start gap-1.5">
            <button
              onClick={() => setFrames([])}
              disabled={frames.length === 0}
              className="press flex items-center gap-1.5 rounded-md border border-line px-2.5 py-1.5 font-mono text-[10.5px] tracking-wide text-muted hover:text-danger disabled:opacity-40"
            >
              <IconTrash size={13} />
              LIMPAR
            </button>
            <span className="font-mono text-[10px] tracking-[0.18em] text-dim sm:hidden">
              {frames.length}/{TARGET_FRAMES}
            </span>
          </div>

          {/* obturador com anel de progresso */}
          <div className="relative">
            <svg width="104" height="104" viewBox="0 0 104 104" className="absolute -inset-[13px]">
              {ringTicks.map((t, i) => (
                <line
                  key={i}
                  x1={t.x1}
                  y1={t.y1}
                  x2={t.x2}
                  y2={t.y2}
                  stroke={t.done ? "#3FE0C5" : t.next ? "#FF7A1F" : "#2e3a48"}
                  strokeWidth={t.next ? 3 : 2}
                  strokeLinecap="round"
                  className={t.next && frames.length < TARGET_FRAMES ? "anim-tick" : ""}
                />
              ))}
            </svg>
            <button
              onPointerDown={burstStart}
              onPointerUp={burstStop}
              onPointerLeave={burstStop}
              onPointerCancel={burstStop}
              disabled={cam !== "live" || frames.length >= MAX_FRAMES}
              aria-label="Capturar quadros (segure para rajada)"
              className={`press relative flex h-[78px] w-[78px] items-center justify-center rounded-full border-4 bg-panel text-ink shadow-[0_6px_30px_rgba(255,122,31,0.25)] disabled:opacity-40 ${
                frames.length > 0 ? "anim-ring-pulse border-accent" : "border-line2"
              }`}
            >
              <IconShutter size={30} className="text-accent" />
            </button>
          </div>

          {/* processar */}
          <div className="flex w-28 flex-col items-end gap-1.5">
            <button
              onClick={() => canProcess && onReady(frames)}
              disabled={!canProcess}
              className={`press flex items-center gap-2 rounded-md px-3.5 py-2 text-sm font-bold ${
                canProcess ? "bg-accent text-deep shadow-[0_4px_24px_rgba(255,122,31,0.4)]" : "cursor-not-allowed bg-panel2 text-dim"
              }`}
            >
              <IconLayers size={16} />
              <span className="hidden sm:inline">Modelar</span>
            </button>
            <span className="text-right font-mono text-[10px] tracking-wide text-dim">
              {canProcess ? "pronto p/ reconstruir" : `mín. ${MIN_FRAMES} quadros`}
            </span>
          </div>
        </div>

        {/* filme de quadros */}
        <div className="mx-auto mt-3.5 max-w-2xl">
          <div className="flex gap-2 overflow-x-auto pb-1">
            {frames.length === 0 ? (
              <p className="w-full py-1 text-center font-mono text-[11px] tracking-wide text-dim">
                Toque no obturador e gire <IconOrbit size={12} className="mb-0.5 inline text-scan" /> o objeto — segure para rajada contínua.
              </p>
            ) : (
              frames.map((f, i) => (
                <div key={i} className="anim-pop group relative shrink-0">
                  <img src={f.url} alt={`quadro ${i + 1}`} className="h-16 w-12 rounded border border-line object-cover" />
                  <button
                    onClick={() => removeFrame(i)}
                    aria-label={`Remover quadro ${i + 1}`}
                    className="press absolute -right-1.5 -top-1.5 hidden h-5 w-5 items-center justify-center rounded-full bg-danger text-white group-hover:flex"
                  >
                    <IconX size={11} />
                  </button>
                  <span className="absolute bottom-0.5 left-1 font-mono text-[8.5px] text-white/80">{String(i + 1).padStart(2, "0")}</span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
