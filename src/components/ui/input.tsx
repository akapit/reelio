import { InputHTMLAttributes, forwardRef, useId } from "react";
import { cn } from "@/lib/utils";

interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
  error?: string;
}

export const Input = forwardRef<HTMLInputElement, InputProps>(
  ({ label, error, className, id, ...props }, ref) => {
    const generatedId = useId();
    const inputId = id ?? generatedId;

    return (
      <div className="flex flex-col gap-1.5 w-full">
        {label && (
          <label
            htmlFor={inputId}
            className="text-sm font-medium text-[var(--color-foreground)] leading-none"
          >
            {label}
          </label>
        )}

        <input
          ref={ref}
          id={inputId}
          className={cn(
            "w-full h-10 px-3 rounded-lg text-sm",
            "bg-[var(--color-surface)] border",
            "text-[var(--color-foreground)] placeholder:text-[var(--color-muted)]",
            "transition-colors duration-150 outline-none",
            error
              ? "border-red-500/70 focus:border-red-500 focus:ring-2 focus:ring-red-500/20"
              : [
                  "border-[var(--color-border)]",
                  "hover:border-[var(--color-muted)]",
                  "focus:border-[var(--color-accent)] focus:ring-2 focus:ring-[var(--color-accent)]/15",
                ],
            "disabled:opacity-50 disabled:cursor-not-allowed",
            className
          )}
          {...props}
        />

        {error && (
          <p className="text-xs text-red-400 leading-snug" role="alert">
            {error}
          </p>
        )}
      </div>
    );
  }
);

Input.displayName = "Input";
