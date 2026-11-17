import { Suspense } from "react";
import { requireMember } from "@/lib/server/dal";
import { avatarFor } from "@/lib/avatar";
import { Page, PageSkeleton } from "@/components/ui";
import { BlockedRow, FriendRow, InviteBox, RequestRow } from "./FriendsClient";

export const metadata = { title: "Friends" };

async function Friends() {
  const { uid, profile, supabase } = await requireMember();
  const { data: rows } = await supabase.from("friendships").select("user_id, friend_id, status");
  const others = (rows ?? []).map((r) => ({ ...r, other: r.user_id === uid ? r.friend_id : r.user_id }));
  const ids = [...new Set(others.filter((o) => o.status !== "blocked").map((o) => o.other))];
  const { data: profiles } = ids.length ? await supabase.from("profiles").select("id, display_name, avatar_preset").in("id", ids) : { data: [] };
  const name = (id: string) => profiles?.find((p) => p.id === id);
  const incoming = others.filter((o) => o.status === "pending" && o.friend_id === uid);
  const outgoing = others.filter((o) => o.status === "pending" && o.user_id === uid);
  const friends = others.filter((o) => o.status === "accepted");
  const blocked = others.filter((o) => o.status === "blocked" && o.user_id === uid);

  return (
    <>
      {incoming.length ? (
        <section className="card">
          <h2 className="h2">Requests</h2>
          <ul className="divide-y divide-line">{incoming.map((o) => <RequestRow key={o.other} id={o.other} name={name(o.other)?.display_name ?? "Someone"} />)}</ul>
        </section>
      ) : null}
      <section className="card">
        <h2 className="h2">Friends ({friends.length})</h2>
        {friends.length ? (
          <ul className="divide-y divide-line">{friends.map((o) => <FriendRow key={o.other} id={o.other} name={name(o.other)?.display_name ?? "Friend"} avatar={avatarFor(name(o.other)?.avatar_preset)} />)}</ul>
        ) : (
          <p className="muted mt-1">No friends here yet. Invite someone to share the snacks (and the leaderboard).</p>
        )}
        {outgoing.length ? <p className="muted mt-2">Waiting on: {outgoing.map((o) => name(o.other)?.display_name ?? "…").join(", ")}</p> : null}
      </section>
      <InviteBox friendCode={profile.friend_code} />
      {blocked.length ? (
        <section className="card">
          <h2 className="h2">Blocked</h2>
          <ul className="divide-y divide-line">{blocked.map((o) => <BlockedRow key={o.other} id={o.other} />)}</ul>
        </section>
      ) : null}
    </>
  );
}

export default function FriendsPage() {
  return (
    <Page title="Friends">
      <Suspense fallback={<PageSkeleton title="" />}>
        <Friends />
      </Suspense>
    </Page>
  );
}
