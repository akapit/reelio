export const reelioDesignSystem = {
  name: "reelio",
  description: "Premium real-estate media tooling with cinematic gold accents.",
  assets: {
    logo: {
      forDark: "/brand/reelio-logo-reelio-for-dark.png",
      forLight: "/brand/reelio-logo-reelio-for-light.png",
      lowercaseForDark: "/brand/reelio-logo-for-dark.png",
      lowercaseForLight: "/brand/reelio-logo-for-light.png",
    },
    mark: {
      gold: "/brand/reelio-mark-gold.png",
    },
  },
  color: {
    primitive: {
      black: "#050402",
      charcoal900: "#15110a",
      charcoal800: "#211a11",
      cream50: "#fff8ec",
      cream100: "#f7f0e4",
      cream200: "#eee4d5",
      gold300: "#ffd986",
      gold400: "#f5b84d",
      gold500: "#d79a2d",
      gold700: "#7a4d12",
      white: "#ffffff",
    },
    semantic: {
      light: {
        background: "oklch(0.975 0.008 80)",
        surface: "oklch(0.99 0.006 82)",
        surfaceRaised: "oklch(0.955 0.010 80)",
        border: "oklch(0.55 0.020 70 / 0.30)",
        text: "oklch(0.20 0.010 70)",
        textMuted: "oklch(0.46 0.012 70)",
        accent: "oklch(0.66 0.12 75)",
        accentHighlight: "oklch(0.74 0.13 78)",
        accentShadow: "oklch(0.52 0.11 70)",
      },
      dark: {
        background: "oklch(0.10 0.006 72)",
        surface: "oklch(0.16 0.008 72)",
        surfaceRaised: "oklch(0.20 0.008 72)",
        border: "oklch(0.45 0.010 70 / 0.35)",
        text: "oklch(0.96 0.010 80)",
        textMuted: "oklch(0.74 0.010 80)",
        accent: "oklch(0.74 0.13 78)",
        accentHighlight: "oklch(0.90 0.14 88)",
        accentShadow: "oklch(0.55 0.10 72)",
      },
    },
  },
  gradient: {
    goldRibbon:
      "linear-gradient(180deg, oklch(0.92 0.16 88) 0%, oklch(0.78 0.14 80) 52%, oklch(0.55 0.10 72) 100%)",
    goldButton:
      "linear-gradient(180deg, oklch(0.74 0.13 78) 0%, oklch(0.52 0.11 70) 100%)",
    darkBrandWash:
      "radial-gradient(80% 70% at 38% 35%, oklch(0.64 0.13 75 / 0.36), transparent 62%), linear-gradient(135deg, oklch(0.12 0.006 72), oklch(0.04 0.004 72))",
    lightBrandWash:
      "radial-gradient(80% 70% at 68% 35%, oklch(0.78 0.13 78 / 0.20), transparent 64%), linear-gradient(135deg, oklch(0.99 0.006 82), oklch(0.94 0.012 78))",
  },
  typography: {
    display: "var(--font-heebo), Heebo, ui-sans-serif, system-ui, sans-serif",
    sans: "var(--font-heebo), Heebo, ui-sans-serif, system-ui, sans-serif",
    mono: "var(--font-heebo), Heebo, ui-monospace, SFMono-Regular, Menlo, monospace",
    wordmark: {
      family: "Heebo, Arial, Helvetica, sans-serif",
      weight: 500,
      letterSpacing: "-0.03em",
    },
  },
  radius: {
    control: 8,
    iconTile: 18,
    card: 14,
    modal: 18,
  },
  shadow: {
    card:
      "0 1px 0 rgba(255, 255, 255, 0.7) inset, 0 1px 2px rgba(60, 40, 10, 0.04), 0 6px 18px -10px rgba(60, 40, 10, 0.10)",
    gold:
      "0 0 0 1px oklch(0.66 0.12 75 / 0.25), 0 12px 32px -8px oklch(0.66 0.12 75 / 0.30), 0 0 0 6px oklch(0.66 0.12 75 / 0.05)",
    darkLogoGlow: "0 18px 52px oklch(0.72 0.15 80 / 0.35)",
  },
  motion: {
    ease: "cubic-bezier(.2, .8, .2, 1)",
    quick: "150ms",
    standard: "240ms",
  },
} as const;

export type ReelioDesignSystem = typeof reelioDesignSystem;
