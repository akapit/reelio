"use client";

import { useState, useCallback, useSyncExternalStore } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CreatePropertyModal } from "@/components/properties/CreatePropertyModal";

const SIDEBAR_COLLAPSED_KEY = "reelio:sidebarCollapsed";
const SIDEBAR_WIDTH_OPEN = 260;
const SIDEBAR_WIDTH_COLLAPSED = 64;

/**
 * React-blessed external-store hook for reading the persisted collapse flag.
 * Server snapshot returns `false` (no flash on first render), client snapshot
 * returns whatever's in localStorage. `useSyncExternalStore` guarantees these
 * stay in sync across hydration without triggering the
 * `react-hooks/set-state-in-effect` lint rule.
 */
function useSidebarCollapsedStore(): [boolean, (next: boolean) => void] {
  const [tick, setTick] = useState(0);
  const subscribe = useCallback((onStoreChange: () => void) => {
    const handler = (e: StorageEvent) => {
      if (e.key === SIDEBAR_COLLAPSED_KEY) onStoreChange();
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);
  const getSnapshot = useCallback(() => {
    try {
      return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "1";
    } catch {
      return false;
    }
    // The `tick` dep here lets us force a re-snapshot after we write
    // ourselves (StorageEvent doesn't fire for same-window writes).
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tick]);
  const getServerSnapshot = useCallback(() => false, []);
  const value = useSyncExternalStore(
    subscribe,
    getSnapshot,
    getServerSnapshot,
  );
  const setValue = useCallback((next: boolean) => {
    try {
      window.localStorage.setItem(
        SIDEBAR_COLLAPSED_KEY,
        next ? "1" : "0",
      );
    } catch {
      /* best-effort persistence */
    }
    // Bump tick so getSnapshot returns the fresh value on the next read
    // (StorageEvent only fires across tabs, not same-window writes).
    setTick((t) => t + 1);
  }, []);
  return [value, setValue];
}

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useSidebarCollapsedStore();

  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleToggleCollapse = useCallback(
    () => setDesktopCollapsed(!desktopCollapsed),
    [desktopCollapsed, setDesktopCollapsed],
  );
  // Header hamburger → on mobile opens the drawer, on desktop toggles collapse.
  const handleMenuToggle = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      setDesktopCollapsed(!desktopCollapsed);
    } else {
      setSidebarOpen((prev) => !prev);
    }
  }, [desktopCollapsed, setDesktopCollapsed]);

  return (
    <div
      className="flex h-screen overflow-x-hidden"
      style={
        {
          background: "var(--bg-0)",
          color: "var(--fg-0)",
          // Drive the desktop reserve via a CSS variable so the value lives in
          // a media query (defined inline below) and can't trigger hydration
          // mismatches by reading window during render.
          ["--shell-sidebar-w" as string]: `${
            desktopCollapsed ? SIDEBAR_WIDTH_COLLAPSED : SIDEBAR_WIDTH_OPEN
          }px`,
        } as React.CSSProperties
      }
    >
      {/* The reserve only kicks in at the lg breakpoint where the rail is
          permanently visible. Below that the mobile drawer is overlaid and
          doesn't displace content. */}
      <style>{`
        .reelio-shell-main { margin-inline-start: 0; }
        @media (min-width: 1024px) {
          .reelio-shell-main { margin-inline-start: var(--shell-sidebar-w); }
        }
      `}</style>

      {/* Main content — inline-start margin reserves space for the desktop rail.
          Logical property keeps RTL working without a class swap. */}
      <div className="reelio-shell-main flex flex-col flex-1 min-w-0">
        <Header
          onNewProject={() => setModalOpen(true)}
          onMenuToggle={handleMenuToggle}
        />

        <main className="flex-1 overflow-y-auto overflow-x-hidden scroll p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={handleSidebarClose}
        desktopCollapsed={desktopCollapsed}
        onToggleCollapse={handleToggleCollapse}
        onNewProject={() => setModalOpen(true)}
      />

      <CreatePropertyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
