"use client";

import { useId } from "react";

interface ReelioMarkProps {
  size?: number;
  glow?: boolean;
}

// The mark: a stylized 'S' ribbon drawn as two cubic curves with a vertical
// gold gradient + subtle specular highlight. Per design system spec.
export function ReelioMark({ size = 28, glow = true }: ReelioMarkProps) {
  const rawId = useId();
  const id = rawId.replace(/:/g, "");
  return (
    <svg
      width={size}
      height={size * (28 / 24)}
      viewBox="0 0 24 28"
      aria-hidden="true"
      style={{ display: "block", overflow: "visible" }}
    >
      <defs>
        <linearGradient id={`g-${id}`} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="oklch(0.92 0.16 88)" />
          <stop offset="50%" stopColor="oklch(0.78 0.14 80)" />
          <stop offset="100%" stopColor="oklch(0.55 0.10 72)" />
        </linearGradient>
        <linearGradient id={`s-${id}`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="white" stopOpacity="0.6" />
          <stop offset="40%" stopColor="white" stopOpacity="0.05" />
          <stop offset="100%" stopColor="white" stopOpacity="0" />
        </linearGradient>
        {glow && (
          <filter id={`f-${id}`} x="-50%" y="-50%" width="200%" height="200%">
            <feGaussianBlur stdDeviation="0.4" />
          </filter>
        )}
      </defs>
      {/* Top arc */}
      <path
        d="M21 3 C 16 3, 11 5, 8 9 C 6 11, 5 13, 5 14 L 9 14 C 9 13, 10 12, 12 11 C 14 10, 17 10, 19 11 Z"
        fill={`url(#g-${id})`}
        filter={glow ? `url(#f-${id})` : undefined}
      />
      {/* Bottom arc */}
      <path
        d="M3 25 C 8 25, 13 23, 16 19 C 18 17, 19 15, 19 14 L 15 14 C 15 15, 14 16, 12 17 C 10 18, 7 18, 5 17 Z"
        fill={`url(#g-${id})`}
        filter={glow ? `url(#f-${id})` : undefined}
      />
      {/* Specular highlight */}
      <path
        d="M21 3 C 16 3, 11 5, 8 9 C 6 11, 5 13, 5 14 L 9 14 C 9 13, 10 12, 12 11 C 14 10, 17 10, 19 11 Z"
        fill={`url(#s-${id})`}
        opacity="0.7"
      />
    </svg>
  );
}

interface ReelioWordmarkProps {
  size?: number;
  mark?: boolean;
  color?: string;
}

export function ReelioWordmark({
  size = 18,
  mark = true,
  color,
}: ReelioWordmarkProps) {
  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 8,
        lineHeight: 1,
        direction: "ltr",
      }}
    >
      {mark && <ReelioMark size={size * 1.45} />}
      <span
        style={{
          fontFamily: "var(--font-display)",
          fontSize: size * 1.5,
          fontWeight: 400,
          letterSpacing: "-0.01em",
          color: color || "var(--fg-0)",
          paddingTop: 1,
        }}
      >
        reelio
      </span>
    </div>
  );
}
