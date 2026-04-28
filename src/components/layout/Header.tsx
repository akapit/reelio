"use client";

import { Menu, Bell } from "lucide-react";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

export interface HeaderProps {
  onNewProject: () => void;
  onMenuToggle?: () => void;
  /** Kept for shell compatibility; mobile always shows the menu toggle. */
  backHref?: string;
}

const ROUTE_KEYS = {
  "/dashboard": "home",
  "/dashboard/properties": "properties",
  "/dashboard/templates": "templates",
  "/dashboard/profile": "profile",
  "/dashboard/upload": "create",
  "/dashboard/generate": "generate",
} as const;

function routeLabel(
  pathname: string,
  labels: Record<(typeof ROUTE_KEYS)[keyof typeof ROUTE_KEYS], string>,
): string {
  if (pathname in ROUTE_KEYS) return labels[ROUTE_KEYS[pathname as keyof typeof ROUTE_KEYS]];
  const prefixes = Object.keys(ROUTE_KEYS).sort(
    (a, b) => b.length - a.length,
  );
  for (const p of prefixes) {
    if (pathname.startsWith(p)) return labels[ROUTE_KEYS[p as keyof typeof ROUTE_KEYS]];
  }
  return "reelio";
}

export function Header({ onMenuToggle }: HeaderProps) {
  const pathname = usePathname() || "/dashboard";
  const { t } = useI18n();
  const label = routeLabel(pathname, t.shell.routes);

  return (
    <header
      className="reelio-header shrink-0 sticky top-0 z-10 backdrop-blur"
      style={{
        height: 52,
        background: "var(--topbar-bg)",
        borderBottom: "1px solid var(--line-soft)",
        ["--language-switch-bg" as string]: "#ffffff",
        ["--language-switch-border" as string]: "rgb(36 48 74 / 0.18)",
        ["--language-switch-fg" as string]: "#263552",
        ["--language-switch-hover" as string]: "#f1eee8",
      }}
    >
      <style>{`
        .reelio-header-wordmark { display: none; }
        @media (max-width: 640px) {
          .reelio-header-wordmark {
            display: inline-flex;
            position: absolute;
            left: 50%;
            transform: translateX(-50%);
            font-weight: 700;
            letter-spacing: 0.18em;
            text-transform: uppercase;
            font-size: 14px;
            color: var(--fg-0);
          }
        }
      `}</style>
      <div className="relative h-full flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Start (left in LTR): mobile menu + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuToggle}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-md transition-colors duration-150"
            style={{ color: "var(--fg-1)" }}
            aria-label={t.shell.toggleNavigation}
          >
            <Menu size={18} />
          </button>

          <div
            className="mono hidden sm:flex items-center"
            style={{
              fontSize: 12,
              letterSpacing: "0.14em",
              color: "var(--fg-3)",
              textTransform: "uppercase",
            }}
          >
            <span style={{ color: "var(--fg-2)" }}>{t.common.appName}</span>
            <span style={{ margin: "0 10px", color: "var(--fg-4)" }}>/</span>
            <span style={{ color: "var(--fg-1)" }}>{label}</span>
          </div>
        </div>

        {/* Centered REELIO wordmark on mobile only */}
        <span
          className="reelio-header-wordmark"
          aria-hidden="true"
        >
          {t.common.appName}
        </span>

        {/* End (right in LTR): notifications + language */}
        <div className="flex items-center gap-2">
          <button
            type="button"
            className="flex items-center justify-center transition-colors duration-150"
            style={{
              height: 30,
              padding: "0 8px",
              borderRadius: 7,
              border: "1px solid var(--line-soft)",
              background: "transparent",
              color: "var(--fg-1)",
            }}
            onMouseEnter={(e) =>
              (e.currentTarget.style.background = "var(--bg-2)")
            }
            onMouseLeave={(e) =>
              (e.currentTarget.style.background = "transparent")
            }
            aria-label={t.shell.notifications}
          >
            <Bell size={14} />
          </button>
          <LanguageSwitcher compact />
        </div>
      </div>
    </header>
  );
}
