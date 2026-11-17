import { Suspense } from "react";
import { notFound } from "next/navigation";
import { isAdmin, requireMember } from "@/lib/server/dal";
import { createAdminClient } from "@/lib/supabase/server";
import { Page, PageSkeleton, Stat } from "@/components/ui";
import { AdminInvite, ReportRow } from "./AdminClient";

export const metadata = { title: "Admin" };

/** M5-06: owner admin — invites, moderation queue, AI usage. Gated by the `admin` role claim (app_metadata). */
async function Admin() {
  const { supabase, today } = await requireMember();
  if (!(await isAdmin())) notFound();
  const { data: reports } = await supabase.from("reports").select("id, target_type, target_id, reason, created_at").eq("status", "open").order("created_at");
  // Aggregate usage needs all rows → service role, read-only, counts only (no personal content).
  let usage: { calls: number; users: number } = { calls: 0, users: 0 };
  let members = 0;
  try {
    const admin = createAdminClient();
    const [{ data: u }, { count }] = await Promise.all([admin.from("ai_usage").select("user_id, calls").eq("date", today), admin.from("profiles").select("id", { count: "exact", head: true })]);
    usage = { calls: (u ?? []).reduce((s, r) => s + r.calls, 0), users: new Set((u ?? []).map((r) => r.user_id)).size };
    members = count ?? 0;
  } catch {
    /* service key not configured */
  }
  const cap = Number(process.env.AI_GLOBAL_DAILY_CAP ?? 200);
  return (
    <>
      <section className="grid grid-cols-3 gap-2">
        <Stat label="Members" value={members} />
        <Stat label="AI calls today" value={usage.calls} sub={`cap ${cap}`} />
        <Stat label="AI users today" value={usage.users} />
      </section>
      <section className="card">
        <h2 className="h2">Moderation queue ({reports?.length ?? 0})</h2>
        {reports?.length ? (
          <ul className="divide-y divide-line">{reports.map((r) => <ReportRow key={r.id} id={r.id} summary={`${r.target_type} · “${r.reason}” · ${new Date(r.created_at).toLocaleString("en-IN")}`} />)}</ul>
        ) : (
          <p className="muted mt-1">All clear. ✨</p>
        )}
      </section>
      <section className="card">
        <h2 className="h2 mb-2">Invites</h2>
        <AdminInvite />
      </section>
    </>
  );
}

export default function AdminPage() {
  return (
    <Page title="Owner admin">
      <Suspense fallback={<PageSkeleton title="" />}>
        <Admin />
      </Suspense>
    </Page>
  );
}
