import * as THREE from "three";
import type { ModelData, ProgressInfo, ScanFrame } from "./types";

/* ================= constantes ================= */
export const WORK_W = 384;
export const WORK_H = 512;
export const MODEL_H = 1.5;
export const MIN_FRAMES = 8;
export const TARGET_FRAMES = 16;
export const MAX_FRAMES = 24;
export const RELIEF_DEFAULT = 0.024;
export const RELIEF_MAX = 0.11;

const SLICE_W = 144; // fatia de cada quadro na textura (1/N da circunferência)
export const ANGLES = 96; // colunas da malha
export const ROWS = 72; // linhas da malha
const R_MAX = 0.62;
const R_MIN = 0.02;
const COVER = 1.2; // cada quadro cobre 1,2 fatias → zona curta de blend entre vizinhos

const tick = () => new Promise<void>((r) => setTimeout(r, 0));
const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const mod = (v: number, n: number) => ((v % n) + n) % n;

/* ================= captura ================= */
export function captureFromVideo(video: HTMLVideoElement): ScanFrame {
  const canvas = document.createElement("canvas");
  canvas.width = WORK_W;
  canvas.height = WORK_H;
  const ctx = canvas.getContext("2d")!;
  const vw = video.videoWidth || 1280;
  const vh = video.videoHeight || 720;
  const scale = Math.max(WORK_W / vw, WORK_H / vh);
  const dw = vw * scale;
  const dh = vh * scale;
  ctx.drawImage(video, (WORK_W - dw) / 2, (WORK_H - dh) / 2, dw, dh);
  return { canvas, url: canvas.toDataURL("image/jpeg", 0.72) };
}

export function downscale(src: HTMLCanvasElement, w: number, h: number, q = 0.72): string {
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const ctx = c.getContext("2d")!;
  const scale = Math.max(w / src.width, h / src.height);
  const dw = src.width * scale;
  const dh = src.height * scale;
  ctx.drawImage(src, (w - dw) / 2, (h - dh) / 2, dw, dh);
  return c.toDataURL("image/jpeg", q);
}

/* ================= utilidades de imagem ================= */
function getData(c: HTMLCanvasElement): ImageData {
  return c.getContext("2d", { willReadFrequently: true })!.getImageData(0, 0, c.width, c.height);
}

function meanLuma(d: ImageData): number {
  let s = 0;
  let n = 0;
  for (let i = 0; i < d.data.length; i += 16) {
    s += 0.299 * d.data[i] + 0.587 * d.data[i + 1] + 0.114 * d.data[i + 2];
    n++;
  }
  return s / Math.max(1, n);
}

/* ================= reconhecimento do objeto ================= */
interface Profile {
  hw: Float32Array; // meia-largura normalizada por linha do objeto
  vTop: number; // topo do objeto no quadro (0..1)
  vBot: number;
  ok: boolean;
  area: number; // fração do quadro ocupada
}

/**
 * Isole o objeto e descarte o cenário:
 *  1. flood-fill a partir das bordas (fundo) com tolerância adaptativa;
 *  2. o que o flood não alcança = primeiro plano;
 *  3. componentes conectados → mantém a peça principal e partes unidas a ela,
 *     descartando interferências (mãos soltas, objetos ao fundo, reflexos).
 */
function segmentObject(src: HTMLCanvasElement): { profile: Profile; maskUrl: string | null } {
  const SW = 192;
  const SH = 256;
  const N = SW * SH;
  const c = document.createElement("canvas");
  c.width = SW;
  c.height = SH;
  const ctx = c.getContext("2d", { willReadFrequently: true })!;
  ctx.drawImage(src, 0, 0, SW, SH);
  const d = ctx.getImageData(0, 0, SW, SH).data;

  // média + desvio das bordas (referência de fundo)
  let sR = 0;
  let sG = 0;
  let sB = 0;
  let s2 = 0;
  let n = 0;
  const sample = (x: number, y: number) => {
    const i = (y * SW + x) * 4;
    sR += d[i];
    sG += d[i + 1];
    sB += d[i + 2];
    s2 += d[i] * d[i] + d[i + 1] * d[i + 1] + d[i + 2] * d[i + 2];
    n++;
  };
  for (let x = 0; x < SW; x += 2) {
    sample(x, 1);
    sample(x, SH - 2);
  }
  for (let y = 0; y < SH; y += 2) {
    sample(1, y);
    sample(SW - 2, y);
  }
  const mR = sR / n;
  const mG = sG / n;
  const mB = sB / n;
  const borderStd = Math.sqrt(Math.max(0, s2 / n - (mR * mR + mG * mG + mB * mB)));
  const tol0 = clamp(2.4 * borderStd + 22, 38, 115);

  // flood-fill por similaridade local a partir das bordas
  const flood = (tol: number): Uint8Array => {
    const reached = new Uint8Array(N);
    const stack = new Int32Array(N);
    let sp = 0;
    const st2 = tol * 1.15 * (tol * 1.15);
    const t2 = tol * tol;
    const seed = (p: number) => {
      const i = p * 4;
      const dr = d[i] - mR;
      const dg = d[i + 1] - mG;
      const db = d[i + 2] - mB;
      if (dr * dr + dg * dg + db * db < st2) {
        reached[p] = 1;
        stack[sp++] = p;
      }
    };
    for (let x = 0; x < SW; x++) {
      seed(x);
      seed((SH - 1) * SW + x);
    }
    for (let y = 0; y < SH; y++) {
      seed(y * SW);
      seed(y * SW + SW - 1);
    }
    while (sp > 0) {
      const p = stack[--sp];
      const px = p % SW;
      const py = (p / SW) | 0;
      const i = p * 4;
      const cr = d[i];
      const cg = d[i + 1];
      const cb = d[i + 2];
      const grow = (q: number) => {
        if (reached[q]) return;
        const j = q * 4;
        const dr = d[j] - cr;
        const dg = d[j + 1] - cg;
        const db = d[j + 2] - cb;
        if (dr * dr + dg * dg + db * db < t2) {
          reached[q] = 1;
          stack[sp++] = q;
        }
      };
      if (px > 0) grow(p - 1);
      if (px < SW - 1) grow(p + 1);
      if (py > 0) grow(p - SW);
      if (py < SH - 1) grow(p + SW);
    }
    return reached;
  };

  let reached = flood(tol0);
  let reachedCount = 0;
  for (let i = 0; i < N; i++) reachedCount += reached[i];
  if (reachedCount < N * 0.35) reached = flood(tol0 * 1.6); // fundo com gradiente: amplia tolerância

  // rotula componentes conectados do primeiro plano
  const labels = new Int32Array(N).fill(-1);
  const comps: { area: number; minX: number; maxX: number; minY: number; maxY: number }[] = [];
  const stack2: number[] = [];
  for (let p = 0; p < N; p++) {
    if (reached[p] || labels[p] >= 0) continue;
    const id = comps.length;
    const info = { area: 0, minX: SW, maxX: 0, minY: SH, maxY: 0 };
    stack2.length = 0;
    stack2.push(p);
    labels[p] = id;
    while (stack2.length) {
      const q = stack2.pop()!;
      info.area++;
      const qx = q % SW;
      const qy = (q / SW) | 0;
      if (qx < info.minX) info.minX = qx;
      if (qx > info.maxX) info.maxX = qx;
      if (qy < info.minY) info.minY = qy;
      if (qy > info.maxY) info.maxY = qy;
      if (qx > 0 && labels[q - 1] < 0 && !reached[q - 1]) {
        labels[q - 1] = id;
        stack2.push(q - 1);
      }
      if (qx < SW - 1 && labels[q + 1] < 0 && !reached[q + 1]) {
        labels[q + 1] = id;
        stack2.push(q + 1);
      }
      if (qy > 0 && labels[q - SW] < 0 && !reached[q - SW]) {
        labels[q - SW] = id;
        stack2.push(q - SW);
      }
      if (qy < SH - 1 && labels[q + SW] < 0 && !reached[q + SW]) {
        labels[q + SW] = id;
        stack2.push(q + SW);
      }
    }
    comps.push(info);
  }

  const empty: Profile = { hw: new Float32Array(ROWS), vTop: 0, vBot: 1, ok: false, area: 0 };
  if (!comps.length) return { profile: empty, maskUrl: null };

  // peça principal + partes relevantes conectadas ao lado dela
  let main = 0;
  for (let i = 1; i < comps.length; i++) if (comps[i].area > comps[main].area) main = i;
  const M = comps[main];
  const keep = comps.map(
    (ci, i) =>
      i === main ||
      (ci.area >= 0.18 * M.area &&
        ci.minY <= M.maxY &&
        ci.maxY >= M.minY && // sobreposição vertical (ex.: alça separada)
        (ci.minX > M.maxX ? ci.minX - M.maxX : M.minX - ci.maxX) <= 14)
  );

  const mask = new Uint8Array(N);
  let area = 0;
  let minX = SW;
  let maxX = 0;
  let minY = SH;
  let maxY = 0;
  for (let p = 0; p < N; p++) {
    const l = labels[p];
    if (l >= 0 && keep[l]) {
      mask[p] = 1;
      area++;
      const x = p % SW;
      const y = (p / SW) | 0;
      if (x < minX) minX = x;
      if (x > maxX) maxX = x;
      if (y < minY) minY = y;
      if (y > maxY) maxY = y;
    }
  }

  const areaRatio = area / N;
  const bboxW = maxX - minX;
  const bboxH = maxY - minY;
  const okFlag = areaRatio >= 0.012 && areaRatio <= 0.7 && bboxH >= SH * 0.16 && bboxW >= SW * 0.05;

  // perfil de larguras → raios do hull
  const hw = new Float32Array(ROWS);
  if (okFlag) {
    for (let i = 0; i < ROWS; i++) {
      const y = Math.round(minY + (i / (ROWS - 1)) * bboxH);
      let l = -1;
      let r = -1;
      for (let x = minX; x <= maxX; x++)
        if (mask[y * SW + x]) {
          l = x;
          break;
        }
      if (l < 0) {
        hw[i] = 0.015;
        continue;
      }
      for (let x = maxX; x >= minX; x--)
        if (mask[y * SW + x]) {
          r = x;
          break;
        }
      hw[i] = clamp((r - l) / 2 / (SW / 2), 0.015, 1.08);
    }
    const tmp = new Float32Array(ROWS);
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < ROWS; i++) {
        const a = hw[Math.max(0, i - 1)];
        const b = hw[i];
        const cc = hw[Math.min(ROWS - 1, i + 1)];
        tmp[i] = (a + b * 2 + cc) / 4;
      }
      hw.set(tmp);
    }
  }

  // prova visual: máscara do quadro (fundo escurecido, objeto em evidência)
  const img = ctx.createImageData(SW, SH);
  for (let p = 0; p < N; p++) {
    const i = p * 4;
    if (mask[p]) {
      img.data[i] = 63;
      img.data[i + 1] = 224;
      img.data[i + 2] = 197;
      img.data[i + 3] = 235;
    } else {
      img.data[i] = d[i] * 0.22;
      img.data[i + 1] = d[i + 1] * 0.22;
      img.data[i + 2] = d[i + 2] * 0.22;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  if (okFlag) {
    ctx.strokeStyle = "#ff7a1f";
    ctx.lineWidth = 1.5;
    ctx.strokeRect(minX + 0.5, minY + 0.5, bboxW - 1, bboxH - 1);
  }
  const maskUrl = c.toDataURL("image/jpeg", 0.72);

  return {
    profile: { hw, vTop: minY / (SH - 1), vBot: maxY / (SH - 1), ok: okFlag, area: areaRatio },
    maskUrl,
  };
}

/* ================= pipeline principal ================= */
export async function buildModel(
  frames: ScanFrame[],
  onProgress: (info: ProgressInfo) => void
): Promise<ModelData> {
  const N = frames.length;
  const base = [0, 6, 32, 62, 82];
  const span = [6, 26, 30, 20, 18];
  const report = (step: number, frac: number, log?: string, preview?: string) =>
    onProgress({ step, p: clamp(base[step] + span[step] * frac, 0, 99), log, preview });

  /* ---- passo 0 · equalização de exposição ---- */
  const datas = frames.map((f) => getData(f.canvas));
  const means = datas.map(meanLuma);
  const target = means.reduce((a, b) => a + b, 0) / N;
  const mult = means.map((m) => clamp(target / Math.max(20, m), 0.72, 1.42));
  const avgMult = mult.reduce((a, b) => a + b, 0) / N;
  const eq = datas.map((d, fi) => {
    const m = mult[fi];
    if (Math.abs(m - 1) < 0.02) return d.data;
    const out = new Uint8ClampedArray(d.data);
    for (let i = 0; i < out.length; i += 4) {
      out[i] = d.data[i] * m;
      out[i + 1] = d.data[i + 1] * m;
      out[i + 2] = d.data[i + 2] * m;
    }
    return out;
  });
  await tick();
  report(0, 1, `exposição equalizada · luminância-alvo ${target.toFixed(0)} · ganho médio ×${avgMult.toFixed(2)}`);

  /* ---- passo 1 · reconhecimento do objeto ---- */
  const profiles: Profile[] = [];
  let maskUrl: string | null = null;
  for (let i = 0; i < N; i++) {
    const seg = segmentObject(frames[i].canvas);
    profiles.push(seg.profile);
    if (i === 0 && seg.maskUrl) {
      maskUrl = seg.maskUrl;
      report(1, 1 / N, undefined, maskUrl);
      await tick();
    }
    if (i % 4 === 3 || i === N - 1) {
      report(1, (i + 1) / N);
      await tick();
    }
  }
  const okFlags = profiles.map((p) => p.ok);
  const okCount = okFlags.filter(Boolean).length;
  const hull = okCount >= Math.max(3, Math.ceil(N * 0.4));
  if (hull) {
    const meanArea =
      profiles.filter((_, i) => okFlags[i]).reduce((a, p) => a + p.area, 0) / okCount;
    report(
      1,
      1,
      `objeto reconhecido em ${okCount}/${N} quadros · ocupa ~${Math.round(meanArea * 100)}% do quadro · interferências descartadas`
    );
  } else {
    report(
      1,
      1,
      `reconhecimento fraco (${okCount}/${N}) — fundo confuso ou peça pequena · fallback cilíndrico`
    );
  }
  // completa quadros sem reconhecimento com a média dos vizinhos
  if (hull && okCount < N) {
    for (let i = 0; i < N; i++) {
      if (profiles[i].ok) continue;
      let a = i - 1;
      let b = i + 1;
      let da = 1;
      let db = 1;
      while (!profiles[mod(a, N)].ok) {
        a--;
        da++;
      }
      while (!profiles[mod(b, N)].ok) {
        b++;
        db++;
      }
      const pa = profiles[mod(a, N)].hw;
      const pb = profiles[mod(b, N)].hw;
      const hw = new Float32Array(ROWS);
      for (let k = 0; k < ROWS; k++) hw[k] = (pa[k] * db + pb[k] * da) / (da + db);
      profiles[i] = { hw, vTop: 0, vBot: 1, ok: true, area: 0 };
    }
  }
  // extensão vertical global do objeto (mediana dos quadros válidos)
  let vTopG = 0;
  let vBotG = 1;
  if (hull) {
    const tops = profiles.filter((_, i) => okFlags[i]).map((p) => p.vTop).sort((x, y) => x - y);
    const bots = profiles.filter((_, i) => okFlags[i]).map((p) => p.vBot).sort((x, y) => x - y);
    vTopG = tops[tops.length >> 1];
    vBotG = bots[bots.length >> 1];
    report(1, 1, `peça ocupa ${Math.round((vBotG - vTopG) * 100)}% da altura · volume normalizado`);
  }

  /* ---- grade angular de raios (hull) ---- */
  const grid = new Float32Array(ANGLES * ROWS);
  if (hull) {
    for (let j = 0; j < ANGLES; j++) {
      const f = (j / ANGLES) * N;
      const i0 = Math.floor(f) % N;
      const i1 = (i0 + 1) % N;
      let t = f - Math.floor(f);
      t = t * t * (3 - 2 * t);
      const p0 = profiles[i0].hw;
      const p1 = profiles[i1].hw;
      for (let i = 0; i < ROWS; i++) grid[j * ROWS + i] = p0[i] + (p1[i] - p0[i]) * t;
    }
    const tmp = new Float32Array(ANGLES * ROWS);
    for (let pass = 0; pass < 2; pass++) {
      for (let j = 0; j < ANGLES; j++) {
        const jm = mod(j - 1, ANGLES) * ROWS;
        const jc = j * ROWS;
        const jp = mod(j + 1, ANGLES) * ROWS;
        for (let i = 0; i < ROWS; i++) {
          const im = Math.max(0, i - 1);
          const ip = Math.min(ROWS - 1, i + 1);
          tmp[jc + i] =
            (grid[jm + im] +
              grid[jm + i] * 2 +
              grid[jm + ip] +
              grid[jc + im] +
              grid[jc + i] * 4 +
              grid[jc + ip] +
              grid[jp + im] +
              grid[jp + i] * 2 +
              grid[jp + ip]) /
            16;
        }
      }
      grid.set(tmp);
    }
  } else {
    grid.fill(0.86);
  }
  let maxG = 0.12;
  for (let k = 0; k < grid.length; k++) if (grid[k] > maxG) maxG = grid[k];
  const gScale = R_MAX / maxG;
  const radius = (j: number, i: number) =>
    clamp(grid[mod(j, ANGLES) * ROWS + i] * gScale, R_MIN, R_MAX * 1.12);
  await tick();

  /* ---- passo 2 · quebra-cabeça: costura da textura 360° ---- */
  const W_T = N * SLICE_W;
  const texCanvas = document.createElement("canvas");
  texCanvas.width = W_T;
  texCanvas.height = WORK_H;
  const tctx = texCanvas.getContext("2d", { willReadFrequently: true })!;
  const out = tctx.createImageData(W_T, WORK_H);
  const op = out.data;
  const srcPerOut = WORK_W / (SLICE_W * COVER);
  const coverHalf = COVER / 2;
  const blendSample = (arr: Uint8ClampedArray, X: number, y: number, w: number, o: number) => {
    const x0 = clamp(Math.floor(X), 0, WORK_W - 1);
    const x1 = clamp(x0 + 1, 0, WORK_W - 1);
    const fx = X - x0;
    const r0 = (y * WORK_W + x0) * 4;
    const r1 = (y * WORK_W + x1) * 4;
    op[o] += (arr[r0] + (arr[r1] - arr[r0]) * fx) * w;
    op[o + 1] += (arr[r0 + 1] + (arr[r1 + 1] - arr[r0 + 1]) * fx) * w;
    op[o + 2] += (arr[r0 + 2] + (arr[r1 + 2] - arr[r0 + 2]) * fx) * w;
    op[o + 3] = 255;
  };
  for (let x = 0; x < W_T; x++) {
    const a = x / SLICE_W;
    const c0 = Math.round(a - 0.5);
    const d0 = a - (c0 + 0.5);
    const k0 = mod(c0, N);
    const s = d0 >= 0 ? 1 : -1;
    const k1 = mod(c0 + s, N);
    const d1 = d0 - s;
    // decaimento cúbico: a vista mais próxima domina a coluna → sem "fantasmas" de paralaxe
    let w0 = Math.max(0, coverHalf - Math.abs(d0)) ** 3;
    let w1 = Math.max(0, coverHalf - Math.abs(d1)) ** 3;
    const wSum = w0 + w1 || 1;
    w0 /= wSum;
    w1 /= wSum;
    const X0 = WORK_W / 2 + d0 * SLICE_W * srcPerOut;
    const X1 = WORK_W / 2 + d1 * SLICE_W * srcPerOut;
    for (let y = 0; y < WORK_H; y++) {
      const o = (y * W_T + x) * 4;
      if (w0 > 0.004) blendSample(eq[k0], X0, y, w0, o);
      if (w1 > 0.004) blendSample(eq[k1], X1, y, w1, o);
    }
    if (x % (W_T >> 3) === 0) {
      report(2, x / W_T);
      await tick();
    }
  }
  tctx.putImageData(out, 0, 0);
  report(2, 1, `quebra-cabeça montado · ${N} vistas alinhadas → faixa 360° de ${W_T}×${WORK_H} px`);
  await tick();

  const lumAt = (u: number, vTex: number) => {
    const x = clamp(Math.round(u * (W_T - 1)), 0, W_T - 1);
    const y = clamp(Math.round(vTex * (WORK_H - 1)), 0, WORK_H - 1);
    const i = (y * W_T + x) * 4;
    return (0.299 * op[i] + 0.587 * op[i + 1] + 0.114 * op[i + 2]) / 255;
  };
  const colAvg = (vTex: number) => {
    let r = 0;
    let g = 0;
    let b = 0;
    let n2 = 0;
    const y = clamp(Math.round(vTex * (WORK_H - 1)), 4, WORK_H - 5);
    for (let dx = 0; dx < 6; dx++) {
      const x0 = Math.floor(W_T * (0.15 + 0.14 * dx));
      for (let x = x0; x < x0 + 8; x++) {
        const i = (y * W_T + mod(x, W_T)) * 4;
        r += op[i];
        g += op[i + 1];
        b += op[i + 2];
        n2++;
      }
    }
    const toHex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
    return `#${toHex(r / n2)}${toHex(g / n2)}${toHex(b / n2)}`;
  };

  /* ---- passo 3 · nuvem de pontos sobre o volume ---- */
  const P_A = 150;
  const P_R = 104;
  const pPos = new Float32Array(P_A * P_R * 3);
  const pCol = new Float32Array(P_A * P_R * 3);
  let pCount = 0;
  const bilinearR = (aj: number, iF: number) => {
    const j0 = Math.floor(aj);
    const i0 = clamp(Math.floor(iF), 0, ROWS - 1);
    const j1 = j0 + 1;
    const i1 = clamp(i0 + 1, 0, ROWS - 1);
    const fj = aj - j0;
    const fi = iF - Math.floor(iF);
    const r00 = grid[mod(j0, ANGLES) * ROWS + i0];
    const r10 = grid[mod(j1, ANGLES) * ROWS + i0];
    const r01 = grid[mod(j0, ANGLES) * ROWS + i1];
    const r11 = grid[mod(j1, ANGLES) * ROWS + i1];
    return (
      clamp((r00 * (1 - fj) + r10 * fj) * (1 - fi) + (r01 * (1 - fj) + r11 * fj) * fi, R_MIN, R_MAX * 1.2) *
      gScale
    );
  };
  for (let a = 0; a < P_A; a++) {
    for (let i = 0; i < P_R; i++) {
      const u = (a + Math.random()) / P_A;
      const vObj = (i + Math.random()) / P_R;
      const r = bilinearR(u * ANGLES, vObj * (ROWS - 1)) * (1 + (Math.random() - 0.5) * 0.015);
      if (r < 0.055) continue;
      const theta = u * Math.PI * 2;
      const y = (0.5 - vObj) * MODEL_H;
      const k = pCount * 3;
      pPos[k] = Math.cos(theta) * r;
      pPos[k + 1] = y;
      pPos[k + 2] = -Math.sin(theta) * r;
      const vTex = vTopG + vObj * (vBotG - vTopG);
      const x = clamp(Math.round(u * (W_T - 1)), 0, W_T - 1);
      const yy = clamp(Math.round(vTex * (WORK_H - 1)), 0, WORK_H - 1);
      const idx = (yy * W_T + x) * 4;
      pCol[k] = op[idx] / 255;
      pCol[k + 1] = op[idx + 1] / 255;
      pCol[k + 2] = op[idx + 2] / 255;
      pCount++;
    }
    if (a % 40 === 0) report(3, a / P_A);
  }
  report(3, 1, `${pCount.toLocaleString("pt-BR")} pontos projetados na superfície reconstruída`);
  await tick();

  /* ---- passo 4 · malha texturizada + relevo ---- */
  const cols = ANGLES + 1;
  const sideVerts = cols * ROWS;
  const pos = new Float32Array(sideVerts * 3);
  const uv = new Float32Array(sideVerts * 2);
  const baseR = new Float32Array(sideVerts);
  const lum = new Float32Array(sideVerts);
  const dirX = new Float32Array(cols);
  const dirZ = new Float32Array(cols);
  for (let j = 0; j <= ANGLES; j++) {
    const theta = (j / ANGLES) * Math.PI * 2;
    dirX[j] = Math.cos(theta);
    dirZ[j] = -Math.sin(theta);
  }
  for (let j = 0; j <= ANGLES; j++) {
    const u = j / ANGLES;
    for (let i = 0; i < ROWS; i++) {
      const vObj = i / (ROWS - 1);
      const vTex = vTopG + vObj * (vBotG - vTopG);
      const r = radius(j, i);
      const l = lumAt(u, vTex);
      const rr = r + clamp((0.5 - l) * 2 * RELIEF_DEFAULT, -0.045, 0.045);
      const k = j * ROWS + i;
      pos[k * 3] = dirX[j] * rr;
      pos[k * 3 + 1] = (0.5 - vObj) * MODEL_H;
      pos[k * 3 + 2] = dirZ[j] * rr;
      uv[k * 2] = u;
      uv[k * 2 + 1] = 1 - vTex;
      baseR[k] = r;
      lum[k] = l;
    }
  }
  report(4, 0.4);
  await tick();

  // tampas (leque até o eixo) usando os anéis do volume
  const capVerts: number[] = [];
  const capUv: number[] = [];
  const capIdx: number[] = [];
  const addCap = (rowI: number, yPos: number, apexV: number, flip: boolean) => {
    const apex = sideVerts + capVerts.length / 3;
    capVerts.push(0, yPos, 0);
    capUv.push(0.5, apexV);
    const ringStart = sideVerts + capVerts.length / 3;
    for (let j = 0; j <= ANGLES; j++) {
      const u = j / ANGLES;
      const r = radius(j, rowI);
      capVerts.push(dirX[j] * r, yPos, dirZ[j] * r);
      capUv.push(u, apexV);
    }
    for (let j = 0; j < ANGLES; j++) {
      if (flip) capIdx.push(apex, ringStart + j + 1, ringStart + j);
      else capIdx.push(apex, ringStart + j, ringStart + j + 1);
    }
  };
  addCap(0, MODEL_H / 2, 1 - vTopG, false);
  addCap(ROWS - 1, -MODEL_H / 2, 1 - vBotG, true);

  const allPos = new Float32Array(sideVerts * 3 + capVerts.length);
  allPos.set(pos);
  allPos.set(capVerts, sideVerts * 3);
  const allUv = new Float32Array(sideVerts * 2 + capUv.length);
  allUv.set(uv);
  allUv.set(capUv, sideVerts * 2);

  const idx: number[] = [];
  for (let j = 0; j < ANGLES; j++) {
    for (let i = 0; i < ROWS - 1; i++) {
      const a = j * ROWS + i;
      const b = a + ROWS;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  idx.push(...capIdx);

  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(allPos, 3));
  geometry.setAttribute("uv", new THREE.BufferAttribute(allUv, 2));
  geometry.setIndex(idx);
  geometry.computeVertexNormals();

  report(
    4,
    1,
    `malha pronta · ${geometry.getAttribute("position").count.toLocaleString("pt-BR")} vértices · ${Math.round(idx.length / 3).toLocaleString("pt-BR")} triângulos`
  );

  return {
    texture: texCanvas,
    geometry,
    points: { positions: pPos, colors: pCol, count: pCount },
    capTop: hull ? colAvg(vTopG + 0.01) : colAvg(0.04),
    capBottom: hull ? colAvg(vBotG - 0.01) : colAvg(0.96),
    stats: {
      frames: N,
      vertices: geometry.getAttribute("position").count,
      triangles: Math.round(idx.length / 3),
      points: pCount,
      hull,
    },
    relief: { count: sideVerts, baseR, lum, dirX, dirZ },
  };
}

/* ================= relevo ao vivo ================= */
export function applyRelief(model: ModelData, amount: number) {
  const pos = model.geometry.getAttribute("position") as THREE.BufferAttribute;
  const { count, baseR, lum, dirX, dirZ } = model.relief;
  for (let k = 0; k < count; k++) {
    const col = k % dirX.length;
    const rr = baseR[k] + clamp((0.5 - lum[k]) * 2 * amount, -0.05, 0.05);
    pos.setXYZ(k, dirX[col] * rr, pos.getY(k), dirZ[col] * rr);
  }
  pos.needsUpdate = true;
  model.geometry.computeVertexNormals();
}
