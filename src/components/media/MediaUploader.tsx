"use client";

import { useCallback, useRef, useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { UploadCloud, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import { useUpload } from "@/hooks/use-upload";
import { useI18n } from "@/lib/i18n/client";

interface MediaUploaderProps {
  projectId: string;
}

const ACCEPTED_TYPES = ["image/*", "video/*"];
const ACCEPTED_EXTENSIONS = /\.(jpe?g|png|webp|gif|heic|mp4|mov|webm|avi)$/i;

export function MediaUploader({ projectId }: MediaUploaderProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const { t } = useI18n();
  const inputRef = useRef<HTMLInputElement>(null);
  const upload = useUpload(projectId);

  const processFiles = useCallback(
    (files: FileList | File[]) => {
      const fileArray = Array.from(files).filter((f) =>
        ACCEPTED_EXTENSIONS.test(f.name)
      );
      if (fileArray.length === 0) return;
      fileArray.forEach((file) => upload.mutate(file));
    },
    [upload]
  );

  const handleDrop = useCallback(
    (e: React.DragEvent<HTMLDivElement>) => {
      e.preventDefault();
      setIsDragOver(false);
      processFiles(e.dataTransfer.files);
    },
    [processFiles]
  );

  const handleDragOver = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent<HTMLDivElement>) => {
    // Only fire when leaving the drop zone itself, not a child
    if (!e.currentTarget.contains(e.relatedTarget as Node)) {
      setIsDragOver(false);
    }
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files) processFiles(e.target.files);
      // Reset input so the same file can be re-selected
      e.target.value = "";
    },
    [processFiles]
  );

  const isUploading = upload.isPending;

  return (
    <div className="w-full">
      <motion.div
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onClick={() => !isUploading && inputRef.current?.click()}
        animate={{
          borderColor: isDragOver
            ? "var(--color-accent)"
            : "var(--color-border)",
          backgroundColor: isDragOver
            ? "rgba(212,168,79,0.06)"
            : "var(--color-surface-raised)",
        }}
        transition={{ duration: 0.15 }}
        className={cn(
          "relative flex flex-col items-center justify-center gap-4",
          "min-h-48 rounded-xl border-2 border-dashed",
          "transition-all duration-150",
          !isUploading && "cursor-pointer",
          isUploading && "cursor-default"
        )}
      >
        <input
          ref={inputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(",")}
          multiple
          className="sr-only"
          onChange={handleChange}
          disabled={isUploading}
        />

        <AnimatePresence mode="wait" initial={false}>
          {isUploading ? (
            <motion.div
              key="uploading"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-3 py-4"
            >
              <Loader2
                size={32}
                className="text-[var(--color-accent)] animate-spin"
              />
              <p className="text-sm font-medium text-[var(--color-foreground)]">
                {t.uploader.uploading}
              </p>
              <p className="text-xs text-[var(--color-muted)]">
                {t.uploader.uploadingHint}
              </p>
            </motion.div>
          ) : (
            <motion.div
              key="idle"
              initial={{ opacity: 0, y: 8 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -8 }}
              transition={{ duration: 0.2 }}
              className="flex flex-col items-center gap-3 py-4 select-none"
            >
              <div
                className={cn(
                  "w-14 h-14 rounded-full flex items-center justify-center transition-colors duration-150",
                  isDragOver
                    ? "bg-[var(--color-accent)]/15"
                    : "bg-[var(--color-surface)]"
                )}
              >
                <UploadCloud
                  size={26}
                  className={cn(
                    "transition-colors duration-150",
                    isDragOver
                      ? "text-[var(--color-accent)]"
                      : "text-[var(--color-muted)]"
                  )}
                />
              </div>
              <div className="text-center">
                <p className="text-sm font-medium text-[var(--color-foreground)]">
                  {t.uploader.drop}
                </p>
                <p className="text-xs text-[var(--color-muted)] mt-0.5">
                  {t.uploader.formats}
                </p>
              </div>
              <button
                type="button"
                className="text-xs font-medium text-[var(--color-accent)] hover:underline focus:outline-none"
                onClick={(e) => {
                  e.stopPropagation();
                  inputRef.current?.click();
                }}
              >
                {t.uploader.browse}
              </button>
            </motion.div>
          )}
        </AnimatePresence>
      </motion.div>
    </div>
  );
}
