"use client";

import { Menu, Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface HeaderProps {
  onNewProject: () => void;
  onMenuToggle?: () => void;
}

export function Header({ onNewProject, onMenuToggle }: HeaderProps) {
  return (
    <header className="shrink-0 px-4 sm:px-6 lg:px-8 py-4 lg:py-5 bg-gradient-to-r from-slate-800 to-stone-800 border-b border-amber-200/20 shadow-lg">
      <div className="max-w-7xl mx-auto flex items-center justify-between gap-3">
        {/* Right side in RTL (start of flex): mobile menu + new property button */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onMenuToggle}
            className="flex items-center justify-center w-10 h-10 rounded-lg text-amber-100 hover:text-white hover:bg-white/10 transition-colors duration-150"
            aria-label="הצג/הסתר תפריט ניווט"
          >
            <Menu size={20} />
          </button>
          <Button variant="primary" size="sm" onClick={onNewProject}>
            <Plus size={15} />
            <span className="hidden sm:inline">נכס חדש</span>
          </Button>
        </div>

        {/* Left side in RTL (end of flex): REELIO wordmark + tagline (LTR text reads naturally) */}
        <div className="text-left" dir="ltr">
          <h1
            className="text-2xl lg:text-3xl font-bold text-white tracking-tight leading-none"
            style={{ fontFamily: "var(--font-display)" }}
          >
            REELIO
          </h1>
          <p className="hidden sm:block mt-1 text-xs lg:text-sm text-amber-100/80 font-light tracking-wide">
            Professional video creation &amp; marketing
          </p>
        </div>
      </div>
    </header>
  );
}
