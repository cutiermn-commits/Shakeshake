import { Suspense } from "react";
import Link from "next/link";
import { requireMember } from "@/lib/server/dal";
import { addDays } from "@/lib/nutrition/balance";
import { avatarFor } from "@/lib/avatar";
import { Page, PageSkeleton } from "@/components/ui";
import { FeedItem, type FeedEntry } from "./FeedItem";

export const metadata = { title: "Friends' meals" };

async function Feed() {
  const { uid, supabase, today } = await requireMember();
  // RLS returns only own logs + friends' visible logs (consent, blocks, hidden all enforced in the database).
  const { data: logs } = await supabase
    .from("meal_logs")
    .select("id, user_id, dish, meal_type, kcal, protein_g, source, photo_path, date, created_at, reactions(emoji, user_id), comments(id, user_id, body, hidden, created_at)")
    .gte("date", addDays(today, -7))
    .order("created_at", { ascending: false })
    .limit(50);
  const rows = logs ?? [];
  const people = [...new Set(rows.flatMap((l) => [l.user_id, ...(l.comments ?? []).map((c: { user_id: string }) => c.user_id)]))];
  const { data: profiles } = people.length ? await supabase.from("profiles").select("id, display_name, avatar_preset").in("id", people) : { data: [] };
  const who = (id: string) => profiles?.find((p) => p.id === id);
  const paths = rows.map((l) => l.photo_path).filter((p): p is string => !!p);
  const { data: signed } = paths.length ? await supabase.storage.from("meal-photos").createSignedUrls(paths, 3600) : { data: [] };
  const urlFor = (p: string | null) => (p ? (signed ?? []).find((s) => s.path === p)?.signedUrl ?? null : null);

  const entries: FeedEntry[] = rows.map((l) => {
    const reactions: FeedEntry["reactions"] = {};
    for (const r of (l.reactions ?? []) as { emoji: string; user_id: string }[]) {
      reactions[r.emoji] = { count: (reactions[r.emoji]?.count ?? 0) + 1, mine: (reactions[r.emoji]?.mine ?? false) || r.user_id === uid };
    }
    return {
      id: l.id,
      owner: l.user_id,
      ownerName: l.user_id === uid ? "You" : (who(l.user_id)?.display_name ?? "Friend"),
      avatar: avatarFor(who(l.user_id)?.avatar_preset),
      isMine: l.user_id === uid,
      dish: l.dish,
      mealType: l.meal_type,
      kcal: l.kcal,
      protein: Number(l.protein_g),
      estimated: l.source === "ai" || l.source === "ai_corrected",
      when: l.date === today ? "today" : new Date(`${l.date}T00:00:00Z`).toLocaleDateString("en-IN", { weekday: "short", timeZone: "UTC" }),
      photoUrl: urlFor(l.photo_path),
      reactions,
      comments: ((l.comments ?? []) as { id: string; user_id: string; body: string; hidden: boolean; created_at: string }[])
        .filter((c) => !c.hidden)
        .sort((a, b) => a.created_at.localeCompare(b.created_at))
        .map((c) => ({ id: c.id, name: c.user_id === uid ? "You" : (who(c.user_id)?.display_name ?? "Friend"), body: c.body, mine: c.user_id === uid })),
    };
  });

  if (!entries.length) {
    return (
      <div className="card text-center">
        <p className="text-ink-2">No meals here yet. Invite someone to share the snacks (and the leaderboard).</p>
        <Link href="/friends" className="btn-primary mt-3">Invite friends</Link>
      </div>
    );
  }
  return <>{entries.map((e) => <FeedItem key={e.id} e={e} />)}</>;
}

export default function FeedPage() {
  return (
    <Page title="Friends' meals" action={<span className="flex gap-2"><Link href="/leaderboard" className="btn-ghost btn-sm" aria-label="Leaderboard">🏆</Link><Link href="/friends" className="btn-ghost btn-sm" aria-label="Manage friends">👋</Link></span>}>
      <Suspense fallback={<PageSkeleton title="" />}>
        <Feed />
      </Suspense>
    </Page>
  );
}
