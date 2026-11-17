"use client";
import { useState, useTransition } from "react";
import { saveBurn } from "@/app/actions/log";

export function BurnForm({ date, current }: { date: string; current: number | null }) {
  const [value, setValue] = useState(current != null ? String(current) : "");
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  return (
    <div>
    <form
      className="flex items-end gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        start(async () => {
          const r = await saveBurn({ date, active_kcal: Number(value) });
          setMsg(r.ok ? (r.note ?? "Saved") : r.error);
        });
      }}
    >
      <div className="flex-1">
        <label className="label" htmlFor="active_kcal">Active calories today (from your Oura app)</label>
        <input id="active_kcal" className="field" type="number" inputMode="numeric" min={0} max={6000} value={value} onChange={(e) => setValue(e.target.value)} required />
      </div>
      <button className="btn-primary" disabled={pending || value === ""}>{current != null ? "Update" : "Save"}</button>
    </form>
    {msg ? <p role="status" className="mt-2 text-sm text-ink-2">{msg}</p> : null}
    </div>
  );
}
