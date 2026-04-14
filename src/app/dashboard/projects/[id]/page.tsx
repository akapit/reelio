"use client";

import { useEffect, useRef, useState } from "react";
import { useParams, useRouter } from "next/navigation";
import { motion } from "motion/react";
import { ArrowLeft, MapPin, Calendar, Pencil } from "lucide-react";
import { toast } from "sonner";
import { createClient } from "@/lib/supabase/client";
import { CreationBar, type RerunPayload } from "@/components/media/CreationBar";
import { AssetGrid } from "@/components/media/AssetGrid";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

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
  const [isEditingName, setIsEditingName] = useState(false);
  const [nameDraft, setNameDraft] = useState("");
  const [isSavingName, setIsSavingName] = useState(false);
  const nameInputRef = useRef<HTMLInputElement>(null);
  const [creationPreload, setCreationPreload] = useState<RerunPayload | null>(
    null,
  );
  const creationBarRef = useRef<HTMLDivElement>(null);

  const handleRerun = (payload: Omit<RerunPayload, "nonce">) => {
    setCreationPreload({ ...payload, nonce: Date.now() });
    // Scroll so the user sees the bar rehydrated.
    requestAnimationFrame(() => {
      creationBarRef.current?.scrollIntoView({
        behavior: "smooth",
        block: "center",
      });
    });
  };

  useEffect(() => {
    if (isEditingName) {
      nameInputRef.current?.focus();
      nameInputRef.current?.select();
    }
  }, [isEditingName]);

  async function saveName() {
    if (!project) return;
    const trimmed = nameDraft.trim();
    if (!trimmed || trimmed === project.name) {
      setIsEditingName(false);
      setNameDraft(project.name);
      return;
    }
    setIsSavingName(true);
    const supabase = createClient();
    const { error } = await supabase
      .from("projects")
      .update({ name: trimmed })
      .eq("id", project.id);
    setIsSavingName(false);
    if (error) {
      toast.error("Failed to rename project");
      setNameDraft(project.name);
    } else {
      setProject({ ...project, name: trimmed });
      toast.success("Project renamed");
    }
    setIsEditingName(false);
  }

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
    <div className="max-w-7xl mx-auto space-y-6 lg:space-y-8">
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
        {isEditingName ? (
          <input
            ref={nameInputRef}
            value={nameDraft}
            onChange={(e) => setNameDraft(e.target.value)}
            onBlur={saveName}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                saveName();
              } else if (e.key === "Escape") {
                e.preventDefault();
                setNameDraft(project.name);
                setIsEditingName(false);
              }
            }}
            disabled={isSavingName}
            maxLength={120}
            className={cn(
              "w-full bg-transparent outline-none",
              "text-2xl lg:text-3xl font-semibold text-[var(--color-foreground)] leading-tight",
              "border-b border-[var(--color-accent)]/60 focus:border-[var(--color-accent)]",
              "pb-0.5 -mb-0.5",
            )}
            style={{ fontFamily: "var(--font-display)" }}
            aria-label="Project name"
          />
        ) : (
          <button
            type="button"
            onClick={() => {
              setNameDraft(project.name);
              setIsEditingName(true);
            }}
            className={cn(
              "group inline-flex items-center gap-2 text-left",
              "text-2xl lg:text-3xl font-semibold text-[var(--color-foreground)] leading-tight",
              "rounded-md -mx-1 px-1 transition-colors duration-150",
              "hover:bg-[var(--color-surface-raised)]/60 cursor-text",
            )}
            style={{ fontFamily: "var(--font-display)" }}
            title="Click to rename"
          >
            <span>{project.name}</span>
            <Pencil
              size={14}
              className="text-[var(--color-muted)] opacity-0 group-hover:opacity-100 transition-opacity duration-150"
            />
          </button>
        )}

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

      {/* Creation bar */}
      <motion.section {...fadeUp(0.14)} ref={creationBarRef}>
        <CreationBar projectId={project.id} preload={creationPreload} />
      </motion.section>

      {/* Asset grid section */}
      <motion.section {...fadeUp(0.18)} className="space-y-3">
        <h3
          className="text-lg font-semibold text-[var(--color-foreground)]"
          style={{ fontFamily: "var(--font-display)" }}
        >
          Assets
        </h3>
        <AssetGrid projectId={project.id} onRerun={handleRerun} />
      </motion.section>
    </div>
  );
}
