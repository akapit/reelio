import { createBrowserClient } from "@supabase/ssr";

function createBrowserSupabaseClient() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
  );
}

let browserClient: ReturnType<typeof createBrowserSupabaseClient> | null = null;

export function createClient() {
  browserClient ??= createBrowserSupabaseClient();
  return browserClient;
}
