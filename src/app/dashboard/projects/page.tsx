"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FolderOpen, Plus } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { Button } from "@/components/ui/button";

export default function ProjectsPage() {
  const { data: projects, isLoading, isError } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center justify-between">
          <div>
            <h2
              className="text-3xl font-semibold text-[var(--color-foreground)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Projects
            </h2>
            <p className="mt-1 text-sm text-[var(--color-muted)]">
              Manage your property listing media.
            </p>
          </div>
          <Button variant="primary" size="md" onClick={() => setModalOpen(true)}>
            <Plus size={16} />
            New Project
          </Button>
        </div>

        {isError && (
          <div className="flex items-center justify-center h-32 rounded-xl border border-red-500/20 bg-red-500/5">
            <p className="text-sm text-red-400">
              Failed to load projects. Please refresh.
            </p>
          </div>
        )}

        {isLoading && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <div
                key={i}
                className="h-40 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse"
                style={{ animationDelay: `${i * 75}ms` }}
              />
            ))}
          </div>
        )}

        {!isLoading && !isError && projects && projects.length === 0 && (
          <motion.div
            initial={{ opacity: 0, y: 8 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.3 }}
            className="flex flex-col items-center justify-center gap-4 h-64 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]"
          >
            <div className="w-14 h-14 rounded-full flex items-center justify-center bg-[var(--color-surface-raised)]">
              <FolderOpen size={22} className="text-[var(--color-muted)]" />
            </div>
            <div className="text-center">
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                No projects yet
              </p>
              <p className="text-xs text-[var(--color-muted)] mt-0.5">
                Create your first project to start enhancing property media.
              </p>
            </div>
            <Button variant="primary" size="sm" onClick={() => setModalOpen(true)}>
              <Plus size={14} />
              Create First Project
            </Button>
          </motion.div>
        )}

        {!isLoading && !isError && projects && projects.length > 0 && (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {projects.map((project, index) => {
              const assetCount = Array.isArray(project.assets)
                ? (project.assets[0]?.count ?? 0)
                : 0;
              return (
                <motion.div
                  key={project.id}
                  initial={{ opacity: 0, y: 16 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.3, delay: index * 0.05 }}
                >
                  <ProjectCard
                    id={project.id}
                    name={project.name}
                    property_address={project.property_address}
                    assetCount={assetCount}
                    createdAt={project.created_at}
                  />
                </motion.div>
              );
            })}
          </div>
        )}
      </div>

      <CreateProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}
