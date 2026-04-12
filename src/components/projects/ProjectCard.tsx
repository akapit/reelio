"use client";

import { useRouter } from "next/navigation";
import { motion } from "motion/react";
import { MapPin, Images, Calendar } from "lucide-react";
import { cn } from "@/lib/utils";

interface ProjectCardProps {
  id: string;
  name: string;
  property_address?: string | null;
  assetCount?: number;
  createdAt: string;
  className?: string;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ProjectCard({
  id,
  name,
  property_address,
  assetCount = 0,
  createdAt,
  className,
}: ProjectCardProps) {
  const router = useRouter();

  return (
    <motion.div
      whileHover={{ scale: 1.02 }}
      transition={{ type: "spring", stiffness: 400, damping: 30 }}
      onClick={() => router.push(`/dashboard/projects/${id}`)}
      className={cn(
        "group relative flex flex-col gap-4 p-5 rounded-xl cursor-pointer",
        "bg-[var(--color-surface)] border border-[var(--color-border)]",
        "hover:shadow-[0_0_0_1px_#c9a84c22,0_8px_32px_#c9a84c0a]",
        "transition-shadow duration-200",
        className
      )}
    >
      {/* Accent top bar */}
      <div className="absolute top-0 left-6 right-6 h-px bg-gradient-to-r from-transparent via-[var(--color-accent)]/30 to-transparent rounded-full" />

      {/* Project name */}
      <div className="flex items-start justify-between gap-2">
        <h3
          className="text-lg font-semibold text-[var(--color-foreground)] leading-snug line-clamp-2 group-hover:text-[var(--color-accent)] transition-colors duration-150"
          style={{ fontFamily: "var(--font-display)" }}
        >
          {name}
        </h3>

        {/* Asset count badge */}
        <span className="shrink-0 inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium bg-[var(--color-surface-raised)] text-[var(--color-muted)] border border-[var(--color-border)]">
          <Images size={11} />
          {assetCount}
        </span>
      </div>

      {/* Meta */}
      <div className="flex flex-col gap-1.5 mt-auto">
        {property_address && (
          <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
            <MapPin size={11} className="shrink-0" />
            <span className="truncate">{property_address}</span>
          </div>
        )}
        <div className="flex items-center gap-1.5 text-xs text-[var(--color-muted)]">
          <Calendar size={11} className="shrink-0" />
          <span>{formatDate(createdAt)}</span>
        </div>
      </div>
    </motion.div>
  );
}
