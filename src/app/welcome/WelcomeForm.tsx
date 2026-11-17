"use client";
import { useActionState } from "react";
import { redeemInvite, type FormState } from "@/app/actions/auth";

export function WelcomeForm({ invite }: { invite: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(redeemInvite, null);
  return (
    <form action={action} className="mt-6 space-y-4">
      <div>
        <label className="label" htmlFor="name">What should friends call you?</label>
        <input className="field" id="name" name="name" maxLength={40} required autoComplete="nickname" />
      </div>
      <div>
        <label className="label" htmlFor="code">Invite code</label>
        <input className="field uppercase tracking-widest" id="code" name="code" defaultValue={invite} required maxLength={16} />
      </div>
      {state?.error ? <p role="alert" className="text-sm text-danger">{state.error}</p> : null}
      <button className="btn-primary w-full" disabled={pending}>{pending ? "Joining…" : "Join Shake Shake"}</button>
    </form>
  );
}
