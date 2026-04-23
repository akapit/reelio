"use client";

import { useEffect, useId, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { useProcess } from "@/hooks/use-process";

interface VideoOptionsModalProps {
  isOpen: boolean;
  onClose: () => void;
  assetId: string;
  projectId: string;
}

type Duration = 5 | 10;
type Quality = "fast" | "quality";

export function VideoOptionsModal({
  isOpen,
  onClose,
  assetId,
  projectId,
}: VideoOptionsModalProps) {
  const [duration, setDuration] = useState<Duration>(5);
  const [quality, setQuality] = useState<Quality>("fast");
  const [prompt, setPrompt] = useState("");
  const [voiceoverEnabled, setVoiceoverEnabled] = useState(false);
  const [voiceoverText, setVoiceoverText] = useState("");
  const promptId = useId();
  const firstFocusRef = useRef<HTMLButtonElement>(null);
  const process = useProcess();

  // Reset state each time the modal opens
  useEffect(() => {
    if (isOpen) {
      setDuration(5);
      setQuality("fast");
      setPrompt("");
      setVoiceoverEnabled(false);
      setVoiceoverText("");
      setTimeout(() => firstFocusRef.current?.focus(), 50);
    }
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    function handleKey(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [isOpen, onClose]);

  function handleSubmit(e: React.SyntheticEvent) {
    e.preventDefault();
    process.mutate(
      {
        assetId,
        projectId,
        tool: "video",
        duration,
        quality,
        prompt: prompt.trim() || undefined,
        voiceoverText: voiceoverEnabled ? voiceoverText.trim() || undefined : undefined,
      },
      { onSuccess: onClose }
    );
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <>
          {/* Backdrop */}
          <motion.div
            key="backdrop"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="fixed inset-0 z-50 bg-black/60 backdrop-blur-sm"
            onClick={onClose}
          />

          {/* Panel */}
          <motion.div
            key="panel"
            initial={{ opacity: 0, scale: 0.96, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.96, y: 12 }}
            transition={{ duration: 0.2, ease: "easeOut" as const }}
            className="fixed inset-0 z-50 flex items-center justify-center pointer-events-none"
          >
            <div
              className="relative w-[calc(100%-2rem)] sm:w-full max-w-md mx-auto pointer-events-auto rounded-2xl bg-[var(--color-surface)] border border-[var(--color-border)] shadow-[0_24px_64px_rgba(0,0,0,0.6)] p-6 sm:p-8"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 right-4 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
                aria-label="Close modal"
              >
                <X size={16} />
              </button>

              {/* Heading */}
              <h2
                className="text-2xl font-semibold text-[var(--color-foreground)] mb-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Generate Video
              </h2>
              <p className="text-sm text-[var(--color-muted)] mb-6">
                Create a cinematic walkthrough from this photo.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-5">
                {/* Duration selector */}
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--color-foreground)] leading-none">
                    Duration
                  </span>
                  <div className="flex gap-2">
                    {([5, 10] as Duration[]).map((d) => (
                      <button
                        key={d}
                        ref={d === 5 ? firstFocusRef : undefined}
                        type="button"
                        onClick={() => setDuration(d)}
                        className={cn(
                          "flex-1 h-10 rounded-lg text-sm font-medium transition-colors duration-150 outline-none",
                          "focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
                          duration === d
                            ? "bg-[var(--color-accent)] text-[#0e0e0f]"
                            : "bg-[var(--color-surface-raised)] text-[var(--color-foreground)] hover:bg-[#28282c]"
                        )}
                      >
                        {d} seconds
                      </button>
                    ))}
                  </div>
                </div>

                {/* Quality selector */}
                <div className="flex flex-col gap-2">
                  <span className="text-sm font-medium text-[var(--color-foreground)] leading-none">
                    Quality
                  </span>
                  <div className="flex gap-2">
                    {(["fast", "quality"] as Quality[]).map((q) => (
                      <button
                        key={q}
                        type="button"
                        onClick={() => setQuality(q)}
                        className={cn(
                          "flex-1 h-10 rounded-lg text-sm font-medium transition-colors duration-150 outline-none capitalize",
                          "focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
                          quality === q
                            ? "bg-[var(--color-accent)] text-[#0e0e0f]"
                            : "bg-[var(--color-surface-raised)] text-[var(--color-foreground)] hover:bg-[#28282c]"
                        )}
                      >
                        {q === "fast" ? "Fast" : "Quality"}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Prompt textarea */}
                <div className="flex flex-col gap-1.5">
                  <label
                    htmlFor={promptId}
                    className="text-sm font-medium text-[var(--color-foreground)] leading-none"
                  >
                    Prompt{" "}
                    <span className="text-[var(--color-muted)] font-normal">
                      (optional)
                    </span>
                  </label>
                  <textarea
                    id={promptId}
                    rows={3}
                    value={prompt}
                    onChange={(e) => setPrompt(e.target.value)}
                    placeholder="Describe the camera motion... (optional)"
                    className={cn(
                      "w-full px-3 py-2.5 rounded-lg text-sm resize-none",
                      "bg-[var(--color-surface)] border border-[var(--color-border)]",
                      "text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
                      "transition-colors duration-150 outline-none",
                      "hover:border-[#3a3a3e]",
                      "focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15",
                      "disabled:opacity-50 disabled:cursor-not-allowed"
                    )}
                  />
                </div>

                {/* Voiceover Section */}
                <div className="mt-4 border-t border-[var(--color-border)] pt-4 flex flex-col gap-3">
                  <label className="flex items-center gap-3 cursor-pointer select-none">
                    <button
                      type="button"
                      role="switch"
                      aria-checked={voiceoverEnabled}
                      onClick={() => setVoiceoverEnabled(!voiceoverEnabled)}
                      className={cn(
                        "relative w-10 h-5 rounded-full transition-colors duration-150 outline-none shrink-0",
                        "focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
                        voiceoverEnabled
                          ? "bg-[var(--color-accent)]"
                          : "bg-[var(--color-muted)]"
                      )}
                    >
                      <span
                        className={cn(
                          "absolute top-0.5 left-0.5 w-4 h-4 rounded-full bg-white shadow transition-transform duration-150",
                          voiceoverEnabled && "translate-x-5"
                        )}
                      />
                    </button>
                    <span className="text-sm font-medium text-[var(--color-foreground)]">
                      Add voiceover narration
                    </span>
                  </label>

                  {voiceoverEnabled && (
                    <div className="flex flex-col gap-1.5">
                      <label className="text-sm font-medium text-[var(--color-foreground)] leading-none">
                        Voiceover script
                      </label>
                      <textarea
                        rows={3}
                        maxLength={500}
                        value={voiceoverText}
                        onChange={(e) => setVoiceoverText(e.target.value)}
                        placeholder="Welcome to this stunning three-bedroom home nestled in a quiet cul-de-sac..."
                        className={cn(
                          "w-full px-3 py-2.5 rounded-lg text-sm resize-none",
                          "bg-[var(--color-surface)] border border-[var(--color-border)]",
                          "text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
                          "transition-colors duration-150 outline-none",
                          "hover:border-[var(--color-muted)]",
                          "focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15",
                          "disabled:opacity-50 disabled:cursor-not-allowed"
                        )}
                      />
                      <span className="text-xs text-[var(--color-muted)] text-right">
                        {voiceoverText.length}/500
                      </span>
                    </div>
                  )}
                </div>

                {/* Actions */}
                <div className="flex gap-3 mt-1">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="flex-1"
                    onClick={onClose}
                    disabled={process.isPending}
                  >
                    Cancel
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="flex-1"
                    disabled={process.isPending}
                  >
                    {process.isPending ? "Generating..." : "Generate"}
                  </Button>
                </div>
              </form>
            </div>
          </motion.div>
        </>
      )}
    </AnimatePresence>
  );
}
