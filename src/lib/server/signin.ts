import "server-only";
import type { SupabaseClient } from "@supabase/supabase-js";

/** A friendly starting name from the email ("priya.k@…" → "Priya K"); editable in onboarding. */
export function nameFromEmail(email: string): string {
  const local = email.split("@")[0] ?? "";
  const words = local
    .replace(/[0-9]+/g, " ")
    .split(/[._+\-\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase());
  return (words.join(" ") || "Friend").slice(0, 40);
}

/**
 * Where to go right after a successful sign-in (code or link).
 * New person + invite code → join automatically (redeem_invite) → onboarding. No separate welcome step.
 */
export async function afterSignIn(supabase: SupabaseClient, invite: string | null | undefined): Promise<string> {
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  const email = (claims?.claims?.email as string | undefined) ?? "";
  if (!uid) return "/login?error=link";
  const { data: profile } = await supabase.from("profiles").select("onboarded").eq("id", uid).maybeSingle();
  if (profile) return profile.onboarded ? "/today" : "/onboarding";
  const code = (invite ?? "").trim().toUpperCase();
  if (/^[A-Z0-9]{6,16}$/.test(code)) {
    const { error } = await supabase.rpc("redeem_invite", { p_code: code, p_display_name: nameFromEmail(email) });
    if (!error) return "/onboarding";
    console.warn("[signin] redeem_invite failed", error.message);
  }
  return code ? `/welcome?invite=${encodeURIComponent(code)}&bad=1` : "/welcome";
}
