"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { afterSignIn } from "@/lib/server/signin";

export type FormState = { ok?: boolean; error?: string; step?: "email" | "invite" | "code"; email?: string; invite?: string } | null;

const Email = z.email().max(254);
const Invite = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,16}$/);

/**
 * Sign-in step 1 (D-020, M1-01): email → one-time code.
 * Existing members just get a code. A new email gets the "invite code" step (invite-only, D-002);
 * an invite link pre-fills it so invitees never type it.
 */
export async function sendCode(_prev: FormState, form: FormData): Promise<FormState> {
  const emailParsed = Email.safeParse(String(form.get("email") ?? "").trim().toLowerCase());
  if (!emailParsed.success) return { step: "email", error: "Please enter a valid email address." };
  const email = emailParsed.data;
  const rawInvite = String(form.get("invite") ?? "").trim();
  const supabase = await createClient();

  let invite: string | undefined;
  if (rawInvite) {
    const inv = Invite.safeParse(rawInvite);
    const { data } = inv.success ? await supabase.rpc("invite_is_valid", { p_code: inv.data }) : { data: false };
    if (data !== true) return { step: "invite", email, invite: rawInvite, error: "That invite code isn't valid or has expired. Ask the person who invited you for a new one." };
    invite = inv.data;
  }

  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser: !!invite || process.env.INVITE_ONLY === "false",
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm${invite ? `?invite=${invite}` : ""}`,
    },
  });
  if (error) {
    if (/signups? not allowed|not found|otp_disabled/i.test(`${error.message} ${(error as { code?: string }).code ?? ""}`)) {
      // Email not registered yet → ask for the invite code.
      return { step: "invite", email };
    }
    if (/rate|too many|seconds/i.test(error.message)) return { step: "email", email, error: "Too many requests — please wait a minute, then try again." };
    console.error("[auth] signInWithOtp failed", error.message);
    return { step: "email", email, error: "Couldn't send the code right now. Please try again in a minute." };
  }
  return { ok: true, step: "code", email, invite };
}

/** Step 2: verify the 6-digit code, then go straight into the app (or onboarding for new people). */
export async function verifyCode(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const token = String(form.get("token") ?? "").replace(/\D/g, "");
  const invite = String(form.get("invite") ?? "") || undefined;
  if (!/^\d{6,10}$/.test(token)) return { step: "code", email, invite, error: "Enter the code from your email." };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { step: "code", email, invite, error: "That code didn't work or has expired. Check it, or tap “Send a new code”." };
  redirect(await afterSignIn(supabase, invite));
}

/** Fallback for a signed-in person without a profile whose invite failed (e.g. expired). */
export async function redeemInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const code = Invite.safeParse(form.get("code"));
  const name = z.string().trim().min(1).max(40).safeParse(form.get("name"));
  if (!code.success || !name.success) return { error: "Please enter your name and the invite code you were given." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_invite", { p_code: code.data, p_display_name: name.data });
  if (error) return { error: "That invite code isn't valid or has expired. Ask the person who invited you for a new one." };
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}

/** Single entry point for the login form: the submit button's `intent` picks the step. */
export async function authFlow(prev: FormState, form: FormData): Promise<FormState> {
  return form.get("intent") === "verify" ? verifyCode(prev, form) : sendCode(prev, form);
}
