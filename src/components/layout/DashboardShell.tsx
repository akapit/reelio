"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CreatePropertyModal } from "@/components/properties/CreatePropertyModal";
import { cn } from "@/lib/utils";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [desktopCollapsed, setDesktopCollapsed] = useState(false);

  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleMenuToggle = useCallback(() => {
    if (
      typeof window !== "undefined" &&
      window.matchMedia("(min-width: 1024px)").matches
    ) {
      setDesktopCollapsed((prev) => !prev);
    } else {
      setSidebarOpen((prev) => !prev);
    }
  }, []);

  return (
    <div className="flex h-screen bg-gradient-to-br from-slate-50 to-stone-100">
      {/* Main content — margin on the RIGHT to make room for the RTL sidebar */}
      <div
        className={cn(
          "flex flex-col flex-1 min-w-0 mr-0",
          "transition-[margin] duration-300 ease-out",
          desktopCollapsed ? "lg:mr-0" : "lg:mr-52",
        )}
      >
        <Header
          onNewProject={() => setModalOpen(true)}
          onMenuToggle={handleMenuToggle}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <Sidebar
        isOpen={sidebarOpen}
        onClose={handleSidebarClose}
        desktopCollapsed={desktopCollapsed}
      />

      <CreatePropertyModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
