import * as THREE from "three";
import type { ModelData, ProgressInfo, ScanFrame } from "./types";

/* ================= constantes ================= */
export const WORK_W = 384;
export const WORK_H = 512;
export const MODEL_H = 1.5;
export const MIN_FRAMES = 8;
export const TARGET_FRAMES = 16;
export const MAX_FRAMES = 24;
export const RELIEF_DEFAULT = 0.05;
export const RELIEF_MAX = 0.11;

const SLICE_W = 144; // fatia de cada quadro na textura (1/N da circunferência)
export const ANGLES = 96; // colunas da malha
export const ROWS = 72; // linhas da malha
const R_MAX = 0.62;
const R_MIN = 0.02;
const COVER = 1.35; // cada quadro cobre 1,35 fatias → zona de blend entre vizinhos

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

/* ================= silhueta (visual hull) ================= */
interface Profile {
  hw: Float32Array; // meia-largura normalizada por linha do objeto
  vTop: number; // topo do objeto no quadro (0..1)
  vBot: number;
  ok: boolean;
  spanRows: number;
}

function extractProfile(d: ImageData): Profile {
  const W = d.width;
  const H = d.height;
  const px = d.data;

  // cor de fundo: mediana da borda do quadro
  const eR: number[] = [];
  const eG: number[] = [];
  const eB: number[] = [];
  const push = (x: number, y: number) => {
    const i = (y * W + x) * 4;
    eR.push(px[i]);
    eG.push(px[i + 1]);
    eB.push(px[i + 2]);
  };
  for (let x = 0; x < W; x += 4) {
    push(x, 2);
    push(x, H - 3);
  }
  for (let y = 0; y < H; y += 4) {
    push(2, y);
    push(W - 3, y);
  }
  const med = (a: number[]) => {
    a.sort((p, q) => p - q);
    return a[a.length >> 1];
  };
  const bR = med(eR);
  const bG = med(eG);
  const bB = med(eB);

  // varredura por linha: pixels que divergem do fundo
  const rowL = new Int32Array(H).fill(-1);
  const rowR = new Int32Array(H).fill(-1);
  for (let y = 0; y < H; y++) {
    let l = -1;
    let r = -1;
    let cnt = 0;
    const off = y * W * 4;
    for (let x = 0; x < W; x++) {
      const i = off + x * 4;
      const dr = px[i] - bR;
      const dg = px[i + 1] - bG;
      const db = px[i + 2] - bB;
      const dist = Math.sqrt(dr * dr + dg * dg + db * db);
      const ch = Math.abs(dr - dg) + Math.abs(dg - db) + Math.abs(db - dr);
      // sombra neutra (dist média + cromática baixa) é ignorada
      if (dist > 85 || (dist > 45 && ch > 24)) {
        if (l < 0) l = x;
        r = x;
        cnt++;
      }
    }
    if (cnt >= 4) {
      rowL[y] = l;
      rowR[y] = r;
    }
  }

  let firstY = -1;
  let lastY = -1;
  let spanRows = 0;
  for (let y = 0; y < H; y++) {
    if (rowL[y] >= 0) {
      if (firstY < 0) firstY = y;
      lastY = y;
      spanRows++;
    }
  }
  if (firstY < 0 || lastY - firstY < H * 0.1 || spanRows < (lastY - firstY) * 0.5) {
    return { hw: new Float32Array(ROWS), vTop: 0, vBot: 1, ok: false, spanRows };
  }

  // meia-largura em ROWS amostras ao longo do objeto
  const hw = new Float32Array(ROWS);
  const halfW = W / 2;
  for (let i = 0; i < ROWS; i++) {
    const y = Math.round(firstY + (i / (ROWS - 1)) * (lastY - firstY));
    hw[i] = rowL[y] >= 0 ? clamp((rowR[y] - rowL[y]) / 2 / halfW, 0, 1.08) : -1;
  }
  // interpola lacunas
  for (let i = 0; i < ROWS; i++) {
    if (hw[i] < 0) {
      let a = i - 1;
      let b = i + 1;
      while (a >= 0 && hw[a] < 0) a--;
      while (b < ROWS && hw[b] < 0) b++;
      const va = a >= 0 ? hw[a] : 0;
      const vb = b < ROWS ? hw[b] : 0;
      hw[i] = a >= 0 && b < ROWS ? va + ((vb - va) * (i - a)) / (b - a) : a >= 0 ? va : vb;
    }
  }
  // suaviza na vertical
  const tmp = new Float32Array(ROWS);
  for (let pass = 0; pass < 2; pass++) {
    for (let i = 0; i < ROWS; i++) {
      const a = hw[Math.max(0, i - 1)];
      const b = hw[i];
      const c = hw[Math.min(ROWS - 1, i + 1)];
      tmp[i] = (a + b * 2 + c) / 4;
    }
    hw.set(tmp);
  }
  return { hw, vTop: firstY / (H - 1), vBot: lastY / (H - 1), ok: true, spanRows };
}

/* ================= pipeline principal ================= */
export async function buildModel(
  frames: ScanFrame[],
  onProgress: (info: ProgressInfo) => void
): Promise<ModelData> {
  const N = frames.length;
  const base = [0, 6, 32, 62, 82];
  const span = [6, 26, 30, 20, 18];
  const report = (step: number, frac: number, log?: string) =>
    onProgress({ step, p: clamp(base[step] + span[step] * frac, 0, 99), log });

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

  /* ---- passo 1 · silhuetas ---- */
  const profiles: Profile[] = [];
  for (let i = 0; i < N; i++) {
    profiles.push(extractProfile(datas[i]));
    if (i % 4 === 3 || i === N - 1) {
      report(1, (i + 1) / N);
      await tick();
    }
  }
  const okFlags = profiles.map((p) => p.ok);
  const okCount = okFlags.filter(Boolean).length;
  const hull = okCount >= Math.max(3, Math.ceil(N * 0.4));
  if (hull) {
    report(1, 1, `silhueta isolada em ${okCount}/${N} quadros · visual hull ativo`);
  } else {
    report(1, 1, `silhueta em apenas ${okCount}/${N} quadros — fallback cilíndrico (use fundo liso)`);
  }
  // completa quadros sem silhueta com a média dos vizinhos
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
      profiles[i] = { hw, vTop: 0, vBot: 1, ok: true, spanRows: 0 };
    }
  }
  // extensão vertical global do objeto (mediana dos quadros válidos)
  let vTopG = 0;
  let vBotG = 1;
  if (hull) {
    const tops = profiles.filter((_, i) => okFlags[i]).map((p) => p.vTop).sort((a, b) => a - b);
    const bots = profiles.filter((_, i) => okFlags[i]).map((p) => p.vBot).sort((a, b) => a - b);
    vTopG = tops[tops.length >> 1];
    vBotG = bots[bots.length >> 1];
    report(1, 1, `objeto ocupa ${Math.round((vBotG - vTopG) * 100)}% da altura do quadro`);
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
            (grid[jm + im] + grid[jm + i] * 2 + grid[jm + ip] + grid[jc + im] + grid[jc + i] * 4 + grid[jc + ip] + grid[jp + im] + grid[jp + i] * 2 + grid[jp + ip]) / 16;
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
  const radius = (j: number, i: number) => clamp(grid[mod(j, ANGLES) * ROWS + i] * gScale, R_MIN, R_MAX * 1.12);
  await tick();

  /* ---- passo 2 · costura da textura 360° ---- */
  const W_T = N * SLICE_W;
  const texCanvas = document.createElement("canvas");
  texCanvas.width = W_T;
  texCanvas.height = WORK_H;
  const tctx = texCanvas.getContext("2d", { willReadFrequently: true })!;
  const out = tctx.createImageData(W_T, WORK_H);
  const op = out.data;
  const srcPerOut = WORK_W / (SLICE_W * COVER); // px de origem por px de saída
  const coverHalf = COVER / 2; // meia-cobertura em fatias
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
    const a = x / SLICE_W; // índice contínuo de fatia
    const c0 = Math.round(a - 0.5); // centro de quadro mais próximo
    const d0 = a - (c0 + 0.5);
    const k0 = mod(c0, N);
    const s = d0 >= 0 ? 1 : -1;
    const k1 = mod(c0 + s, N);
    const d1 = d0 - s;
    let w0 = Math.max(0, coverHalf - Math.abs(d0));
    let w1 = Math.max(0, coverHalf - Math.abs(d1));
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
  report(2, 1, `textura costurada ${W_T}×${WORK_H} px · blend de ${N} vistas`);
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
    let n = 0;
    const y = clamp(Math.round(vTex * (WORK_H - 1)), 4, WORK_H - 5);
    for (let dx = 0; dx < 6; dx++) {
      for (let x = Math.floor(W_T * (0.15 + 0.14 * dx)); x < Math.floor(W_T * (0.15 + 0.14 * dx)) + 8; x++) {
        const i = (y * W_T + mod(x, W_T)) * 4;
        r += op[i];
        g += op[i + 1];
        b += op[i + 2];
        n++;
      }
    }
    const toHex = (v: number) => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, "0");
    return `#${toHex(r / n)}${toHex(g / n)}${toHex(b / n)}`;
  };

  /* ---- passo 3 · nuvem de pontos sobre o hull ---- */
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
    return clamp((r00 * (1 - fj) + r10 * fj) * (1 - fi) + (r01 * (1 - fj) + r11 * fj) * fi, R_MIN, R_MAX * 1.2) * gScale;
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
  report(3, 1, `${pCount.toLocaleString("pt-BR")} pontos projetados na superfície do hull`);
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
      const rr = r + (0.5 - l) * 2 * RELIEF_DEFAULT;
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

  // tampas (leque até o eixo) usando os anéis do hull
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
    const rr = baseR[k] + (0.5 - lum[k]) * 2 * amount;
    pos.setXYZ(k, dirX[col] * rr, pos.getY(k), dirZ[col] * rr);
  }
  pos.needsUpdate = true;
  model.geometry.computeVertexNormals();
}
