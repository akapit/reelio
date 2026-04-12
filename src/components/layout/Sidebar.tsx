"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  LayoutDashboard,
  FolderOpen,
  ImagePlus,
  Settings,
  User,
} from "lucide-react";
import { cn } from "@/lib/utils";

const navItems = [
  {
    label: "Dashboard",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "Projects",
    href: "/dashboard/projects",
    icon: FolderOpen,
    exact: false,
  },
  {
    label: "Upload",
    href: "/dashboard/upload",
    icon: ImagePlus,
    exact: true,
  },
  {
    label: "Settings",
    href: "/dashboard/settings",
    icon: Settings,
    exact: true,
  },
];

export function Sidebar() {
  const pathname = usePathname();

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] z-40">
      {/* Wordmark */}
      <div className="flex items-center h-16 px-6 border-b border-[var(--color-border)] shrink-0">
        <span
          className="text-2xl font-semibold text-[var(--color-accent)] tracking-wide"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reelio
        </span>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3">
        <ul className="space-y-0.5">
          {navItems.map(({ label, href, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 relative group",
                    active
                      ? "text-[var(--color-accent)] bg-[var(--color-accent)]/8"
                      : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]"
                  )}
                >
                  {/* Active left border indicator */}
                  {active && (
                    <span className="absolute left-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-[var(--color-accent)]" />
                  )}
                  <Icon
                    size={16}
                    className={cn(
                      "shrink-0 transition-colors duration-150",
                      active
                        ? "text-[var(--color-accent)]"
                        : "text-[var(--color-muted)] group-hover:text-[var(--color-foreground)]"
                    )}
                  />
                  {label}
                </Link>
              </li>
            );
          })}
        </ul>
      </nav>

      {/* User section */}
      <div className="shrink-0 border-t border-[var(--color-border)] p-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-[var(--color-surface-raised)] transition-colors duration-150 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-[var(--color-accent)]/20 border border-[var(--color-accent)]/30 flex items-center justify-center shrink-0">
            <User size={14} className="text-[var(--color-accent)]" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-[var(--color-foreground)] truncate leading-none">
              My Account
            </span>
            <span className="text-xs text-[var(--color-muted)] truncate mt-0.5 leading-none">
              Manage profile
            </span>
          </div>
        </div>
      </div>
    </aside>
  );
}
