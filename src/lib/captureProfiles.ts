import type { ScanSubject } from "./types";

export interface CapturePose {
  id: string;
  label: string;
  instruction: string;
  yaw: number;
  elevation: number;
}

export const SUBJECTS: Record<ScanSubject, { label: string; hint: string }> = {
  object: { label: "Objeto", hint: "Mantenha o objeto imóvel e mova a câmera." },
  face: { label: "Rosto", hint: "A pessoa não se move; outra pessoa movimenta a câmera." },
  body: { label: "Corpo inteiro", hint: "Enquadre pés e cabeça; a pessoa deve ficar imóvel." },
};

const directions = [
  ["frontal", 0], ["frontal direita", 45], ["lateral direita", 90], ["traseira direita", 135],
  ["traseira", 180], ["traseira esquerda", 225], ["lateral esquerda", 270], ["frontal esquerda", 315],
] as const;

function ring(prefix: string, elevation: number, instruction: string): CapturePose[] {
  return directions.map(([label, yaw], index) => ({
    id: `${prefix}-${index + 1}`,
    label: elevation > 0 ? `${label} · câmera alta` : elevation < 0 ? `${label} · câmera baixa` : label,
    instruction,
    yaw,
    elevation,
  }));
}

export const CAPTURE_PROFILES: Record<ScanSubject, CapturePose[]> = {
  object: [
    ...ring("obj-meio", 0, "Câmera na metade da altura do objeto."),
    ...ring("obj-cima", 28, "Eleve a câmera e aponte levemente para baixo."),
    ...ring("obj-baixo", -22, "Abaixe a câmera e aponte levemente para cima."),
  ],
  face: [
    ...ring("face-meio", 0, "Câmera na altura dos olhos; expressão neutra."),
    ...ring("face-cima", 20, "Câmera um pouco acima, apontada para o centro do rosto."),
    ...ring("face-baixo", -16, "Câmera um pouco abaixo; mantenha cabeça e expressão imóveis."),
  ],
  body: [
    ...ring("body-meio", 0, "Enquadre o corpo inteiro na altura da cintura."),
    ...ring("body-cima", 22, "Câmera acima do peito, mantendo pés e cabeça no quadro."),
    ...ring("body-baixo", -20, "Câmera mais baixa, mantendo o corpo inteiro no quadro."),
  ],
};
