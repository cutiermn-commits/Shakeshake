import { Suspense } from "react";
import Link from "next/link";
import { getConsents, getTargets, requireMember } from "@/lib/server/dal";
import { dayTotals, slotsBetween } from "@/lib/server/stats";
import { addDays, isSafetyMode } from "@/lib/nutrition/balance";
import { MESSAGE_LIBRARY } from "@/lib/messages/library.generated";
import { MealCard } from "@/components/MealCard";
import { PushSetup } from "@/components/PushSetup";
import { Meter, Page, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Today" };

function greetingFor(category: string, seed: string) {
  const pool = MESSAGE_LIBRARY.filter((m) => m.category === category);
  let h = 0;
  for (const c of seed) h = (h * 31 + c.charCodeAt(0)) >>> 0;
  return pool[h % pool.length]?.text ?? "";
}

async function Today({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { uid, profile, supabase, today } = await requireMember();
  const sp = await searchParams;
  const [targets, consents, slots, days] = await Promise.all([getTargets(), getConsents(), slotsBetween(supabase, uid, today, today), dayTotals(supabase, uid, addDays(today, -4), today)]);
  const t = days.find((d) => d.date === today)!;
  const safety = isSafetyMode(days, today);
  const lunch = slots.find((s) => s.meal_type === "lunch") ?? null;
  const dinner = slots.find((s) => s.meal_type === "dinner") ?? null;
  const headline = safety ? greetingFor("caring", today) : sp.welcome ? "Welcome to Shake Shake! Let's find you something delicious. 🍳" : greetingFor("morning", today + uid);

  return (
    <Page title={`Hi ${profile.display_name}`} subtitle={headline} action={<Link href="/inbox" className="btn-ghost btn-sm" aria-label="Inbox">💌</Link>}>
      {sp.low_kcal ? (
        <p className="card border-warn text-sm">Your calorie target is below your estimated resting needs. Consider checking with a doctor or dietitian before going this low.</p>
      ) : null}
      {!consents.ai_processing ? (
        <p className="card text-sm">AI recipe ideas are off or need your OK again (we added Groq · Qwen as the main AI). Review it in <Link className="underline" href="/settings">Settings → Privacy choices</Link>. Meanwhile ideas come from the built-in recipe library.</p>
      ) : null}
      <section className="card space-y-3" aria-label="Today so far">
        <Meter label="Protein" value={t.proteinG} min={targets?.protein_g_min ?? null} max={targets?.protein_g_max ?? null} />
        <Meter label="Calories" value={t.intakeKcal} min={targets?.kcal_min ?? null} max={targets?.kcal_max ?? null} />
        <p className="muted">
          {t.mealsLogged ? `${t.mealsLogged} meal${t.mealsLogged > 1 ? "s" : ""} logged.` : "No meals logged yet — the plate is clean and full of possibility."}{" "}
          <Link href="/dashboard" className="underline">Balance & burn →</Link>
        </p>
      </section>
      <MealCard mealType="lunch" slot={lunch} date={today} />
      <MealCard mealType="dinner" slot={dinner} date={today} />
      <PushSetup compact />
    </Page>
  );
}

export default function TodayPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={<PageSkeleton title="Today" />}>
      <Today searchParams={searchParams} />
    </Suspense>
  );
}
