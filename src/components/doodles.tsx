/* Hand-drawn bits for the margins. Every stroke is slightly wobbly on purpose. */
import type { Family } from "@/lib/types";

type P = { className?: string; size?: number; title?: string };

const svg = (size: number, className?: string, title?: string) => ({
  width: size,
  height: size,
  viewBox: "0 0 48 48",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 2.2,
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  className,
  role: title ? "img" : undefined,
  "aria-hidden": title ? undefined : true,
  "aria-label": title,
});

export const Mountain = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M3 40 L17 15 L24 26 L30 18 L45 40 Z" />
    <path d="M14 21 L17 15 L20 21 L18 20 L16 22 Z" />
    <path d="M27 23 L30 18 L33 23" />
  </svg>
);

export const Wave = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M4 20 C9 14, 13 14, 17 20 S25 26, 30 20 S39 14, 44 20" />
    <path d="M4 30 C9 24, 13 24, 17 30 S25 36, 30 30 S39 24, 44 30" />
    <path d="M32 9 L34 4 M38 11 L42 7 M26 9 L25 4" />
  </svg>
);

export const Leaf = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M8 40 C8 22, 20 8, 41 7 C41 27, 28 40, 8 40 Z" />
    <path d="M8 40 C17 31, 25 23, 34 14" />
    <path d="M19 30 L18 22 M25 24 L25 17 M24 30 L31 29" />
  </svg>
);

export const Temple = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M24 4 L24 9" />
    <path d="M17 18 C17 12, 31 12, 31 18" />
    <path d="M12 26 C12 19, 36 19, 36 26" />
    <path d="M10 26 L38 26 M13 26 L13 41 M35 26 L35 41 M7 42 L41 42" />
    <path d="M21 41 L21 33 C21 30, 27 30, 27 33 L27 41" />
  </svg>
);

export const Castle = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M6 42 L6 14 L11 14 L11 19 L16 19 L16 14 L21 14 L21 19 L27 19 L27 14 L32 14 L32 19 L37 19 L37 14 L42 14 L42 42 Z" />
    <path d="M20 42 L20 33 C20 29, 28 29, 28 33 L28 42" />
    <path d="M14 26 L14 29 M34 26 L34 29" />
  </svg>
);

export const Compass = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <circle cx="24" cy="24" r="18" />
    <path d="M30 18 L21 22 L18 30 L27 26 Z" />
    <path d="M24 3 L24 7 M24 41 L24 45 M3 24 L7 24 M41 24 L45 24" />
  </svg>
);

export const FamilyIcon = ({ family, size = 28, className }: P & { family: Family }) => {
  const C = { nature: Leaf, water: Wave, heights: Mountain, heritage: Castle, sacred: Temple, curious: Compass }[family] ?? Compass;
  return <C size={size} className={className} />;
};

export const Sun = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <circle cx="24" cy="24" r="8" />
    <path d="M24 5 L24 10 M24 38 L24 43 M5 24 L10 24 M38 24 L43 24 M11 11 L14 14 M34 34 L37 37 M37 11 L34 14 M14 34 L11 37" />
  </svg>
);

export const Cloud = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M13 34 C6 34, 6 24, 13 24 C13 16, 25 13, 28 20 C32 15, 41 18, 39 26 C45 27, 44 34, 38 34 Z" />
  </svg>
);

export const Rain = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M13 28 C6 28, 6 18, 13 18 C13 10, 25 7, 28 14 C32 9, 41 12, 39 20 C45 21, 44 28, 38 28 Z" />
    <path d="M16 33 L13 40 M25 33 L22 42 M34 33 L31 40" />
  </svg>
);

export const Storm = ({ size = 28, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M13 28 C6 28, 6 18, 13 18 C13 10, 25 7, 28 14 C32 9, 41 12, 39 20 C45 21, 44 28, 38 28 Z" />
    <path d="M25 30 L20 38 L26 38 L21 46" />
  </svg>
);

export function WeatherIcon({ code, size = 30 }: { code: number; size?: number }) {
  if (code >= 95) return <Storm size={size} />;
  if (code >= 51) return <Rain size={size} />;
  if (code >= 2) return <Cloud size={size} />;
  return <Sun size={size} />;
}

export const Pen = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M32 6 L42 16 L18 40 L6 42 L8 30 Z" />
    <path d="M28 10 L38 20 M8 30 L18 40" />
  </svg>
);

export const Plus = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M24 7 C24.5 18, 23.5 30, 24 41 M7 24 C18 23, 30 25, 41 24" />
  </svg>
);

export const Check = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)} strokeWidth={3}>
    <path d="M7 25 C11 29, 15 33, 19 38 C25 26, 33 15, 42 8" />
  </svg>
);

export const Star = ({ size = 22, className, title }: P) => (
  <svg {...svg(size, className, title)}>
    <path d="M24 5 L29 18 L43 19 L32 28 L36 42 L24 34 L12 42 L16 28 L5 19 L19 18 Z" />
  </svg>
);

export const Arrow = ({ size = 60, className }: P) => (
  <svg width={size} height={size * 0.5} viewBox="0 0 120 60" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" className={className} aria-hidden>
    <path d="M6 44 C30 10, 70 6, 104 26" />
    <path d="M92 14 L106 27 L88 33" />
  </svg>
);

/** A wobbly underline to put under handwritten headings. */
export const Scribble = ({ className }: { className?: string }) => (
  <svg className={className} viewBox="0 0 300 16" preserveAspectRatio="none" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" aria-hidden>
    <path d="M3 10 C60 4, 120 13, 180 7 S270 6, 297 9" />
    <path d="M40 13 C100 9, 170 14, 250 11" opacity=".55" strokeWidth="2" />
  </svg>
);

/** The "pen is moving" placeholder while the model writes. */
export function Writing({ label = "writing…" }: { label?: string }) {
  return (
    <div className="writing" role="status">
      <svg viewBox="0 0 220 40" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" aria-hidden>
        <path className="writing-line" d="M4 28 C14 8, 22 34, 30 20 S44 10, 50 24 S62 34, 70 18 S84 8, 92 24 S104 32, 112 18 S126 10, 134 26 S148 30, 156 16 S170 12, 178 26 S194 30, 216 20" />
      </svg>
      <span>{label}</span>
    </div>
  );
}

/** The passport-style stamp a place gets when you've actually been. */
export function Stamp({ date, verified, place }: { date: string; verified: boolean; place: string }) {
  return (
    <div className={`stamp ${verified ? "stamp-verified" : "stamp-memory"}`} aria-label={`Visited ${place} on ${date}`}>
      <span className="stamp-top">{verified ? "BEEN HERE" : "WENT THERE"}</span>
      <span className="stamp-date">{date}</span>
      <span className="stamp-bottom">{verified ? "GPS · ON THE SPOT" : "FROM MEMORY"}</span>
    </div>
  );
}
