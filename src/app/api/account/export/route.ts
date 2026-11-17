import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/** M6-01: export everything the user owns as JSON (RLS limits every query to their own rows). */
export async function GET() {
  const supabase = await createClient();
  const { data: claims } = await supabase.auth.getClaims();
  const uid = claims?.claims?.sub as string | undefined;
  if (!uid) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const own = (table: string, col = "user_id") => supabase.from(table).select("*").eq(col, uid);
  const [profile, health, targets, consents, logs, burn, plans, grocery, friends, comments, reactions, sends, usage, subs] = await Promise.all([
    own("profiles", "id"),
    own("health_profile"),
    own("targets"),
    own("consents"),
    own("meal_logs"),
    own("activity_logs"),
    supabase.from("meal_plans").select("*, meal_plan_slots(*)").eq("user_id", uid),
    supabase.from("grocery_lists").select("*, grocery_items(*)").eq("user_id", uid),
    supabase.from("friendships").select("*").or(`user_id.eq.${uid},friend_id.eq.${uid}`),
    own("comments"),
    own("reactions"),
    own("message_sends"),
    own("ai_usage"),
    supabase.from("push_subscriptions").select("created_at, user_agent").eq("user_id", uid),
  ]);
  const body = {
    exported_at: new Date().toISOString(),
    note: "Shake Shake data export. Photos are listed by storage path; download them in the app while signed in.",
    profile: profile.data,
    health_profile: health.data,
    targets: targets.data,
    consents: consents.data,
    meal_logs: logs.data,
    activity_logs: burn.data,
    meal_plans: plans.data,
    grocery_lists: grocery.data,
    friendships: friends.data,
    comments: comments.data,
    reactions: reactions.data,
    messages_received: sends.data,
    ai_usage: usage.data,
    push_subscriptions: subs.data,
  };
  return new NextResponse(JSON.stringify(body, null, 2), {
    headers: { "content-type": "application/json", "content-disposition": `attachment; filename="shake-shake-export-${new Date().toISOString().slice(0, 10)}.json"`, "cache-control": "no-store" },
  });
}
