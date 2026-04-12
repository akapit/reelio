"use client";

import { useState, useCallback } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const handleSidebarClose = useCallback(() => setSidebarOpen(false), []);
  const handleMenuToggle = useCallback(
    () => setSidebarOpen((prev) => !prev),
    [],
  );

  return (
    <div className="flex h-screen bg-[var(--color-background)]">
      <Sidebar isOpen={sidebarOpen} onClose={handleSidebarClose} />

      <div className="flex flex-col flex-1 min-w-0 ml-0 lg:ml-64">
        <Header
          onNewProject={() => setModalOpen(true)}
          onMenuToggle={handleMenuToggle}
        />

        <main className="flex-1 overflow-y-auto p-4 sm:p-6 lg:p-8">
          {children}
        </main>
      </div>

      <CreateProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </div>
  );
}
