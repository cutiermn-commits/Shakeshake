"use client";
import Link from "next/link";
import { useState, useTransition } from "react";
import { applySwap, chooseMeal, getSwapOptions, skipMeal, suggestMeal, type SwapOption } from "@/app/actions/meals";
import { NutritionBadge } from "./ui";

export type SlotView = {
  id: string;
  status: string;
  recipe: { id: string; title: string; per_serving_kcal: number; per_serving_protein_g: number; cook_minutes: number; nutrition_status: string; why: string | null } | null;
};

const REASONS = [
  ["more_protein", "More protein 💪"],
  ["faster", "Faster ⏱️"],
  ["different_protein", "Different protein 🔁"],
  ["veg", "Veg tonight 🥦"],
] as const;

export function MealCard({ mealType, slot, date }: { mealType: "lunch" | "dinner"; slot: SlotView | null; date: string }) {
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  const [options, setOptions] = useState<SwapOption[] | null>(null);
  const [swapping, setSwapping] = useState(false);
  const label = mealType === "lunch" ? "Lunch" : "Dinner";

  const run = (fn: () => Promise<{ ok: boolean; error?: string; note?: string }>) =>
    start(async () => {
      setMsg(null);
      const r = await fn();
      setMsg(r.ok ? (r.note ?? null) : (r.error ?? "Something went wrong."));
    });

  if (!slot?.recipe) {
    return (
      <section className="card" aria-label={label}>
        <h2 className="h2">{label}</h2>
        <p className="muted mt-1">No idea yet — want one?</p>
        <button className="btn-primary mt-3 w-full" disabled={pending} onClick={() => run(() => suggestMeal(mealType, date))}>
          {pending ? "Cooking up an idea…" : `Suggest ${label.toLowerCase()}`}
        </button>
        {msg ? <p role="status" className="mt-2 text-sm text-ink-2">{msg}</p> : null}
      </section>
    );
  }

  const r = slot.recipe;
  return (
    <section className="card" aria-label={label}>
      <div className="flex items-center justify-between gap-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-brand">{label}</span>
        {slot.status === "chosen" ? <span className="rounded-full bg-leaf/15 px-2 py-0.5 text-xs font-semibold text-leaf">Chosen ✓</span> : null}
      </div>
      <h3 className="mt-1 text-xl font-bold">{r.title}</h3>
      {r.why ? <p className="muted mt-1">{r.why}</p> : null}
      <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
        <span className="chip min-h-0 py-1 font-semibold">💪 {Math.round(r.per_serving_protein_g)} g protein</span>
        <span className="chip min-h-0 py-1">🔥 {r.per_serving_kcal} kcal</span>
        <span className="chip min-h-0 py-1">⏱️ {r.cook_minutes} min</span>
        <NutritionBadge status={r.nutrition_status} />
      </div>
      <div className="mt-4 grid grid-cols-3 gap-2">
        <button className="btn-primary btn-sm" disabled={pending || slot.status === "chosen"} onClick={() => run(() => chooseMeal(slot.id))}>Choose</button>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => setSwapping((s) => !s)} aria-expanded={swapping}>Swap</button>
        <Link className="btn-ghost btn-sm" href={`/recipe/${r.id}`}>Recipe</Link>
      </div>
      {swapping ? (
        <div className="mt-3 space-y-2">
          <p className="text-sm">Not feeling it? No heartbreak here — let&apos;s find you a better match.</p>
          <div className="flex flex-wrap gap-2">
            {REASONS.map(([k, l]) => (
              <button key={k} className="chip" disabled={pending} onClick={() => start(async () => {
                setMsg(null);
                setOptions(null);
                const res = await getSwapOptions(slot.id, k);
                if (res.ok) {
                  setOptions(res.data ?? []);
                  setMsg(res.note ?? null);
                } else setMsg(res.error);
              })}>{l}</button>
            ))}
          </div>
          {pending && !options ? <p className="muted" role="status">Finding three more options…</p> : null}
          {options?.map((o) => (
            <button key={o.id} className="w-full rounded-xl border border-line p-3 text-left hover:border-brand" disabled={pending} onClick={() => run(async () => {
              const res = await applySwap(slot.id, o.id);
              if (res.ok) { setOptions(null); setSwapping(false); return { ok: true, note: "Swapped! The new one tried harder." }; }
              return res;
            })}>
              <span className="block font-semibold">{o.title}</span>
              <span className="text-sm text-ink-2">💪 {Math.round(o.per_serving_protein_g)} g · 🔥 {o.per_serving_kcal} kcal · ⏱️ {o.cook_minutes} min</span>
            </button>
          ))}
          <button className="text-sm text-ink-2 underline" onClick={() => run(() => skipMeal(slot.id))}>Skip this meal today</button>
        </div>
      ) : null}
      {msg ? <p role="status" className="mt-2 text-sm text-ink-2">{msg}</p> : null}
    </section>
  );
}
