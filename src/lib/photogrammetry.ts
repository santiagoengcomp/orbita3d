import type { PhotogrammetryModelData, ProgressInfo, ScanFrame, ScanSubject } from "./types";

const API_ROOT = (import.meta.env.VITE_RECONSTRUCTION_API as string | undefined)?.replace(/\/$/, "") || "/api";

interface HealthResponse {
  ok: boolean;
  engines: { colmap: boolean; openmvs: boolean };
  minImages: number;
}

interface JobResponse {
  id: string;
  status: "queued" | "running" | "complete" | "failed";
  stage: string;
  progress: number;
  frames: number;
  registeredFrames: number;
  vertices?: number;
  triangles?: number;
  points?: number;
  resultUrl?: string;
  previewUrl?: string;
  error?: string;
  log?: string[];
}

function progressStep(progress: number): number {
  if (progress < 10) return 0;
  if (progress < 45) return 1;
  if (progress < 84) return 2;
  if (progress < 93) return 3;
  return 4;
}

async function responseError(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: string };
    if (body.detail) return body.detail;
  } catch {
    // resposta não JSON
  }
  return `O motor respondeu com erro ${response.status}.`;
}

async function frameBlob(frame: ScanFrame): Promise<Blob> {
  if (frame.blob) return frame.blob;
  return new Promise<Blob>((resolve, reject) =>
    frame.canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error("Não foi possível preparar uma foto."))), "image/jpeg", 0.92)
  );
}

export async function reconstructionHealth(signal?: AbortSignal): Promise<HealthResponse> {
  const response = await fetch(`${API_ROOT}/health`, { signal });
  if (!response.ok) throw new Error(await responseError(response));
  return response.json() as Promise<HealthResponse>;
}

export async function buildPhotogrammetry(
  frames: ScanFrame[],
  subject: ScanSubject,
  onProgress: (info: ProgressInfo) => void,
  signal?: AbortSignal
): Promise<PhotogrammetryModelData> {
  onProgress({ step: 0, p: 1, log: `preparando ${frames.length} fotos em alta qualidade` });
  const form = new FormData();
  form.append("scan_type", subject);
  for (let index = 0; index < frames.length; index++) {
    form.append("images", await frameBlob(frames[index]), `frame-${String(index).padStart(3, "0")}.jpg`);
  }

  onProgress({ step: 0, p: 3, log: "enviando fotos para o motor local" });
  const created = await fetch(`${API_ROOT}/jobs`, { method: "POST", body: form, signal });
  if (!created.ok) throw new Error(await responseError(created));
  const { id } = (await created.json()) as { id: string };

  let lastLog = "";
  let shownPreview = "";
  const started = Date.now();
  while (Date.now() - started < 4 * 60 * 60 * 1000) {
    await new Promise<void>((resolve, reject) => {
      const timer = window.setTimeout(resolve, 1800);
      signal?.addEventListener("abort", () => {
        window.clearTimeout(timer);
        reject(new DOMException("Cancelado", "AbortError"));
      }, { once: true });
    });
    const response = await fetch(`${API_ROOT}/jobs/${id}`, { signal });
    if (!response.ok) throw new Error(await responseError(response));
    const job = (await response.json()) as JobResponse;
    let preview: string | undefined;
    if (job.previewUrl && job.previewUrl !== shownPreview) {
      shownPreview = job.previewUrl;
      preview = job.previewUrl;
    }
    const newest = (job.log?.length ? job.log[job.log.length - 1] : "") || job.stage;
    if (newest !== lastLog) {
      lastLog = newest;
      onProgress({ step: progressStep(job.progress), p: job.progress, log: newest, preview });
    } else {
      onProgress({ step: progressStep(job.progress), p: job.progress, preview });
    }
    if (job.status === "failed") throw new Error(job.error || "A reconstrução foi interrompida.");
    if (job.status === "complete" && job.resultUrl) {
      const resultResponse = await fetch(job.resultUrl, { signal });
      if (!resultResponse.ok) throw new Error(await responseError(resultResponse));
      const glb = URL.createObjectURL(await resultResponse.blob());
      return {
        kind: "photogrammetry",
        glb,
        jobId: id,
        stats: {
          frames: job.frames,
          registeredFrames: job.registeredFrames,
          vertices: job.vertices || 0,
          triangles: job.triangles || 0,
          points: job.points || 0,
        },
      };
    }
  }
  throw new Error("A reconstrução excedeu o tempo máximo de quatro horas.");
}
