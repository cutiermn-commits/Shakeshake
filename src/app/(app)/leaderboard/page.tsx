import { Suspense } from "react";
import { requireMember } from "@/lib/server/dal";
import { addDays, weekStart } from "@/lib/nutrition/balance";
import { rank, DAILY_CAP } from "@/lib/leaderboard/score";
import { avatarFor } from "@/lib/avatar";
import { Page, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Leaderboard" };

async function Board() {
  const { uid, supabase, today } = await requireMember();
  const ws = weekStart(today);
  const { data: rows } = await supabase.from("leaderboard_daily").select("user_id, total, move_pts, protein_pts, logging_pts, flagged").gte("date", ws).lte("date", addDays(ws, 6));
  const totals = new Map<string, { total: number; move: number; protein: number; logging: number; flagged: boolean }>();
  for (const r of rows ?? []) {
    const t = totals.get(r.user_id) ?? { total: 0, move: 0, protein: 0, logging: 0, flagged: false };
    t.total += r.total;
    t.move += r.move_pts;
    t.protein += r.protein_pts;
    t.logging += r.logging_pts;
    t.flagged ||= r.flagged;
    totals.set(r.user_id, t);
  }
  if (!totals.has(uid)) totals.set(uid, { total: 0, move: 0, protein: 0, logging: 0, flagged: false });
  const ids = [...totals.keys()];
  const { data: profiles } = await supabase.from("profiles").select("id, display_name, avatar_preset").in("id", ids);
  const ranked = rank(ids.map((id) => ({ id, ...totals.get(id)!, name: id === uid ? "You" : (profiles?.find((p) => p.id === id)?.display_name ?? "Friend"), avatar: avatarFor(profiles?.find((p) => p.id === id)?.avatar_preset) })));
  const medal = (p: number) => (p === 1 ? "🥇" : p === 2 ? "🥈" : p === 3 ? "🥉" : `${p}.`);

  return (
    <>
      <ol className="card divide-y divide-line">
        {ranked.map((r) => (
          <li key={r.id} className={`flex items-center justify-between gap-2 py-3 ${r.id === uid ? "font-semibold" : ""}`}>
            <span className="flex items-center gap-2">
              <span className="w-8 text-center">{medal(r.position)}</span>
              <span aria-hidden>{r.avatar}</span> {r.name}
              {r.flagged ? <span className="rounded-full bg-turmeric/25 px-2 text-xs text-warn" title="An unusually high manual burn entry this week">checked?</span> : null}
            </span>
            <span className="text-right tabular-nums">
              <span className="text-lg">{r.total}</span>
              <span className="block text-xs font-normal text-ink-2">🏃 {r.move} · 💪 {r.protein} · 📸 {r.logging}</span>
            </span>
          </li>
        ))}
      </ol>
      <section className="card text-sm">
        <h2 className="h2">How points work</h2>
        <ul className="mt-2 list-disc space-y-1 pl-5 text-ink-2">
          <li>🏃 1 point per 1 % of <i>your own</i> active-calorie goal (max 200/day)</li>
          <li>💪 1 point per 1 % of your protein target (max 100/day)</li>
          <li>📸 +20 per photo-logged meal (max 2/day) and +10 for a logging streak</li>
          <li>Max {DAILY_CAP} a day. Resets Monday 00:00 IST. Goals are locked for the week, so everyone competes fairly whatever their size.</li>
        </ul>
      </section>
    </>
  );
}

export default function LeaderboardPage() {
  return (
    <Page title="This week's leaderboard" subtitle="You and your friends">
      <Suspense fallback={<PageSkeleton title="" />}>
        <Board />
      </Suspense>
    </Page>
  );
}
