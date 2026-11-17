"use client";
import { useActionState } from "react";
import Link from "next/link";
import { sendCode, verifyCode, type FormState } from "@/app/actions/auth";

export function LoginForm({ invite = "", notice }: { invite?: string; notice?: string }) {
  const [sent, send, sending] = useActionState<FormState, FormData>(sendCode, null);
  const [verified, verify, verifying] = useActionState<FormState, FormData>(verifyCode, null);
  const step = verified?.step ?? sent?.step ?? "email";
  const email = verified?.email ?? sent?.email ?? "";
  const inv = verified?.invite ?? sent?.invite ?? invite;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="h1">{step === "code" ? "Check your email 📬" : "Sign in"}</h1>
      {notice ? <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">{notice}</p> : null}
      {step === "email" ? (
        <form action={send} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Email</label>
            <input className="field" id="email" name="email" type="email" autoComplete="email" inputMode="email" required />
          </div>
          <div>
            <label className="label" htmlFor="invite">Invite code <span className="font-normal">(new members)</span></label>
            <input className="field uppercase tracking-widest" id="invite" name="invite" defaultValue={inv} autoCapitalize="characters" maxLength={16} />
          </div>
          {sent?.error ? <p role="alert" className="text-sm text-danger">{sent.error}</p> : null}
          <button className="btn-primary w-full" disabled={sending}>{sending ? "Sending…" : "Email me a code"}</button>
        </form>
      ) : (
        <form action={verify} className="mt-6 space-y-4">
          <p className="muted">We emailed a sign-in link to <strong className="text-ink">{email}</strong>.</p>
          <p className="rounded-xl bg-surface-2 p-3 text-sm">
            👉 Open the email <b>on this device</b> and tap <b>Sign in</b>. If the email shows a 6-digit code instead, enter it below.
          </p>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="invite" value={inv} />
          <div>
            <label className="label" htmlFor="token">Code (only if your email has one)</label>
            <input className="field text-center text-2xl tracking-[0.4em]" id="token" name="token" inputMode="numeric" autoComplete="one-time-code" maxLength={10} />
          </div>
          {verified?.error ? <p role="alert" className="text-sm text-danger">{verified.error}</p> : null}
          <button className="btn-primary w-full" disabled={verifying}>{verifying ? "Checking…" : "Sign in"}</button>
        </form>
      )}
      <p className="muted mt-8 text-center"><Link className="underline" href="/privacy">Privacy & disclaimer</Link></p>
    </main>
  );
}
