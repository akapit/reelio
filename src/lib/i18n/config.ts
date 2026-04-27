export const LOCALE_COOKIE_NAME = "reelio_locale";

export const LOCALES = ["en", "he"] as const;
export type Locale = (typeof LOCALES)[number];
export type Direction = "ltr" | "rtl";

export const DEFAULT_LOCALE: Locale = "en";

export function isLocale(value: unknown): value is Locale {
  return typeof value === "string" && (LOCALES as readonly string[]).includes(value);
}

export function parseLocale(value: unknown): Locale {
  return isLocale(value) ? value : DEFAULT_LOCALE;
}

export function dirForLocale(locale: Locale): Direction {
  return locale === "he" ? "rtl" : "ltr";
}

export const localeCookieOptions = {
  path: "/",
  sameSite: "lax" as const,
  maxAge: 60 * 60 * 24 * 365,
};
