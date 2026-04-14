"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import {
  LayoutDashboard,
  FolderOpen,
  ImagePlus,
  Settings,
  User,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

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

interface SidebarProps {
  isOpen: boolean;
  onClose: () => void;
  desktopCollapsed?: boolean;
}

export function Sidebar({ isOpen, onClose, desktopCollapsed = false }: SidebarProps) {
  const pathname = usePathname();

  // Close on Escape key
  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    },
    [onClose],
  );

  useEffect(() => {
    if (isOpen) {
      document.addEventListener("keydown", handleKeyDown);
      return () => document.removeEventListener("keydown", handleKeyDown);
    }
  }, [isOpen, handleKeyDown]);

  function isActive(href: string, exact: boolean) {
    if (exact) return pathname === href;
    return pathname.startsWith(href);
  }

  const sidebarContent = (
    <>
      {/* Wordmark */}
      <div className="flex items-center justify-between h-16 px-6 border-b border-[var(--color-border)] shrink-0">
        <span
          className="text-2xl font-semibold text-[var(--color-accent)] tracking-wide"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Reelio
        </span>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
          aria-label="Close sidebar"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="Main navigation">
        <ul className="space-y-0.5">
          {navItems.map(({ label, href, icon: Icon, exact }) => {
            const active = isActive(href, exact);
            return (
              <li key={href}>
                <Link
                  href={href}
                  onClick={onClose}
                  aria-current={active ? "page" : undefined}
                  className={cn(
                    "flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors duration-150 relative group",
                    active
                      ? "text-[var(--color-accent)] bg-[var(--color-accent)]/8"
                      : "text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)]",
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
                        : "text-[var(--color-muted)] group-hover:text-[var(--color-foreground)]",
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
    </>
  );

  return (
    <>
      {/* Desktop sidebar -- collapsible at lg+ */}
      <aside
        className={cn(
          "hidden lg:flex fixed left-0 top-0 h-screen w-64 flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] z-40",
          "transition-transform duration-300 ease-out",
          desktopCollapsed && "lg:-translate-x-full",
        )}
        aria-hidden={desktopCollapsed}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar -- slide-over drawer */}
      <AnimatePresence>
        {isOpen && (
          <>
            {/* Backdrop */}
            <motion.div
              key="sidebar-backdrop"
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              exit={{ opacity: 0 }}
              transition={{ duration: 0.2, ease: EASE_OUT }}
              className="fixed inset-0 bg-black/50 z-50 lg:hidden"
              onClick={onClose}
              aria-hidden="true"
            />

            {/* Drawer panel */}
            <motion.aside
              key="sidebar-drawer"
              initial={{ x: "-100%" }}
              animate={{ x: 0 }}
              exit={{ x: "-100%" }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className="fixed left-0 top-0 h-screen w-64 flex flex-col bg-[var(--color-surface)] border-r border-[var(--color-border)] z-50 lg:hidden"
              role="dialog"
              aria-modal="true"
              aria-label="Navigation menu"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
