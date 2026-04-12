"use client";

import { useEffect, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, MapPin, Calendar } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { MediaUploader } from "@/components/media/MediaUploader";
import { AssetGrid } from "@/components/media/AssetGrid";
import { Button } from "@/components/ui/button";

interface Project {
  id: string;
  name: string;
  property_address?: string | null;
  created_at: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
}

const fadeUp = (delay: number) => ({
  initial: { opacity: 0, y: 16 },
  animate: { opacity: 1, y: 0 },
  transition: { duration: 0.35, delay, ease: "easeOut" as const },
});

export default function ProjectPage() {
  const params = useParams();
  const router = useRouter();
  const id = params?.id as string;

  const [project, setProject] = useState<Project | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isError, setIsError] = useState(false);

  useEffect(() => {
    if (!id) return;
    const supabase = createClient();

    async function fetchProject() {
      setIsLoading(true);
      setIsError(false);
      try {
        const { data, error } = await supabase
          .from("projects")
          .select("id, name, property_address, created_at")
          .eq("id", id)
          .single();
        if (error) throw error;
        setProject(data);
      } catch {
        setIsError(true);
      } finally {
        setIsLoading(false);
      }
    }

    fetchProject();
  }, [id]);

  if (isLoading) {
    return (
      <div className="max-w-7xl mx-auto space-y-8">
        <div className="flex items-center gap-4">
          <div className="h-8 w-24 rounded-lg bg-[var(--color-surface)] animate-pulse" />
        </div>
        <div className="space-y-2">
          <div className="h-10 w-72 rounded-lg bg-[var(--color-surface)] animate-pulse" />
          <div className="h-4 w-48 rounded-lg bg-[var(--color-surface)] animate-pulse" />
        </div>
        <div className="h-48 rounded-xl bg-[var(--color-surface)] animate-pulse" />
        <div className="grid grid-cols-4 gap-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div
              key={i}
              className="aspect-[4/3] rounded-xl bg-[var(--color-surface)] animate-pulse"
            />
          ))}
        </div>
      </div>
    );
  }

  if (isError || !project) {
    return (
      <div className="max-w-7xl mx-auto space-y-6">
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
        >
          <ArrowLeft size={14} />
          Back
        </Button>
        <div className="flex items-center justify-center h-52 rounded-xl border border-red-500/20 bg-red-500/5">
          <div className="text-center">
            <p className="text-sm font-medium text-red-400">
              Project not found
            </p>
            <p className="text-xs text-[var(--color-muted)] mt-1">
              This project may have been deleted or you don't have access.
            </p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto space-y-8">
      {/* Back */}
      <motion.div {...fadeUp(0)}>
        <Button
          variant="ghost"
          size="sm"
          onClick={() => router.push("/dashboard")}
          className="text-[var(--color-muted)] hover:text-[var(--color-foreground)]"
        >
          <ArrowLeft size={14} />
          All Projects
        </Button>
      </motion.div>

      {/* Project header */}
      <motion.div {...fadeUp(0.06)} className="space-y-1.5">
        <h2
          className="text-3xl font-semibold text-[var(--color-foreground)] leading-tight"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {project.name}
        </h2>

        <div className="flex flex-wrap items-center gap-4">
          {project.property_address && (
            <div className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
              <MapPin size={13} />
              <span>{project.property_address}</span>
            </div>
          )}
          <div className="flex items-center gap-1.5 text-sm text-[var(--color-muted)]">
            <Calendar size={13} />
            <span>Created {formatDate(project.created_at)}</span>
          </div>
        </div>
      </motion.div>

      {/* Divider */}
      <motion.div
        {...fadeUp(0.1)}
        className="h-px bg-[var(--color-border)]"
      />

      {/* Upload section */}
      <motion.section {...fadeUp(0.14)} className="space-y-3">
        <h3
          className="text-lg font-semibold text-[var(--color-foreground)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Upload Media
        </h3>
        <MediaUploader projectId={project.id} />
      </motion.section>

      {/* Asset grid section */}
      <motion.section {...fadeUp(0.18)} className="space-y-3">
        <h3
          className="text-lg font-semibold text-[var(--color-foreground)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Assets
        </h3>
        <AssetGrid projectId={project.id} />
      </motion.section>
    </div>
  );
}
