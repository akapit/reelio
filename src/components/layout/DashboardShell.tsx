"use client";

import { useState } from "react";
import { Sidebar } from "@/components/layout/Sidebar";
import { Header } from "@/components/layout/Header";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";

export function DashboardShell({ children }: { children: React.ReactNode }) {
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <div className="flex h-screen bg-[var(--color-background)]">
      <Sidebar />

      <div className="flex flex-col flex-1 min-w-0 ml-64">
        <Header onNewProject={() => setModalOpen(true)} />

        <main className="flex-1 overflow-y-auto p-8">
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
