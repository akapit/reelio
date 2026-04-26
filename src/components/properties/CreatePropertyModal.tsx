"use client";

import { useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import { AnimatePresence, motion } from "motion/react";
import { X } from "lucide-react";
import { toast } from "sonner";
import { useCreateProperty } from "@/hooks/use-properties";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface CreatePropertyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export function CreatePropertyModal({ isOpen, onClose }: CreatePropertyModalProps) {
  const router = useRouter();
  const mutation = useCreateProperty();
  const nameRef = useRef<HTMLInputElement>(null);
  const addressRef = useRef<HTMLInputElement>(null);

  // Reset form state when modal opens
  useEffect(() => {
    if (isOpen && nameRef.current) {
      nameRef.current.value = "";
      if (addressRef.current) addressRef.current.value = "";
      setTimeout(() => nameRef.current?.focus(), 50);
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

  async function handleSubmit(e: React.SyntheticEvent<HTMLFormElement>) {
    e.preventDefault();
    const name = nameRef.current?.value.trim() ?? "";
    const property_address = addressRef.current?.value.trim() || undefined;

    if (!name) {
      nameRef.current?.focus();
      return;
    }

    try {
      const property = await mutation.mutateAsync({ name, property_address });
      toast.success(`"${property.name}" נוצר`);
      onClose();
      router.push(`/dashboard/properties/${property.id}`);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "שגיאה ביצירת הנכס");
    }
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
              dir="rtl"
              onClick={(e) => e.stopPropagation()}
            >
              {/* Close button */}
              <button
                onClick={onClose}
                className="absolute top-4 left-4 w-8 h-8 flex items-center justify-center rounded-lg text-[var(--color-muted)] hover:text-[var(--color-foreground)] hover:bg-[var(--color-surface-raised)] transition-colors duration-150"
                aria-label="סגור"
              >
                <X size={16} />
              </button>

              {/* Heading */}
              <h2
                className="text-2xl font-semibold text-[var(--color-foreground)] mb-1"
                style={{ fontFamily: "var(--font-display)" }}
              >
                נכס חדש
              </h2>
              <p className="text-sm text-[var(--color-muted)] mb-6">
                צור סביבת עבודה עבור נכס חדש.
              </p>

              <form onSubmit={handleSubmit} className="flex flex-col gap-4">
                <Input
                  ref={nameRef}
                  label="שם הנכס"
                  placeholder="לדוגמה: רחוב הדקל 12"
                  required
                  autoComplete="off"
                />

                <Input
                  ref={addressRef}
                  label="כתובת"
                  placeholder="כתובת מלאה (אופציונלי)"
                  autoComplete="street-address"
                />

                <div className="flex gap-3 mt-2">
                  <Button
                    type="button"
                    variant="secondary"
                    size="md"
                    className="flex-1"
                    onClick={onClose}
                    disabled={mutation.isPending}
                  >
                    ביטול
                  </Button>
                  <Button
                    type="submit"
                    variant="primary"
                    size="md"
                    className="flex-1"
                    disabled={mutation.isPending}
                  >
                    {mutation.isPending ? "יוצר..." : "צור נכס"}
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
