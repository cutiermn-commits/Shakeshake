"use client";
import { useActionState, useState } from "react";
import Link from "next/link";
import { authFlow, type FormState } from "@/app/actions/auth";

/**
 * Sign in: 1) email → "Send code"  2) enter the 6-digit code → app.
 * Only a brand-new email is asked for an invite code (pre-filled when opened from an invite link).
 */
export function LoginForm({ invite = "", notice }: { invite?: string; notice?: string }) {
  const [state, act, busy] = useActionState<FormState, FormData>(authFlow, null);
  const [restart, setRestart] = useState(false);
  const latest = restart ? null : state;
  const submit = (f: FormData) => {
    setRestart(false);
    act(f);
  };
  const step = latest?.step ?? "email";
  const email = latest?.email ?? "";
  const inv = latest?.invite ?? invite;

  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="h1">{step === "code" ? "Enter your code 📬" : step === "invite" ? "Welcome! 👋" : "Sign in"}</h1>
      {notice ? <p className="mt-2 rounded-xl bg-surface-2 p-3 text-sm">{notice}</p> : null}

      {step === "email" ? (
        <form action={submit} className="mt-6 space-y-4">
          <div>
            <label className="label" htmlFor="email">Your email</label>
            <input className="field" id="email" name="email" type="email" autoComplete="email" inputMode="email" defaultValue={email} required autoFocus />
          </div>
          {inv ? (
            <p className="rounded-xl bg-surface-2 p-3 text-sm">🎟️ You&apos;re joining with invite <b className="tracking-widest">{inv}</b>.</p>
          ) : null}
          <input type="hidden" name="invite" value={inv} />
          {latest?.error ? <p role="alert" className="text-sm text-danger">{latest.error}</p> : null}
          <button className="btn-primary w-full" name="intent" value="send" disabled={busy}>{busy ? "Sending…" : "Send me a code"}</button>
        </form>
      ) : null}

      {step === "invite" ? (
        <form action={submit} className="mt-6 space-y-4">
          <p>
            <b>{email}</b> isn&apos;t a member yet. Shake Shake is invite-only, so new members need an <b>invite code</b>.
          </p>
          <ul className="list-disc space-y-1 pl-5 text-sm text-ink-2">
            <li>It&apos;s a short code of letters and numbers, like <b className="text-ink">K7QM4XPA</b>.</li>
            <li>The friend who invited you can create one in the app: <b className="text-ink">Me → Friends → Create invite link</b>. If they send the link, it fills this in for you.</li>
          </ul>
          <input type="hidden" name="email" value={email} />
          <div>
            <label className="label" htmlFor="invite">Invite code</label>
            <input className="field text-center text-xl uppercase tracking-[0.3em]" id="invite" name="invite" defaultValue={inv} autoCapitalize="characters" autoComplete="off" maxLength={16} required autoFocus />
          </div>
          {latest?.error ? <p role="alert" className="text-sm text-danger">{latest.error}</p> : null}
          <button className="btn-primary w-full" name="intent" value="send" disabled={busy}>{busy ? "Checking…" : "Join & send me a code"}</button>
          <button type="button" className="btn-ghost w-full" onClick={() => setRestart(true)}>Use a different email</button>
        </form>
      ) : null}

      {step === "code" ? (
        <form action={submit} className="mt-6 space-y-4">
          <p className="muted">We sent a 6-digit code to <strong className="text-ink">{email}</strong>. It can take a minute — check spam too.</p>
          <input type="hidden" name="email" value={email} />
          <input type="hidden" name="invite" value={inv} />
          <div>
            <label className="label" htmlFor="token">Code</label>
            <input className="field text-center text-3xl tracking-[0.4em]" id="token" name="token" inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]*" maxLength={10} required autoFocus />
          </div>
          {latest?.error ? <p role="alert" className="text-sm text-danger">{latest.error}</p> : null}
          <button className="btn-primary w-full" name="intent" value="verify" disabled={busy}>{busy ? "Checking…" : "Sign in"}</button>
          <div className="flex justify-between text-sm">
            <button type="button" className="min-h-11 underline" onClick={() => setRestart(true)}>Change email</button>
            <button type="submit" name="intent" value="send" className="min-h-11 underline" formNoValidate disabled={busy}>Send a new code</button>
          </div>
          <p className="muted text-xs">If the email shows a “Sign in” button instead of a code, tap it on this phone — that works too.</p>
        </form>
      ) : null}

      <p className="muted mt-8 text-center"><Link className="underline" href="/privacy">Privacy & disclaimer</Link></p>
    </main>
  );
}
