"use client";

import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useI18n } from "@/lib/i18n/client";

interface BeforeAfterSliderProps {
  originalUrl: string;
  processedUrl: string;
  className?: string;
}

export function BeforeAfterSlider({
  originalUrl,
  processedUrl,
  className,
}: BeforeAfterSliderProps) {
  const { t } = useI18n();
  const [position, setPosition] = useState(50);
  const containerRef = useRef<HTMLDivElement>(null);
  const isDragging = useRef(false);

  const updatePosition = useCallback((clientX: number) => {
    if (!containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const x = clientX - rect.left;
    const pct = Math.min(100, Math.max(0, (x / rect.width) * 100));
    setPosition(pct);
  }, []);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      isDragging.current = true;
      updatePosition(e.clientX);

      function onMouseMove(ev: MouseEvent) {
        if (!isDragging.current) return;
        updatePosition(ev.clientX);
      }
      function onMouseUp() {
        isDragging.current = false;
        window.removeEventListener("mousemove", onMouseMove);
        window.removeEventListener("mouseup", onMouseUp);
      }
      window.addEventListener("mousemove", onMouseMove);
      window.addEventListener("mouseup", onMouseUp);
    },
    [updatePosition]
  );

  const handleTouchStart = useCallback(
    (e: React.TouchEvent) => {
      isDragging.current = true;
      updatePosition(e.touches[0].clientX);

      function onTouchMove(ev: TouchEvent) {
        if (!isDragging.current) return;
        updatePosition(ev.touches[0].clientX);
      }
      function onTouchEnd() {
        isDragging.current = false;
        window.removeEventListener("touchmove", onTouchMove);
        window.removeEventListener("touchend", onTouchEnd);
      }
      window.addEventListener("touchmove", onTouchMove, { passive: true });
      window.addEventListener("touchend", onTouchEnd);
    },
    [updatePosition]
  );

  return (
    <div
      ref={containerRef}
      className={cn(
        "relative overflow-hidden rounded-xl select-none bg-[var(--color-surface)] border border-[var(--color-border)]",
        "cursor-col-resize",
        className
      )}
      onMouseDown={handleMouseDown}
      onTouchStart={handleTouchStart}
      style={{ touchAction: "none" }}
    >
      {/* "After" image — full base layer */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={processedUrl}
        alt={t.media.after}
        className="block w-full h-auto pointer-events-none"
        draggable={false}
      />

      {/* "Before" image — clipped via clip-path to show left portion */}
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={originalUrl}
        alt={t.media.before}
        className="absolute inset-0 w-full h-full object-cover pointer-events-none"
        style={{
          clipPath: `inset(0 ${100 - position}% 0 0)`,
        }}
        draggable={false}
      />

      {/* Divider line */}
      <div
        className="absolute top-0 bottom-0 w-px bg-[var(--color-accent)] shadow-[0_0_8px_var(--color-accent)]"
        style={{ left: `${position}%` }}
      >
        {/* Handle */}
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-8 h-8 rounded-full bg-[var(--color-accent)] border-2 border-[var(--color-background)] shadow-lg flex items-center justify-center">
          <svg
            width="12"
            height="12"
            viewBox="0 0 12 12"
            fill="none"
            className="text-[#0e0e0f]"
          >
            <path
              d="M3 6H9M3 3L1 6L3 9M9 3L11 6L9 9"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            />
          </svg>
        </div>
      </div>

      {/* Labels */}
      <div className="absolute top-3 left-3 pointer-events-none">
        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-black/60 text-[var(--color-foreground)] backdrop-blur-sm">
          {t.media.before}
        </span>
      </div>
      <div className="absolute top-3 right-3 pointer-events-none">
        <span className="px-2 py-0.5 rounded-md text-xs font-medium bg-black/60 text-[var(--color-accent)] backdrop-blur-sm">
          {t.media.after}
        </span>
      </div>
    </div>
  );
}
