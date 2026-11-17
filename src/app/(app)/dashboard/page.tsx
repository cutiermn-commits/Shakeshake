import { Suspense } from "react";
import Link from "next/link";
import { getTargets, requireMember } from "@/lib/server/dal";
import { dayTotals } from "@/lib/server/stats";
import { addDays, dailyBalance } from "@/lib/nutrition/balance";
import { Meter, Page, PageSkeleton, Stat } from "@/components/ui";
import { BurnForm } from "./BurnForm";
import { LogRow } from "./LogRow";

export const metadata = { title: "My balance" };

async function Dashboard() {
  const { uid, supabase, today } = await requireMember();
  const [targets, days, { data: logs }] = await Promise.all([
    getTargets(),
    dayTotals(supabase, uid, addDays(today, -6), today),
    supabase.from("meal_logs").select("id, dish, meal_type, kcal, protein_g, visibility, source").eq("user_id", uid).eq("date", today).order("created_at"),
  ]);
  const t = days[days.length - 1];
  const bmr = targets?.bmr ?? 0;
  const b = dailyBalance(t, bmr);
  const maxKcal = Math.max(1, ...days.map((d) => d.intakeKcal), targets?.kcal_max ?? 0);
  const proteinGoal = targets?.protein_g_min ?? 0;

  return (
    <Page title="My balance" subtitle={new Date(`${today}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "short", timeZone: "UTC" })} action={<Link href="/settings" className="btn-ghost btn-sm" aria-label="Settings">⚙️</Link>}>
      <section className="card space-y-3">
        <Meter label="Protein" value={t.proteinG} min={targets?.protein_g_min ?? null} max={targets?.protein_g_max ?? null} />
        <Meter label="Calories eaten" value={t.intakeKcal} min={targets?.kcal_min ?? null} max={targets?.kcal_max ?? null} />
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Eaten" value={b.intakeKcal} sub="kcal" />
          <Stat label="Burned" value={bmr ? b.burnKcal : "—"} sub={b.restingIsEstimate ? `≈ ${b.restingKcal} resting (estimated) + ${b.activeKcal} active` : "from your total"} />
          <Stat label="Net" value={bmr ? (b.net > 0 ? `+${b.net}` : b.net) : "—"} sub="kcal (eaten − burned)" />
          <Stat label="Active" value={b.activeKcal} sub="kcal (you entered)" />
        </div>
        <BurnForm date={today} current={t.activeKcal} />
      </section>

      <section className="card">
        <h2 className="h2">Last 7 days</h2>
        <ul className="mt-3 space-y-2" aria-label="Calories and protein per day">
          {days.map((d) => (
            <li key={d.date} className="grid grid-cols-[3rem_1fr_4.5rem] items-center gap-2 text-sm">
              <span className="text-ink-2">{new Date(`${d.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" })}</span>
              <span className="h-3 overflow-hidden rounded-full bg-surface-2">
                <span className="block h-full rounded-full bg-brand" style={{ width: `${Math.round((d.intakeKcal / maxKcal) * 100)}%` }} />
              </span>
              <span className="text-right tabular-nums">
                {d.intakeKcal} <span className={proteinGoal && d.proteinG >= proteinGoal ? "font-semibold text-leaf" : "text-ink-2"}>· {Math.round(d.proteinG)}g</span>
              </span>
            </li>
          ))}
        </ul>
        <p className="muted mt-2 text-xs">kcal eaten · protein (green = protein target reached). Photo-based values are estimates.</p>
      </section>

      <section className="card">
        <div className="flex items-center justify-between">
          <h2 className="h2">Today&apos;s meals</h2>
          <Link href="/log" className="btn-primary btn-sm">+ Log</Link>
        </div>
        {logs?.length ? (
          <ul className="mt-2 divide-y divide-line">{logs.map((l) => <LogRow key={l.id} log={l} />)}</ul>
        ) : (
          <p className="muted mt-2">No meals logged yet — the plate is clean and full of possibility.</p>
        )}
      </section>

      <nav className="grid grid-cols-2 gap-2" aria-label="More">
        <Link href="/leaderboard" className="btn-ghost">🏆 Leaderboard</Link>
        <Link href="/grocery" className="btn-ghost">🛒 Groceries</Link>
        <Link href="/friends" className="btn-ghost">👋 Friends</Link>
        <Link href="/inbox" className="btn-ghost">💌 Messages</Link>
      </nav>
      {targets ? <p className="muted text-xs">Targets: {targets.method}. {targets.source_note}</p> : null}
    </Page>
  );
}

export default function DashboardPage() {
  return (
    <Suspense fallback={<PageSkeleton title="My balance" />}>
      <Dashboard />
    </Suspense>
  );
}
