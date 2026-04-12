import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary: [
    "bg-[var(--color-accent)] text-[#0e0e0f] font-medium",
    "hover:bg-[#d9b85c] active:bg-[var(--color-accent-dim)]",
    "focus-visible:ring-2 focus-visible:ring-[var(--color-accent)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
    "disabled:bg-[var(--color-accent-dim)] disabled:text-[#0e0e0f]/50 disabled:cursor-not-allowed",
  ].join(" "),

  secondary: [
    "bg-[var(--color-surface)] text-[var(--color-foreground)] border border-[var(--color-border)]",
    "hover:bg-[var(--color-surface-raised)] hover:border-[#3a3a3e]",
    "active:bg-[var(--color-surface)]",
    "focus-visible:ring-2 focus-visible:ring-[var(--color-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
    "disabled:opacity-40 disabled:cursor-not-allowed",
  ].join(" "),

  ghost: [
    "bg-transparent text-[var(--color-foreground)]",
    "hover:bg-[var(--color-surface-raised)]",
    "active:bg-[var(--color-surface)]",
    "focus-visible:ring-2 focus-visible:ring-[var(--color-border)] focus-visible:ring-offset-2 focus-visible:ring-offset-[var(--color-background)]",
    "disabled:opacity-40 disabled:cursor-not-allowed",
  ].join(" "),
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: "h-8 px-3 text-sm rounded-md gap-1.5",
  md: "h-10 px-4 text-sm rounded-lg gap-2",
  lg: "h-12 px-6 text-base rounded-lg gap-2.5",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      variant = "primary",
      size = "md",
      className,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center font-sans font-medium",
          "transition-colors duration-150 outline-none select-none",
          "cursor-pointer",
          variantClasses[variant],
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
