import { WORK_W, WORK_H } from "./pipeline";
import type { ScanFrame } from "./types";

/**
 * Objeto virtual: vaso de cerâmica desenhado em canvas.
 * O padrão decorativo desloca a cada vista (simula a rotação do objeto),
 * enquanto a iluminação permanece fixa — como num turntable real.
 */
const PROF: [number, number][] = [
  [0, 34],
  [0.04, 54],
  [0.1, 70],
  [0.3, 96],
  [0.45, 86],
  [0.6, 54],
  [0.7, 42],
  [0.78, 36],
  [0.86, 41],
  [0.94, 50],
  [1, 54],
];

function profR(t: number): number {
  for (let i = 1; i < PROF.length; i++) {
    if (t <= PROF[i][0]) {
      const [t0, r0] = PROF[i - 1];
      const [t1, r1] = PROF[i];
      const u = (t - t0) / (t1 - t0);
      const s = u * u * (3 - 2 * u);
      return r0 + (r1 - r0) * s;
    }
  }
  return PROF[PROF.length - 1][1];
}

export function makeDemoFrames(count = 12): ScanFrame[] {
  const frames: ScanFrame[] = [];
  const yBot = 452;
  const yTop = 96;
  const cx = WORK_W / 2;
  const H = yBot - yTop;
  const shiftPerFrame = 192; // deslocamento do padrão por vista (fecha volta exata)

  for (let k = 0; k < count; k++) {
    const c = document.createElement("canvas");
    c.width = WORK_W;
    c.height = WORK_H;
    const g = c.getContext("2d")!;
    const shift = k * shiftPerFrame;

    // fundo liso (necessário p/ extração de silhueta)
    const bg = g.createLinearGradient(0, 0, 0, WORK_H);
    bg.addColorStop(0, "#ddd8cc");
    bg.addColorStop(1, "#c8c2b5");
    g.fillStyle = bg;
    g.fillRect(0, 0, WORK_W, WORK_H);

    // sombra suave
    g.fillStyle = "rgba(70,64,55,0.15)";
    g.beginPath();
    g.ellipse(cx + 6, yBot + 10, 104, 15, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "rgba(70,64,55,0.10)";
    g.beginPath();
    g.ellipse(cx + 3, yBot + 8, 78, 11, 0, 0, Math.PI * 2);
    g.fill();

    // corpo do vaso
    g.beginPath();
    for (let y = yBot; y >= yTop; y -= 2) {
      const t = (yBot - y) / H;
      const r = profR(t);
      if (y === yBot) g.moveTo(cx - r, y);
      else g.lineTo(cx - r, y);
    }
    for (let y = yTop; y <= yBot; y += 2) {
      const t = (yBot - y) / H;
      g.lineTo(cx + profR(t), y);
    }
    g.closePath();

    // iluminação fixa (luz à esquerda do quadro)
    const body = g.createLinearGradient(cx - 100, 0, cx + 100, 0);
    body.addColorStop(0, "#2e4552");
    body.addColorStop(0.3, "#5d8093");
    body.addColorStop(0.46, "#83a5b7");
    body.addColorStop(0.62, "#54788a");
    body.addColorStop(1, "#20343d");
    g.fillStyle = body;
    g.fill();

    // decoração que gira junto com o objeto
    g.save();
    g.clip();

    // anéis horizontais (invariantes à rotação)
    g.strokeStyle = "rgba(18,30,36,0.5)";
    g.lineWidth = 3;
    [0.14, 0.47, 0.63, 0.84].forEach((tt) => {
      const y = yBot - tt * H;
      g.beginPath();
      g.moveTo(cx - 110, y);
      g.lineTo(cx + 110, y);
      g.stroke();
    });

    // faixa de losangos claros — fase desloca com a rotação
    const bandY = yBot - 0.3 * H;
    g.fillStyle = "rgba(233,221,197,0.9)";
    const period = 192;
    for (let m = -3; m < 6; m++) {
      const xx = m * 32 + 16 - (((shift % period) + period) % period);
      if (xx < -30 || xx > WORK_W + 30) continue;
      g.save();
      g.translate(xx, bandY);
      g.rotate(Math.PI / 4);
      g.fillRect(-7, -7, 14, 14);
      g.restore();
    }

    // zigue-zague escuro na faixa superior
    const zigY = yBot - 0.72 * H;
    g.strokeStyle = "rgba(16,26,32,0.75)";
    g.lineWidth = 4;
    g.beginPath();
    const zPhase = (((shift * 0.8) % 48) + 48) % 48;
    for (let x = -48; x <= WORK_W + 48; x += 12) {
      const xx = x - zPhase;
      const up = (Math.round((x + 48) / 12) % 2 === 0) ? -6 : 6;
      if (x === -48) g.moveTo(xx, zigY + up);
      else g.lineTo(xx, zigY + up);
    }
    g.stroke();

    // motivo grande (sol raiado) — aparece só em algumas vistas
    const motifX = cx + 96 - shift;
    const wrap = ((motifX % (count * shiftPerFrame)) + count * shiftPerFrame) % (count * shiftPerFrame);
    const mx = wrap - (count * shiftPerFrame - WORK_W) / 2;
    if (mx > -70 && mx < WORK_W + 70) {
      const my = yBot - 0.52 * H;
      g.strokeStyle = "rgba(240,205,150,0.95)";
      g.lineWidth = 5;
      g.beginPath();
      g.arc(mx, my, 26, 0, Math.PI * 2);
      g.stroke();
      for (let r = 0; r < 8; r++) {
        const a = (r / 8) * Math.PI * 2;
        g.beginPath();
        g.moveTo(mx + Math.cos(a) * 34, my + Math.sin(a) * 34);
        g.lineTo(mx + Math.cos(a) * 46, my + Math.sin(a) * 46);
        g.stroke();
      }
    }
    g.restore();

    // boca do vaso
    g.fillStyle = "#243843";
    g.beginPath();
    g.ellipse(cx, yTop + 2, profR(1) + 2, 10, 0, 0, Math.PI * 2);
    g.fill();
    g.fillStyle = "#101d24";
    g.beginPath();
    g.ellipse(cx, yTop + 3, profR(1) - 9, 6.5, 0, 0, Math.PI * 2);
    g.fill();

    frames.push({ canvas: c, url: c.toDataURL("image/jpeg", 0.74) });
  }
  return frames;
}
