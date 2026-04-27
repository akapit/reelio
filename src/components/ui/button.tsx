import { ButtonHTMLAttributes, forwardRef } from "react";
import { cn } from "@/lib/utils";

type ButtonVariant = "primary" | "secondary" | "ghost";
type ButtonSize = "sm" | "md" | "lg";

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  // Primary uses the .btn-generate gold gradient (handled in globals.css).
  // We reset the conflicting Tailwind reset here so .btn-generate's box-shadow
  // and gradient win.
  primary: [
    "btn-generate",
    "hover:brightness-105",
    "disabled:opacity-50 disabled:cursor-not-allowed",
  ].join(" "),

  secondary: [
    "border",
    "hover:brightness-95",
    "disabled:opacity-40 disabled:cursor-not-allowed",
  ].join(" "),

  ghost: [
    "border border-transparent",
    "hover:brightness-95",
    "disabled:opacity-40 disabled:cursor-not-allowed",
  ].join(" "),
};

const variantStyles: Record<ButtonVariant, React.CSSProperties> = {
  primary: {},
  secondary: {
    background: "var(--bg-1)",
    borderColor: "var(--line-soft)",
    color: "var(--fg-0)",
  },
  ghost: {
    background: "transparent",
    color: "var(--fg-1)",
  },
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
      style,
      disabled,
      children,
      ...props
    },
    ref
  ) => {
    // Primary already gets dimensions from .btn-generate; size class is only
    // applied to non-primary variants so we don't fight the design tokens.
    const dim = variant === "primary" ? "" : sizeClasses[size];
    return (
      <button
        ref={ref}
        disabled={disabled}
        className={cn(
          "inline-flex items-center justify-center font-sans font-medium",
          "transition-[filter,background,border-color] duration-150 outline-none select-none",
          "cursor-pointer focus-visible:outline-1 focus-visible:outline-offset-2",
          variantClasses[variant],
          dim,
          className
        )}
        style={{ ...variantStyles[variant], ...style }}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = "Button";
