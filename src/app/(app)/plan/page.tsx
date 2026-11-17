import { Suspense } from "react";
import Link from "next/link";
import { getConsents, requireMember } from "@/lib/server/dal";
import { slotsBetween } from "@/lib/server/stats";
import { addDays, weekStart } from "@/lib/nutrition/balance";
import { MealCard } from "@/components/MealCard";
import { NutritionBadge, Page, PageSkeleton } from "@/components/ui";
import { PlanButton, Servings } from "./PlanActions";

export const metadata = { title: "Week plan" };

async function Plan({ searchParams }: { searchParams: Promise<{ week?: string; day?: string }> }) {
  const { uid, supabase, today } = await requireMember();
  const sp = await searchParams;
  const ws = sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? weekStart(sp.week) : weekStart(today);
  const [slots, consents] = await Promise.all([slotsBetween(supabase, uid, ws, addDays(ws, 6)), getConsents()]);
  const days = Array.from({ length: 7 }, (_, i) => addDays(ws, i));
  const fmt = (d: string, o: Intl.DateTimeFormatOptions) => new Date(`${d}T00:00:00Z`).toLocaleDateString("en-IN", { ...o, timeZone: "UTC" });
  const openDay = sp.day && days.includes(sp.day) ? sp.day : null;

  return (
    <Page title="Week plan" subtitle={`${fmt(ws, { day: "numeric", month: "short" })} – ${fmt(addDays(ws, 6), { day: "numeric", month: "short" })}`}>
      <div className="flex justify-between">
        <Link className="btn-ghost btn-sm" href={`/plan?week=${addDays(ws, -7)}`}>← Prev</Link>
        {ws !== weekStart(today) ? <Link className="btn-ghost btn-sm" href="/plan">This week</Link> : null}
        <Link className="btn-ghost btn-sm" href={`/plan?week=${addDays(ws, 7)}`}>Next →</Link>
      </div>
      {consents.ai_processing ? <PlanButton weekOf={ws} hasPlan={slots.length > 0} /> : <p className="card text-sm">Weekly planning uses AI — switch it on in <Link className="underline" href="/settings">Settings</Link>.</p>}
      {openDay ? (
        <>
          <h2 className="h2">{fmt(openDay, { weekday: "long", day: "numeric", month: "short" })}</h2>
          <MealCard mealType="lunch" slot={slots.find((s) => s.date === openDay && s.meal_type === "lunch") ?? null} date={openDay} />
          <MealCard mealType="dinner" slot={slots.find((s) => s.date === openDay && s.meal_type === "dinner") ?? null} date={openDay} />
          <Link href={`/plan?week=${ws}`} className="btn-ghost w-full">Back to week</Link>
        </>
      ) : (
        <ul className="space-y-2">
          {days.map((d) => (
            <li key={d} className={`card ${d === today ? "border-brand" : ""}`}>
              <div className="flex items-center justify-between">
                <h2 className="font-semibold">{fmt(d, { weekday: "short", day: "numeric" })}{d === today ? " · today" : ""}</h2>
                <Link className="text-sm underline" href={`/plan?week=${ws}&day=${d}`}>Swap / choose</Link>
              </div>
              {(["lunch", "dinner"] as const).map((m) => {
                const s = slots.find((x) => x.date === d && x.meal_type === m);
                return (
                  <div key={m} className="mt-2 flex items-center justify-between gap-2 text-sm">
                    <span className="min-w-0">
                      <span className="text-xs uppercase text-ink-2">{m}</span>{" "}
                      {s?.recipe ? (
                        <Link className={`font-medium ${s.status === "skipped" ? "line-through opacity-60" : ""}`} href={`/recipe/${s.recipe.id}`}>{s.recipe.title}</Link>
                      ) : (
                        <span className="text-ink-2">—</span>
                      )}
                      {s?.recipe ? <span className="text-ink-2"> · {Math.round(s.recipe.per_serving_protein_g)} g</span> : null}
                    </span>
                    {s?.recipe ? (
                      <span className="flex shrink-0 items-center gap-2">
                        <NutritionBadge status={s.recipe.nutrition_status} />
                        <Servings slotId={s.id} value={s.servings} />
                      </span>
                    ) : null}
                  </div>
                );
              })}
            </li>
          ))}
        </ul>
      )}
      {slots.length ? <Link href={`/grocery?week=${ws}`} className="btn-primary w-full">🛒 Grocery list for this week</Link> : null}
    </Page>
  );
}

export default function PlanPage({ searchParams }: { searchParams: Promise<{ week?: string; day?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton title="Week plan" />}>
      <Plan searchParams={searchParams} />
    </Suspense>
  );
}
