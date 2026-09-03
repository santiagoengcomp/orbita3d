import { useEffect, useRef, useState } from "react";
import type { ModelData, ProgressInfo, ReconstructionMode, ScanFrame, ScanSubject } from "../lib/types";
import { buildModel } from "../lib/pipeline";
import { buildPhotogrammetry } from "../lib/photogrammetry";
import { IconCheck } from "./Icons";

const STEPS = [
  { label: "Equalização de exposição", desc: "normaliza o brilho entre os quadros" },
  { label: "Reconhecimento do objeto", desc: "isola a peça · remove fundo e interferências" },
  { label: "Quebra-cabeça 360°", desc: "alinha e costura as vistas numa faixa contínua" },
  { label: "Nuvem de pontos", desc: "projeta amostras coloridas na superfície" },
  { label: "Malha + relevo", desc: "esculpe a forma e o micro-relevo" },
];

const REAL_STEPS = [
  { label: "Leitura das fotos", desc: "preserva resolução e detalhes para os pontos" },
  { label: "Poses das câmeras", desc: "COLMAP encontra correspondências e posições" },
  { label: "Mapa de profundidade", desc: "OpenMVS mede a superfície em várias vistas" },
  { label: "Malha 3D", desc: "conecta a nuvem densa numa superfície" },
  { label: "Textura fotográfica", desc: "projeta as fotos e exporta o arquivo GLB" },
];

interface Props {
  frames: ScanFrame[];
  mode: ReconstructionMode;
  subject: ScanSubject;
  onDone: (model: ModelData) => void;
  onError: (message?: string) => void;
}

export default function Processing({ frames, mode, subject, onDone, onError }: Props) {
  const steps = mode === "photogrammetry" ? REAL_STEPS : STEPS;
  const [step, setStep] = useState(0);
  const [p, setP] = useState(0);
  const [preview, setPreview] = useState<string | null>(null);
  const [logs, setLogs] = useState<string[]>([
    mode === "photogrammetry"
      ? `» fotogrametria real · ${frames.length} fotos · COLMAP + OpenMVS`
      : `» pipeline v3 (visual hull) · ${frames.length} quadros · 384×512`,
  ]);
  const logRef = useRef<HTMLDivElement>(null);
  const doneRef = useRef(false);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    (async () => {
      try {
        const progress = ({ step: s, p: pct, log, preview: pv }: ProgressInfo) => {
          if (cancelled) return;
          setStep(s);
          setP(Math.round(pct));
          if (pv) setPreview(pv);
          if (log) setLogs((l) => [...l.slice(-8), `» ${log}`]);
        };
        const model = mode === "photogrammetry"
          ? await buildPhotogrammetry(frames, subject, progress, controller.signal)
          : await buildModel(frames, progress);
        if (cancelled) return;
        doneRef.current = true;
        setP(100);
        setLogs((l) => [...l.slice(-8), "» reconstrução concluída — abrindo visualizador"]);
        setTimeout(() => onDone(model), 650);
      } catch (err) {
        console.error(err);
        if (!cancelled) onError(err instanceof Error ? err.message.split("\n")[0] : undefined);
      }
    })();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [frames, mode, subject, onDone, onError]);

  useEffect(() => {
    logRef.current?.scrollTo({ top: logRef.current.scrollHeight, behavior: "smooth" });
  }, [logs]);

  const R = 62;
  const C = 2 * Math.PI * R;

  return (
    <div className="flex h-full min-h-0 flex-col items-center justify-center gap-8 overflow-hidden rounded-lg border border-line bg-deep p-6">
      {/* anel de progresso */}
      <div className="relative">
        <svg width="180" height="180" viewBox="0 0 160 160">
          <circle cx="80" cy="80" r={R} fill="none" stroke="#232d39" strokeWidth="5" />
          <circle
            cx="80"
            cy="80"
            r={R}
            fill="none"
            stroke="#ff7a1f"
            strokeWidth="5"
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={C * (1 - p / 100)}
            transform="rotate(-90 80 80)"
            style={{ transition: "stroke-dashoffset 0.25s ease" }}
          />
          <circle
            cx="80"
            cy="80"
            r={R - 12}
            fill="none"
            stroke="#3fe0c5"
            strokeWidth="1"
            strokeDasharray="3 9"
            className="anim-orbit-fast"
            style={{ transformOrigin: "80px 80px" }}
            opacity="0.6"
          />
        </svg>
        <div className="absolute inset-0 flex flex-col items-center justify-center">
          <span className="font-display text-4xl font-black tabular-nums">{p}%</span>
          <span className="mt-1 font-mono text-[9px] tracking-[0.3em] text-muted">
            {doneRef.current ? "CONCLUÍDO" : "RECONSTRUINDO"}
          </span>
        </div>
      </div>

      <div className="w-full max-w-md">
        <h2 className="text-center font-display text-lg font-bold">
          Esculpindo o modelo<span className="anim-caret text-accent">_</span>
        </h2>

        {/* etapas */}
        <ol className="mt-5 space-y-2">
          {steps.map((s, i) => {
            const st = i < step || doneRef.current ? "done" : i === step ? "run" : "wait";
            return (
              <li
                key={s.label}
                className={`flex items-center gap-3 rounded-md border px-3 py-2 transition-colors duration-300 ${
                  st === "run" ? "border-accent/50 bg-accent/5" : st === "done" ? "border-line" : "border-transparent opacity-45"
                }`}
              >
                <span
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full border font-mono text-[10px] ${
                    st === "done"
                      ? "border-scan/60 bg-scan/10 text-scan"
                      : st === "run"
                        ? "border-accent bg-accent text-deep"
                        : "border-line2 text-dim"
                  }`}
                >
                  {st === "done" ? <IconCheck size={12} /> : st === "run" ? <span className="animate-pulse">●</span> : i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-semibold leading-tight">{s.label}</span>
                  <span className="block truncate font-mono text-[10px] text-muted">{s.desc}</span>
                </span>
              </li>
            );
          })}
        </ol>

        {/* máscara reconhecida + console */}
        <div className="mt-4 flex items-stretch gap-3">
          <div
            className={`flex w-24 shrink-0 flex-col items-center justify-between overflow-hidden rounded-md border transition-colors duration-500 ${
              preview ? "border-scan/50 bg-panel" : "border-line bg-panel opacity-40"
            }`}
          >
            {preview ? (
              <>
                <img src={preview} alt="Objeto reconhecido no quadro 1" className="anim-pop h-[104px] w-full object-cover" />
                <span className="w-full bg-deep/80 py-1 text-center font-mono text-[8px] tracking-[0.18em] text-scan">
                  OBJETO ISOLADO
                </span>
              </>
            ) : (
              <span className="px-2 py-3 text-center font-mono text-[8px] tracking-[0.18em] text-dim">
                AGUARDANDO
                <br />
                RECONHECIMENTO
              </span>
            )}
          </div>
          <div ref={logRef} className="h-28 min-w-0 flex-1 overflow-y-auto rounded-md border border-line bg-panel p-3 font-mono text-[11px] leading-relaxed">
            {logs.map((l, i) => (
              <p key={i} className={i === logs.length - 1 ? "text-scan" : "text-muted"}>
                {l}
              </p>
            ))}
            <span className="anim-caret text-accent">▮</span>
          </div>
        </div>
      </div>
    </div>
  );
}
