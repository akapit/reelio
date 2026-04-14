import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import type { SupabaseClient, User } from "@supabase/supabase-js";

export async function createClient() {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() { return cookieStore.getAll(); },
        setAll(cs) {
          cs.forEach(({ name, value, options }) =>
            cookieStore.set(name, value, options));
        },
      },
    }
  );
}

/**
 * Result of `getUserSafe`. Distinguishes three cases the bare
 * `supabase.auth.getUser()` collapses into "user is null":
 *   - `ok`            → an authenticated user was returned.
 *   - `unauthenticated` → Supabase responded but no session is attached.
 *   - `fetchFailed`   → the call to Supabase itself failed (DNS, timeout,
 *                       offline). The route should NOT respond 401 here —
 *                       it's a 503 / upstream-unavailable condition.
 */
export type SafeUserResult =
  | { kind: "ok"; user: User }
  | { kind: "unauthenticated" }
  | { kind: "fetchFailed"; error: unknown };

/**
 * Detect "the auth check itself errored at the network/transport layer"
 * vs "Supabase replied and the user is unauthenticated".
 *
 * The Supabase JS SDK swallows fetch failures into `{ data: { user: null },
 * error: AuthRetryableFetchError }` rather than throwing, so callers that
 * naively destructure `{ data: { user } }` cannot tell the difference and
 * end up returning misleading 401s on transient network blips.
 *
 * Strategy: one quick attempt, then on transport-class failure exactly one
 * retry with a short backoff. We do NOT loop forever — if the second
 * attempt also fails the user gets a clear error.
 */
export async function getUserSafe(
  supabase: SupabaseClient,
): Promise<SafeUserResult> {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      const { data, error } = await supabase.auth.getUser();
      if (error) {
        // Network-class errors: AuthRetryableFetchError ("fetch failed",
        // "Failed to fetch", AbortError, ConnectTimeoutError-wrapped).
        const msg = (error.message ?? "").toLowerCase();
        const looksTransport =
          msg.includes("fetch") ||
          msg.includes("network") ||
          msg.includes("timeout") ||
          msg.includes("connect");
        if (looksTransport && attempt === 0) {
          await new Promise((r) => setTimeout(r, 250));
          continue;
        }
        if (looksTransport) {
          return { kind: "fetchFailed", error };
        }
        // Non-transport auth error → treat as unauthenticated.
        return { kind: "unauthenticated" };
      }
      if (data?.user) return { kind: "ok", user: data.user };
      return { kind: "unauthenticated" };
    } catch (err) {
      // The SDK normally returns errors in `error`, but defend against
      // raw throws from underlying fetch (e.g. Edge runtime aborts).
      if (attempt === 0) {
        await new Promise((r) => setTimeout(r, 250));
        continue;
      }
      return { kind: "fetchFailed", error: err };
    }
  }
  // Unreachable, but TypeScript wants exhaustiveness.
  return { kind: "fetchFailed", error: new Error("getUserSafe: exhausted retries") };
}
