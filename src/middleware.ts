import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import {
  LOCALE_COOKIE_NAME,
  isLocale,
  localeCookieOptions,
  type Locale,
} from "@/lib/i18n/config";

export async function middleware(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  // The matcher below already excludes `/api`, so this is a defense-in-depth
  // belt-and-suspenders check. API routes own their auth and use
  // `getUserSafe` to distinguish 401 from upstream-network-failure; they
  // must not pay the auth-RTT twice (once here, once in the route).
  const { pathname } = request.nextUrl;
  if (pathname.startsWith("/api/")) return supabaseResponse;

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return request.cookies.getAll(); },
        setAll(cs) {
          cs.forEach(({ name, value }) => request.cookies.set(name, value));
          supabaseResponse = NextResponse.next({ request });
          cs.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options));
        },
      },
    }
  );

  // If the auth-check fetch itself fails (DNS / timeout / offline), we
  // do NOT want to redirect a logged-in user to /login — that would feel
  // like a surprise sign-out for a transient network blip. Pass through
  // and let the page render; downstream RLS-protected fetches will fail
  // visibly if the outage persists.
  let user: { id: string } | null = null;
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      // Same heuristic as getUserSafe — transport-class errors get a soft
      // pass; auth-class errors mean unauthenticated.
      const msg = (error.message ?? "").toLowerCase();
      const looksTransport =
        msg.includes("fetch") ||
        msg.includes("network") ||
        msg.includes("timeout") ||
        msg.includes("connect");
      if (looksTransport) {
        console.warn(
          JSON.stringify({
            source: "middleware",
            event: "auth.fetchFailed",
            path: pathname,
            error: String(error.message ?? error),
          }),
        );
        return supabaseResponse;
      }
    } else {
      user = data?.user ?? null;
    }
  } catch (err) {
    console.warn(
      JSON.stringify({
        source: "middleware",
        event: "auth.fetchFailed",
        path: pathname,
        error: String(err),
      }),
    );
    return supabaseResponse;
  }

  if (!user && pathname.startsWith("/dashboard")) {
    return NextResponse.redirect(new URL("/login", request.url));
  }
  if (
    user &&
    (pathname === "/login" ||
      pathname === "/signup" ||
      pathname === "/forgot-password")
  ) {
    return NextResponse.redirect(new URL("/dashboard", request.url));
  }
  if (user && pathname.startsWith("/dashboard")) {
    const cookieLocale = request.cookies.get(LOCALE_COOKIE_NAME)?.value;
    if (!isLocale(cookieLocale)) {
      try {
        const { data } = await supabase
          .from("profiles")
          .select("language")
          .eq("id", user.id)
          .maybeSingle();
        const profileLocale = data?.language;
        if (isLocale(profileLocale)) {
          supabaseResponse.cookies.set(
            LOCALE_COOKIE_NAME,
            profileLocale satisfies Locale,
            localeCookieOptions,
          );
        }
      } catch (err) {
        console.warn(
          JSON.stringify({
            source: "middleware",
            event: "locale.profileReadFailed",
            path: pathname,
            error: String(err),
          }),
        );
      }
    }
  }
  return supabaseResponse;
}

export const config = {
  // Exclude /api so the middleware doesn't double the auth-RTT on every
  // API call — routes do their own (failure-aware) auth via getUserSafe.
  matcher: ["/((?!_next/static|_next/image|favicon.ico|api/).*)"],
};
