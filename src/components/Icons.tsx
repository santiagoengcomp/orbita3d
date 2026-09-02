import type { SVGProps } from "react";

type P = SVGProps<SVGSVGElement> & { size?: number };

function base({ size = 20, ...props }: P) {
  return {
    width: size,
    height: size,
    viewBox: "0 0 24 24",
    fill: "none",
    stroke: "currentColor",
    strokeWidth: 1.7,
    strokeLinecap: "round" as const,
    strokeLinejoin: "round" as const,
    ...props,
  };
}

/** Logotipo: cubo + órbita */
export function LogoMark({ size = 30, ...props }: P) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" fill="none" {...props}>
      <path
        d="M16 5.5 25 10.7v10.6L16 26.5 7 21.3V10.7L16 5.5Z"
        stroke="#FF7A1F"
        strokeWidth="1.9"
        strokeLinejoin="round"
      />
      <path d="M16 16v10.5M16 16 25 10.7M16 16 7 10.7" stroke="#FF7A1F" strokeWidth="1.5" opacity="0.75" />
      <path
        d="M3.2 19.4c-1.6-2.8 3-7 10.2-8.4 7.2-1.3 12.4.6 12 3.4-.3 2.4-4.3 4.9-9.7 5.9"
        stroke="#3FE0C5"
        strokeWidth="1.7"
        strokeLinecap="round"
      />
      <circle cx="15.7" cy="20.4" r="1.9" fill="#3FE0C5" />
    </svg>
  );
}

export function IconShutter(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="9.2" />
      <path d="M12 2.8v6M20 7.6l-5.2 3M21.2 15l-5.9-1.8M15.4 20.4l-3.6-4.9M7 20.5l2.2-5.7M2.9 13.7l6-.4M4.9 6.1l4.6 3.7" />
    </svg>
  );
}

export function IconCube(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 2.7 20.5 7.6v8.8L12 21.3 3.5 16.4V7.6L12 2.7Z" />
      <path d="M12 12v9.3M12 12l8.5-4.9M12 12 3.5 7.1" />
    </svg>
  );
}

export function IconPoints(p: P) {
  return (
    <svg {...base(p)} strokeWidth={0} fill="currentColor">
      <circle cx="6" cy="6" r="1.7" />
      <circle cx="12" cy="4.4" r="1.4" />
      <circle cx="18" cy="6.6" r="1.7" />
      <circle cx="4.6" cy="12" r="1.4" />
      <circle cx="10" cy="10.6" r="1.7" />
      <circle cx="15.6" cy="12.2" r="1.3" />
      <circle cx="20" cy="11" r="1.2" />
      <circle cx="7" cy="17" r="1.6" />
      <circle cx="12.6" cy="16" r="1.3" />
      <circle cx="17.6" cy="17.6" r="1.6" />
      <circle cx="9.6" cy="20.6" r="1.2" />
      <circle cx="15" cy="20.2" r="1.4" />
    </svg>
  );
}

export function IconWire(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M3 18.5 8.2 5.5l5 8 3.4-4.6L21 18.5H3Z" />
      <path d="M8.2 5.5 10.4 18.5M13.2 13.5l-2.8 5M16.6 8.9l-1.4 9.6" opacity="0.7" />
    </svg>
  );
}

export function IconDownload(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.5v10.2M7.8 9.9l4.2 4.2 4.2-4.2" />
      <path d="M4.5 15.5v3a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-3" />
    </svg>
  );
}

export function IconPhoto(p: P) {
  return (
    <svg {...base(p)}>
      <rect x="3.5" y="5" width="17" height="14" rx="2" />
      <circle cx="9" cy="10" r="1.6" />
      <path d="m5 17.5 4.6-4.4 3.2 3 2.8-2.4 3.9 3.8" />
    </svg>
  );
}

export function IconTrash(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4.5 6.5h15M9.5 6V4.8A1.3 1.3 0 0 1 10.8 3.5h2.4a1.3 1.3 0 0 1 1.3 1.3V6.5" />
      <path d="M6.3 6.5 7 18.7a1.8 1.8 0 0 0 1.8 1.8h6.4a1.8 1.8 0 0 0 1.8-1.8l.7-12.2" />
      <path d="M10 10.5v6M14 10.5v6" />
    </svg>
  );
}

export function IconRestart(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M4.6 12a7.4 7.4 0 1 1 2.2 5.3" />
      <path d="M4.4 17.6v-4.4h4.4" />
    </svg>
  );
}

export function IconOrbit(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3.4" />
      <path d="M20.3 8.6c1.5 2.7-1.8 7.2-7.4 9.3-5.6 2-10.4.7-10.6-2.2" opacity="0.85" />
      <circle cx="19.3" cy="6.4" r="1.3" fill="currentColor" strokeWidth={0} />
    </svg>
  );
}

export function IconCheck(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m4.5 12.8 4.6 4.7L19.5 6.6" />
    </svg>
  );
}

export function IconX(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m6 6 12 12M18 6 6 18" />
    </svg>
  );
}

export function IconBack(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M14.5 5.5 8 12l6.5 6.5" />
    </svg>
  );
}

export function IconInstall(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 3.5v9M8.4 9l3.6 3.6L15.6 9" />
      <path d="M5 14.5v3.2a2.3 2.3 0 0 0 2.3 2.3h9.4a2.3 2.3 0 0 0 2.3-2.3v-3.2" />
      <path d="M9 22.2h6" opacity="0.6" />
    </svg>
  );
}

export function IconSun(p: P) {
  return (
    <svg {...base(p)}>
      <circle cx="12" cy="12" r="3.8" />
      <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" />
    </svg>
  );
}

export function IconHand(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M8.5 11.5V5.8a1.5 1.5 0 0 1 3 0v4.9" />
      <path d="M11.5 10V4.6a1.5 1.5 0 0 1 3 0V10" />
      <path d="M14.5 10.4V6.2a1.5 1.5 0 0 1 3 0v7.3c0 4-2.6 7-6.4 7-3.2 0-4.7-1.7-6.6-5.2-.5-.9-.2-1.9.6-2.4.8-.4 1.7-.2 2.3.5l1.1 1.4" />
    </svg>
  );
}

export function IconAlert(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M12 4 2.8 19.5h18.4L12 4Z" />
      <path d="M12 10v4.2M12 17.2v.1" />
    </svg>
  );
}

export function IconLayers(p: P) {
  return (
    <svg {...base(p)}>
      <path d="m12 3.5 8.5 4.7L12 12.9 3.5 8.2 12 3.5Z" />
      <path d="m4.6 12.4-1.1.6 8.5 4.7 8.5-4.7-1.1-.6" opacity="0.8" />
      <path d="m4.6 16.4-1.1.6 8.5 4.7 8.5-4.7-1.1-.6" opacity="0.55" />
    </svg>
  );
}

export function IconSpin(p: P) {
  return (
    <svg {...base(p)}>
      <path d="M19.5 12a7.5 7.5 0 1 1-2.2-5.3" />
      <path d="M19.8 3.9v3.3h-3.3" />
      <circle cx="12" cy="12" r="1.4" fill="currentColor" strokeWidth={0} />
    </svg>
  );
}
