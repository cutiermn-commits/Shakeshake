import { Suspense } from "react";
import { requireMember } from "@/lib/server/dal";
import { markInboxRead } from "@/app/actions/settings";
import { Page, PageSkeleton } from "@/components/ui";

export const metadata = { title: "Messages" };

async function Inbox() {
  const { uid, supabase } = await requireMember();
  const { data } = await supabase.from("message_sends").select("id, sent_at, read_at, channel, messages(text, category)").eq("user_id", uid).order("sent_at", { ascending: false }).limit(60);
  const rows = (data ?? []) as unknown as { id: string; sent_at: string; read_at: string | null; channel: string; messages: { text: string; category: string } | null }[];
  const unread = rows.some((r) => !r.read_at);
  if (!rows.length) return <p className="card text-ink-2">Nothing yet. Little love notes and reminders will land here. 💌</p>;
  return (
    <>
      {unread ? (
        <form
          action={async () => {
            "use server";
            await markInboxRead();
          }}
        >
          <button className="btn-ghost btn-sm">Mark all read</button>
        </form>
      ) : null}
      <ul className="space-y-2">
        {rows.map((r) => (
          <li key={r.id} className={`card ${r.read_at ? "" : "border-brand"}`}>
            <p>{r.messages?.text}</p>
            <p className="muted mt-1 text-xs">{new Date(r.sent_at).toLocaleString("en-IN", { dateStyle: "medium", timeStyle: "short" })}</p>
          </li>
        ))}
      </ul>
    </>
  );
}

export default function InboxPage() {
  return (
    <Page title="Messages">
      <Suspense fallback={<PageSkeleton title="" />}>
        <Inbox />
      </Suspense>
    </Page>
  );
}
