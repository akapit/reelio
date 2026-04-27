"use client";

import { Menu, Search, Bell } from "lucide-react";
import { usePathname } from "next/navigation";

interface HeaderProps {
  onNewProject: () => void;
  onMenuToggle?: () => void;
}

const ROUTE_LABELS: Record<string, string> = {
  "/dashboard": "Home",
  "/dashboard/properties": "Properties",
  "/dashboard/templates": "Templates",
  "/dashboard/profile": "Profile",
  "/dashboard/upload": "Create",
  "/dashboard/generate": "Generate",
};

function routeLabel(pathname: string): string {
  if (ROUTE_LABELS[pathname]) return ROUTE_LABELS[pathname];
  const prefixes = Object.keys(ROUTE_LABELS).sort(
    (a, b) => b.length - a.length,
  );
  for (const p of prefixes) if (pathname.startsWith(p)) return ROUTE_LABELS[p];
  return "reelio";
}

export function Header({ onMenuToggle }: HeaderProps) {
  const pathname = usePathname() || "/dashboard";
  const label = routeLabel(pathname);

  return (
    <header
      className="shrink-0 sticky top-0 z-10 backdrop-blur"
      style={{
        height: 52,
        background: "var(--topbar-bg)",
        borderBottom: "1px solid var(--line-soft)",
      }}
    >
      <div className="h-full flex items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        {/* Start (left in LTR): mobile menu + breadcrumb */}
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={onMenuToggle}
            className="lg:hidden flex items-center justify-center w-9 h-9 rounded-md transition-colors duration-150"
            style={{ color: "var(--fg-1)" }}
            aria-label="Toggle navigation"
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
            <span style={{ color: "var(--fg-2)" }}>reelio</span>
            <span style={{ margin: "0 10px", color: "var(--fg-4)" }}>/</span>
            <span style={{ color: "var(--fg-1)" }}>{label}</span>
          </div>
        </div>

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
              Search
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
            aria-label="Notifications"
          >
            <Bell size={14} />
          </button>
        </div>
      </div>
    </header>
  );
}
