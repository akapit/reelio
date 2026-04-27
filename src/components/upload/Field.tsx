"use client";
import type { ReactNode } from "react";

interface FieldProps {
  label: string;
  children: ReactNode;
}

export function Field({ label, children }: FieldProps) {
  return (
    <div style={{ marginBottom: 12 }}>
      <div className="kicker" style={{ marginBottom: 6, fontSize: 12 }}>
        {label}
      </div>
      <div className="reelio-field">{children}</div>
      <style>{`
        .reelio-field input {
          width: 100%; height: 34px; padding: 0 12px;
          background: var(--bg-2); border: 1px solid var(--line-soft);
          border-radius: 8px; outline: 0; color: var(--fg-0); font-size: 13px;
          transition: border-color .15s var(--ease), background .15s var(--ease);
        }
        .reelio-field input:focus {
          border-color: oklch(0.66 0.12 75 / 0.5);
          background: var(--bg-1);
        }
      `}</style>
    </div>
  );
}
