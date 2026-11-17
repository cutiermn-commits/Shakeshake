"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";

export type FormState = { ok?: boolean; error?: string; step?: "email" | "code"; email?: string; invite?: string } | null;

const EmailSchema = z.object({
  email: z.email().max(254),
  invite: z
    .string()
    .trim()
    .toUpperCase()
    .regex(/^[A-Z0-9]{6,16}$/)
    .optional()
    .or(z.literal("")),
});

/**
 * Step 1: send an email OTP / magic link (D-020). New accounts are only created when a valid
 * invite code is supplied (INVITE_ONLY, M1-01). The invite is re-checked and consumed in
 * redeem_invite() after sign-in — this pre-check just avoids creating orphan auth users.
 */
export async function sendCode(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = EmailSchema.safeParse({ email: form.get("email"), invite: form.get("invite") ?? "" });
  if (!parsed.success) return { error: "Please enter a valid email (and invite code, if you have one)." };
  const { email, invite } = parsed.data;
  const supabase = await createClient();
  let shouldCreateUser = process.env.INVITE_ONLY === "false";
  if (invite) {
    const { data } = await supabase.rpc("invite_is_valid", { p_code: invite });
    if (data !== true) return { error: "That invite code isn't valid or has expired." };
    shouldCreateUser = true;
  }
  const { error } = await supabase.auth.signInWithOtp({
    email,
    options: {
      shouldCreateUser,
      // After the link: new members go to /welcome to redeem the invite, others to /today.
      emailRedirectTo: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/auth/confirm?next=${encodeURIComponent(invite ? `/welcome?invite=${invite}` : "/today")}`,
    },
  });
  if (error) {
    // Don't reveal whether an account exists.
    if (/signups? not allowed|not found/i.test(error.message)) return { error: "We couldn't find an account for that email. New here? Add your invite code." };
    return { error: "Couldn't send the code right now. Please try again in a minute." };
  }
  return { ok: true, step: "code", email, invite: invite || undefined };
}

export async function verifyCode(_prev: FormState, form: FormData): Promise<FormState> {
  const email = String(form.get("email") ?? "");
  const token = String(form.get("token") ?? "").replace(/\s/g, "");
  const invite = String(form.get("invite") ?? "");
  if (!/^\d{6,10}$/.test(token)) return { error: "Enter the code from your email.", step: "code", email, invite };
  const supabase = await createClient();
  const { error } = await supabase.auth.verifyOtp({ email, token, type: "email" });
  if (error) return { error: "That code didn't work — check it or request a new one.", step: "code", email, invite };
  redirect(invite ? `/welcome?invite=${encodeURIComponent(invite)}` : "/today");
}

const RedeemSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,16}$/),
  name: z.string().trim().min(1).max(40),
});

export async function redeemInvite(_prev: FormState, form: FormData): Promise<FormState> {
  const parsed = RedeemSchema.safeParse({ code: form.get("code"), name: form.get("name") });
  if (!parsed.success) return { error: "Please enter your name and a valid invite code." };
  const supabase = await createClient();
  const { error } = await supabase.rpc("redeem_invite", { p_code: parsed.data.code, p_display_name: parsed.data.name });
  if (error) return { error: "That invite code isn't valid or has expired. Ask your friend for a new one." };
  redirect("/onboarding");
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/login");
}
