import type * as THREE from "three";

/** Quadro capturado da câmera (canvas em resolução de trabalho). */
export interface ScanFrame {
  canvas: HTMLCanvasElement;
  url: string; // dataURL p/ exibição na interface
  /** Foto JPEG em resolução maior, usada pela reconstrução fotogramétrica. */
  blob?: Blob;
  width?: number;
  height?: number;
  capturedAt?: number;
  angleDeg?: number;
  elevationDeg?: number;
  poseId?: string;
  subject?: ScanSubject;
  quality?: {
    sharpness: number;
    exposure: number;
    acceptable: boolean;
  };
}

/** Dados do modelo reconstruído, prontos p/ o visualizador. */
export interface LocalModelData {
  kind: "local";
  texture: HTMLCanvasElement;
  geometry: THREE.BufferGeometry;
  points: {
    positions: Float32Array;
    colors: Float32Array;
    count: number;
  };
  capTop: string;
  capBottom: string;
  stats: {
    frames: number;
    vertices: number;
    triangles: number;
    points: number;
    hull: boolean; // silhueta detectada (visual hull) ou fallback cilíndrico
  };
  relief: {
    count: number;
    baseR: Float32Array;
    lum: Float32Array;
    dirX: Float32Array;
    dirZ: Float32Array;
  };
}

/** Modelo real gerado pelo COLMAP + OpenMVS. */
export interface PhotogrammetryModelData {
  kind: "photogrammetry";
  glb: string;
  jobId: string;
  stats: {
    frames: number;
    registeredFrames: number;
    vertices: number;
    triangles: number;
    points: number;
  };
}

export type ModelData = LocalModelData | PhotogrammetryModelData;
export type ReconstructionMode = "photogrammetry" | "local";
export type ScanSubject = "object" | "face" | "body";

export interface ScanMeta {
  id: string;
  name: string;
  createdAt: number;
  frameCount: number;
  demo?: boolean;
  mode?: ReconstructionMode;
  subject?: ScanSubject;
}

/** Registro persistido na galeria (localStorage). */
export interface SavedScan {
  id: string;
  name: string;
  createdAt: number;
  frameCount: number;
  thumb: string;
  frames: string[]; // dataURLs reduzidos (192x256)
  demo?: boolean;
}

export interface ProgressInfo {
  step: number; // índice do passo atual
  p: number; // 0..100 global
  log?: string;
  preview?: string; // dataURL da máscara de segmentação (prova visual)
}

export type Stage = "scan" | "processing" | "view";
export type ViewMode = "textura" | "malha" | "pontos";
