"use client";
import { useState, useTransition } from "react";
import { planMyWeek, setSlotServings } from "@/app/actions/meals";

export function PlanButton({ weekOf, hasPlan }: { weekOf: string; hasPlan: boolean }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <div>
      <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => {
        if (hasPlan && !confirm("Replace this week's plan? Chosen meals will be replaced too.")) return;
        const r = await planMyWeek(weekOf);
        setMsg(r.ok ? (r.note ?? null) : r.error);
      })}>
        {pending ? "Planning 14 meals… (≈ 30 s)" : hasPlan ? "Re-plan this week" : "✨ Plan my week"}
      </button>
      {msg ? <p role="status" className="mt-2 text-sm text-ink-2">{msg}</p> : null}
    </div>
  );
}

export function Servings({ slotId, value }: { slotId: string; value: number }) {
  const [v, setV] = useState(value);
  const [, start] = useTransition();
  return (
    <label className="flex items-center gap-1 text-xs text-ink-2">
      Serves
      <select className="rounded-lg border border-line bg-surface px-1 py-1" value={v} onChange={(e) => { const n = Number(e.target.value); setV(n); start(async () => void (await setSlotServings(slotId, n))); }}>
        {[1, 2, 3, 4, 5, 6].map((n) => <option key={n} value={n}>{n}</option>)}
      </select>
    </label>
  );
}
