"use client";

import { useEffect, useCallback } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { LayoutDashboard, Home, User, X } from "lucide-react";
import { cn } from "@/lib/utils";

const EASE_OUT = [0.22, 1, 0.36, 1] as const;

const navItems = [
  {
    label: "לוח בקרה",
    href: "/dashboard",
    icon: LayoutDashboard,
    exact: true,
  },
  {
    label: "נכסים",
    href: "/dashboard/properties",
    icon: Home,
    exact: false,
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
      {/* Wordmark — matches Header height + dark gradient palette */}
      <div className="flex items-center justify-between h-[68px] lg:h-[76px] px-5 border-b border-amber-200/20 shrink-0">
        <span
          className="text-xl font-bold text-white tracking-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          REELIO
        </span>
        <button
          type="button"
          onClick={onClose}
          className="lg:hidden flex items-center justify-center w-8 h-8 rounded-md text-amber-100 hover:text-white hover:bg-white/10 transition-colors duration-150"
          aria-label="סגור תפריט"
        >
          <X size={18} />
        </button>
      </div>

      {/* Navigation */}
      <nav className="flex-1 overflow-y-auto py-4 px-3" aria-label="ניווט ראשי">
        <ul className="space-y-1">
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
                      ? "text-white bg-white/10"
                      : "text-amber-100/70 hover:text-white hover:bg-white/5",
                  )}
                >
                  {/* Active right border indicator (RTL) */}
                  {active && (
                    <span className="absolute right-0 top-1/2 -translate-y-1/2 w-0.5 h-5 rounded-full bg-amber-400" />
                  )}
                  <Icon
                    size={16}
                    className={cn(
                      "shrink-0 transition-colors duration-150",
                      active
                        ? "text-amber-300"
                        : "text-amber-100/60 group-hover:text-amber-200",
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
      <div className="shrink-0 border-t border-amber-200/20 p-3">
        <div className="flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-white/5 transition-colors duration-150 cursor-pointer">
          <div className="w-8 h-8 rounded-full bg-amber-400/15 border border-amber-300/30 flex items-center justify-center shrink-0">
            <User size={14} className="text-amber-300" />
          </div>
          <div className="flex flex-col min-w-0">
            <span className="text-xs font-medium text-white truncate leading-none">
              החשבון שלי
            </span>
            <span className="text-xs text-amber-100/60 truncate mt-0.5 leading-none">
              ניהול פרופיל
            </span>
          </div>
        </div>
      </div>
    </>
  );

  const panelClasses =
    "h-screen w-52 flex flex-col bg-gradient-to-b from-slate-800 to-stone-800 border-l border-amber-200/20 shadow-xl";

  return (
    <>
      {/* Desktop sidebar — fixed to the RIGHT in RTL layout */}
      <aside
        className={cn(
          "hidden lg:flex fixed right-0 top-0 z-40",
          panelClasses,
          "transition-transform duration-300 ease-out",
          desktopCollapsed && "lg:translate-x-full",
        )}
        aria-hidden={desktopCollapsed}
      >
        {sidebarContent}
      </aside>

      {/* Mobile sidebar -- slide-over drawer from the right */}
      <AnimatePresence>
        {isOpen && (
          <>
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

            <motion.aside
              key="sidebar-drawer"
              initial={{ x: "100%" }}
              animate={{ x: 0 }}
              exit={{ x: "100%" }}
              transition={{ duration: 0.25, ease: EASE_OUT }}
              className={cn("fixed right-0 top-0 z-50 lg:hidden", panelClasses)}
              role="dialog"
              aria-modal="true"
              aria-label="תפריט ניווט"
            >
              {sidebarContent}
            </motion.aside>
          </>
        )}
      </AnimatePresence>
    </>
  );
}
