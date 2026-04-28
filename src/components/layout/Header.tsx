"use client";

import { Menu, Search, Bell, ArrowLeft } from "lucide-react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { LanguageSwitcher } from "@/components/i18n/LanguageSwitcher";
import { useI18n } from "@/lib/i18n/client";

export interface HeaderProps {
  onNewProject: () => void;
  onMenuToggle?: () => void;
  /** When set, mobile shows a back link in place of the hamburger. */
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

export function Header({ onMenuToggle, backHref }: HeaderProps) {
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
            color: var(--gold-lo);
          }
        }
        .reelio-header-back {
          display: none;
          align-items: center;
          gap: 6px;
          height: 36px;
          padding: 0 8px;
          font-size: 13px;
          color: var(--fg-1);
          border-radius: 8px;
          transition: background-color .15s var(--ease);
        }
        .reelio-header-back:hover { background: var(--bg-2); }
        @media (max-width: 640px) {
          .reelio-header-back { display: inline-flex; }
        }
      `}</style>
      <div className="relative h-full flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Start (left in LTR): back-link OR mobile menu + breadcrumb */}
        <div className="flex items-center gap-3">
          {backHref ? (
            <Link
              href={backHref}
              className="reelio-header-back focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[var(--gold)]"
              aria-label={t.common.back}
            >
              <ArrowLeft size={16} className="rtl:rotate-180" />
              <span>{t.common.back}</span>
            </Link>
          ) : null}
          <button
            type="button"
            onClick={onMenuToggle}
            className={`${
              backHref ? "hidden lg:flex" : "lg:hidden flex"
            } items-center justify-center w-9 h-9 rounded-md transition-colors duration-150`}
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

        {/* End (right in LTR): search + bell */}
        <div className="flex items-center gap-2">
          <div
            className="hidden md:flex items-center gap-2"
            style={{
              height: 30,
              padding: "0 10px",
              borderRadius: 7,
              border: "1px solid var(--line-soft)",
              background: "var(--bg-1)",
              minWidth: 200,
            }}
          >
              <Search size={12} style={{ color: "var(--fg-2)" }} />
            <span style={{ fontSize: 12, color: "var(--fg-3)", flex: 1 }}>
              {t.common.search}
            </span>
            <span
              className="mono"
              style={{
                fontSize: 11.5,
                color: "var(--fg-3)",
                padding: "1px 5px",
                border: "1px solid var(--line-soft)",
                borderRadius: 3,
              }}
            >
              ⌘ K
            </span>
          </div>

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
