import { createBrowserClient } from "@supabase/ssr";

/** Browser client (singleton inside @supabase/ssr). Pattern VERIFIED: Supabase SSR guide, 2026-11-17. */
export function createClient() {
  return createBrowserClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!);
}
