import type { SavedScan, ScanFrame } from "./types";
import { downscale } from "./pipeline";

const KEY = "orbita.scans.v1";
const MAX_SCANS = 6;
const STORE_W = 192;
const STORE_H = 256;

export function loadScans(): SavedScan[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as SavedScan[]) : [];
  } catch {
    return [];
  }
}

function persist(scans: SavedScan[]) {
  try {
    localStorage.setItem(KEY, JSON.stringify(scans));
  } catch {
    // sem espaço: tenta de novo guardando apenas miniaturas
    try {
      localStorage.setItem(
        KEY,
        JSON.stringify(scans.map((s) => ({ ...s, frames: [] })))
      );
    } catch {
      /* desiste silenciosamente */
    }
  }
}

export function saveScan(
  frames: ScanFrame[],
  meta: { id: string; name: string; createdAt: number; frameCount: number; demo?: boolean }
): SavedScan[] {
  const scan: SavedScan = {
    ...meta,
    thumb: downscale(frames[0].canvas, 128, 170, 0.68),
    frames: frames.map((f) => downscale(f.canvas, STORE_W, STORE_H, 0.7)),
  };
  const existing = loadScans();
  const list = [scan, ...existing.filter((s) => s.id !== scan.id)].slice(0, MAX_SCANS);
  persist(list);
  return list;
}

export function deleteScan(id: string): SavedScan[] {
  const list = loadScans().filter((s) => s.id !== id);
  persist(list);
  return list;
}

export function nextScanName(existing: SavedScan[]): string {
  const n = existing.length + 1;
  const t = new Date();
  const hh = String(t.getHours()).padStart(2, "0");
  const mm = String(t.getMinutes()).padStart(2, "0");
  return `Escaneamento ${String(n).padStart(2, "0")} · ${hh}:${mm}`;
}

export function newId(): string {
  return `scan-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;
}
