"use client";

import { useState } from "react";
import { motion } from "motion/react";
import { FolderOpen, Images, Plus, TrendingUp } from "lucide-react";
import { useProjects } from "@/hooks/use-projects";
import { ProjectCard } from "@/components/projects/ProjectCard";
import { CreateProjectModal } from "@/components/projects/CreateProjectModal";
import { Button } from "@/components/ui/button";

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" as const },
});

export default function DashboardPage() {
  const { data: projects, isLoading, isError } = useProjects();
  const [modalOpen, setModalOpen] = useState(false);

  const totalProjects = projects?.length ?? 0;
  const totalAssets = projects?.reduce((acc, p) => {
    const count = Array.isArray(p.assets) ? p.assets[0]?.count ?? 0 : 0;
    return acc + count;
  }, 0) ?? 0;

  const recentProjects = projects?.slice(0, 8) ?? [];

  return (
    <>
      <div className="max-w-7xl mx-auto space-y-10">
        {/* Hero heading */}
        <motion.div {...fadeUp(0)}>
          <h2
            className="text-3xl lg:text-4xl font-semibold text-[var(--color-foreground)] leading-tight"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Welcome to Reelio
          </h2>
          <p className="mt-1.5 text-sm text-[var(--color-muted)]">
            AI-powered media enhancement for real estate listings.
          </p>
        </motion.div>

        {/* Stats row */}
        <motion.div
          {...fadeUp(0.06)}
          className="grid grid-cols-1 sm:grid-cols-3 gap-3 sm:gap-4"
        >
          <StatCard
            icon={<FolderOpen size={18} className="text-[var(--color-accent)]" />}
            label="Total Projects"
            value={isLoading ? "—" : String(totalProjects)}
          />
          <StatCard
            icon={<Images size={18} className="text-[var(--color-accent)]" />}
            label="Total Assets"
            value={isLoading ? "—" : String(totalAssets)}
          />
          <StatCard
            icon={<TrendingUp size={18} className="text-[var(--color-accent)]" />}
            label="Enhancements"
            value="—"
            hint="Coming soon"
          />
        </motion.div>

        {/* Recent projects */}
        <motion.section {...fadeUp(0.12)} className="space-y-4">
          <div className="flex items-center justify-between">
            <h3
              className="text-xl font-semibold text-[var(--color-foreground)]"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Recent Projects
            </h3>
            {totalProjects > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setModalOpen(true)}
              >
                <Plus size={14} />
                New Project
              </Button>
            )}
          </div>

          {isError && (
            <div className="flex items-center justify-center h-32 rounded-xl border border-red-500/20 bg-red-500/5">
              <p className="text-sm text-red-400">
                Failed to load projects. Please refresh.
              </p>
            </div>
          )}

          {isLoading && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {Array.from({ length: 4 }).map((_, i) => (
                <div
                  key={i}
                  className="h-40 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] animate-pulse"
                />
              ))}
            </div>
          )}

          {!isLoading && !isError && recentProjects.length === 0 && (
            <motion.div
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="flex flex-col items-center justify-center gap-4 h-52 rounded-xl border border-dashed border-[var(--color-border)] bg-[var(--color-surface)]"
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
              <Button
                variant="primary"
                size="sm"
                onClick={() => setModalOpen(true)}
              >
                <Plus size={14} />
                Create First Project
              </Button>
            </motion.div>
          )}

          {!isLoading && !isError && recentProjects.length > 0 && (
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-3 sm:gap-4">
              {recentProjects.map((project, index) => {
                const assetCount = Array.isArray(project.assets)
                  ? (project.assets[0]?.count ?? 0)
                  : 0;
                return (
                  <motion.div
                    key={project.id}
                    initial={{ opacity: 0, y: 16 }}
                    animate={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.3, delay: 0.12 + index * 0.05 }}
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
        </motion.section>
      </div>

      <CreateProjectModal
        isOpen={modalOpen}
        onClose={() => setModalOpen(false)}
      />
    </>
  );
}

interface StatCardProps {
  icon: React.ReactNode;
  label: string;
  value: string;
  hint?: string;
}

function StatCard({ icon, label, value, hint }: StatCardProps) {
  return (
    <div className="flex items-center gap-4 p-5 rounded-xl bg-[var(--color-surface)] border border-[var(--color-border)] hover:shadow-[0_0_0_1px_#c9a84c22,0_8px_32px_#c9a84c0a] transition-shadow duration-200">
      <div className="w-10 h-10 rounded-lg flex items-center justify-center bg-[var(--color-accent)]/10 border border-[var(--color-accent)]/20 shrink-0">
        {icon}
      </div>
      <div>
        <p className="text-xs text-[var(--color-muted)] font-medium">{label}</p>
        <p className="text-2xl font-semibold text-[var(--color-foreground)] leading-tight">
          {value}
        </p>
        {hint && (
          <p className="text-xs text-[var(--color-muted)] mt-0.5">{hint}</p>
        )}
      </div>
    </div>
  );
}
