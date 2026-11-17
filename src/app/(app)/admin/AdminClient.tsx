"use client";
import { useState, useTransition } from "react";
import { createInvite, resolveReport } from "@/app/actions/social";

export function AdminInvite() {
  const [pending, start] = useTransition();
  const [out, setOut] = useState<string | null>(null);
  const [uses, setUses] = useState(5);
  return (
    <div className="space-y-2">
      <label className="label" htmlFor="uses">Uses</label>
      <input id="uses" className="field" type="number" min={1} max={50} value={uses} onChange={(e) => setUses(Number(e.target.value))} />
      <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => { const r = await createInvite(uses, 30); setOut(r.ok ? `${r.data!.code} — ${r.data!.url}` : r.error); })}>Create invite (30 days)</button>
      {out ? <p className="break-all rounded-xl bg-surface-2 p-2 text-sm">{out}</p> : null}
    </div>
  );
}

export function ReportRow({ id, summary }: { id: string; summary: string }) {
  const [pending, start] = useTransition();
  const [done, setDone] = useState(false);
  if (done) return null;
  return (
    <li className="py-2">
      <p className="text-sm">{summary}</p>
      <div className="mt-2 flex gap-2">
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => { await resolveReport(id, "hide"); setDone(true); })}>Hide content</button>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => { await resolveReport(id, "dismiss"); setDone(true); })}>Dismiss</button>
      </div>
    </li>
  );
}
