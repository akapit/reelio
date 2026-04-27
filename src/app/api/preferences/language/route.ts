import { NextResponse } from "next/server";
import { createClient, getUserSafe } from "@/lib/supabase/server";
import {
  LOCALE_COOKIE_NAME,
  isLocale,
  localeCookieOptions,
  type Locale,
} from "@/lib/i18n/config";

export async function POST(request: Request) {
  let locale: Locale;
  try {
    const body = (await request.json()) as { locale?: unknown };
    if (!isLocale(body.locale)) {
      return NextResponse.json({ error: "Invalid locale" }, { status: 400 });
    }
    locale = body.locale;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  let profileSaved = false;

  const supabase = await createClient();
  const auth = await getUserSafe(supabase);
  if (auth.kind === "ok") {
    const { error } = await supabase
      .from("profiles")
      .update({ language: locale })
      .eq("id", auth.user.id);

    if (error) {
      console.error("[preferences.language] profile update failed", {
        userId: auth.user.id,
        locale,
        message: error.message,
      });
    } else {
      profileSaved = true;
    }
  }

  const response = NextResponse.json({ locale, profileSaved });
  response.cookies.set(LOCALE_COOKIE_NAME, locale, localeCookieOptions);
  return response;
}
