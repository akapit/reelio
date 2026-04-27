import { cookies } from "next/headers";
import {
  DEFAULT_LOCALE,
  LOCALE_COOKIE_NAME,
  localeCookieOptions,
  parseLocale,
  type Locale,
} from "./config";

export async function getRequestLocale(): Promise<Locale> {
  const cookieStore = await cookies();
  return parseLocale(cookieStore.get(LOCALE_COOKIE_NAME)?.value ?? DEFAULT_LOCALE);
}

export async function setRequestLocale(locale: Locale) {
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE_NAME, locale, localeCookieOptions);
}
