import "server-only";
import { sendNotification, setVapidDetails } from "web-push";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createAdminClient } from "@/lib/supabase/server";
import { pickMessage, type Category, type Message, type Send } from "@/lib/messages/engine";
import { addDays, isSafetyMode, localDate, localMinutes, type DayTotals } from "@/lib/nutrition/balance";

/**
 * Scheduler (D-021): Supabase Cron calls POST /api/cron/dispatch every 5 minutes.
 * For each member, decide which time-based messages are due, pick copy with the engine, record a
 * message_sends row (idempotent via slot_key) and deliver push when allowed.
 * Slots (TONE_AND_COPY §3, ASSUMPTION times): morning 07:30 · lunch idea 11:30 · dinner idea 18:00 ·
 * plate reminder = chosen meal time + offset · love note (random weekday 16:00–17:00, ≤ 2/week) ·
 * weekly plan Sunday 10:00 · missed-day 09:30 if nothing logged yesterday.
 */

const WINDOW_MIN = 15; // a slot is "due" for 15 minutes after its time (cron runs every 5)

type Due = { category: Category; slotKey: string; url: string };

function hhmm(t: string): number {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + (m || 0);
}

function inWindow(nowMin: number, slotMin: number) {
  return nowMin >= slotMin && nowMin < slotMin + WINDOW_MIN;
}

export interface DispatchReport {
  users: number;
  pushed: number;
  inboxed: number;
  failed: number;
  removedSubscriptions: number;
}

export async function dispatch(now = new Date()): Promise<DispatchReport> {
  const admin = createAdminClient();
  const vapidOk = !!(process.env.VAPID_PRIVATE_KEY && process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY && process.env.VAPID_SUBJECT);
  if (vapidOk) setVapidDetails(process.env.VAPID_SUBJECT!, process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY!, process.env.VAPID_PRIVATE_KEY!);
  const report: DispatchReport = { users: 0, pushed: 0, inboxed: 0, failed: 0, removedSubscriptions: 0 };

  const [{ data: profiles }, { data: library }] = await Promise.all([
    admin.from("profiles").select("id, timezone, lunch_time, dinner_time, muted_categories").eq("onboarded", true),
    admin.from("messages").select("id, category, text, active").eq("active", true),
  ]);
  const lib = (library ?? []) as Message[];
  const offset = Number(process.env.PLATE_REMINDER_OFFSET_MIN ?? 30);

  for (const p of profiles ?? []) {
    report.users++;
    const tz = p.timezone || "Asia/Kolkata";
    const today = localDate(now, tz);
    const nowMin = localMinutes(now, tz);
    const due: Due[] = [];
    const weekday = new Date(`${today}T00:00:00Z`).getUTCDay(); // 0 = Sunday

    if (inWindow(nowMin, 7 * 60 + 30)) due.push({ category: "morning", slotKey: `${today}:morning`, url: "/today" });
    if (inWindow(nowMin, 11 * 60 + 30)) due.push({ category: "suggestion_ready", slotKey: `${today}:lunch_idea`, url: "/today" });
    if (inWindow(nowMin, 18 * 60)) due.push({ category: "suggestion_ready", slotKey: `${today}:dinner_idea`, url: "/today" });
    if (weekday === 0 && inWindow(nowMin, 10 * 60)) due.push({ category: "weekly_plan", slotKey: `${today}:weekly_plan`, url: "/plan" });
    if (weekday % 3 === 1 && inWindow(nowMin, 16 * 60 + 15)) due.push({ category: "love_note", slotKey: `${today}:love_note`, url: "/inbox" });

    // plate reminders for chosen meals
    for (const meal of ["lunch", "dinner"] as const) {
      const t = hhmm(meal === "lunch" ? p.lunch_time : p.dinner_time) + offset;
      if (inWindow(nowMin, t)) due.push({ category: "plate_reminder", slotKey: `${today}:plate:${meal}`, url: `/log?meal=${meal}` });
    }

    if (!due.length) continue;
    await deliverForUser(admin, p.id, p.muted_categories ?? [], today, nowMin, now, due, lib, vapidOk, report);
  }
  return report;
}

async function deliverForUser(
  admin: SupabaseClient,
  userId: string,
  muted: string[],
  today: string,
  nowMin: number,
  now: Date,
  due: Due[],
  lib: Message[],
  vapidOk: boolean,
  report: DispatchReport,
) {
  const since = new Date(now.getTime() - 22 * 86400_000).toISOString();
  const [{ data: sends }, { data: subs }, { data: logs }, { data: chosen }, { data: consent }] = await Promise.all([
    admin.from("message_sends").select("message_id, category, sent_at, channel, slot_key").eq("user_id", userId).gte("sent_at", since),
    admin.from("push_subscriptions").select("id, endpoint, p256dh, auth").eq("user_id", userId),
    admin.from("meal_logs").select("date, kcal, meal_type").eq("user_id", userId).gte("date", addDays(today, -4)),
    admin.from("meal_plan_slots").select("meal_type, status, meal_plans!inner(user_id)").eq("meal_plans.user_id", userId).eq("date", today).eq("status", "chosen"),
    admin.from("consents").select("granted").eq("user_id", userId).eq("purpose", "marketing_push").order("created_at", { ascending: false }).limit(1).maybeSingle(),
  ]);

  const recent: (Send & { slotKey: string })[] = (sends ?? []).map((s) => ({ messageId: s.message_id, category: s.category, sentAt: new Date(s.sent_at), channel: s.channel, slotKey: s.slot_key }));
  const done = new Set(recent.map((s) => s.slotKey));
  const todayStart = new Date(now.getTime() - nowMin * 60_000);
  const sendsToday = () => recent.filter((s) => s.sentAt >= todayStart);

  const byDay = new Map<string, DayTotals>();
  for (const l of logs ?? []) {
    const d = byDay.get(l.date) ?? { date: l.date, intakeKcal: 0, proteinG: 0, activeKcal: null, totalKcalBurn: null, mealsLogged: 0 };
    d.intakeKcal += l.kcal;
    d.mealsLogged++;
    byDay.set(l.date, d);
  }
  const safetyMode = isSafetyMode([...byDay.values()], today);
  const chosenMeals = new Set((chosen ?? []).map((c) => c.meal_type));
  const loggedToday = new Set((logs ?? []).filter((l) => l.date === today).map((l) => l.meal_type));
  const pushEnabled = vapidOk && (subs ?? []).length > 0 && consent?.granted === true;

  for (const d of due) {
    if (done.has(d.slotKey)) continue;
    if (d.category === "plate_reminder") {
      const meal = d.slotKey.split(":").pop()!;
      if (!chosenMeals.has(meal) || loggedToday.has(meal)) continue; // only for chosen, not-yet-logged meals
    }
    const pick = pickMessage({
      category: d.category,
      now,
      localMinutes: nowMin,
      sendsToday: sendsToday(),
      recentSends: recent,
      library: lib,
      safetyMode,
      pushEnabled,
      mutedCategories: muted as Category[],
    });
    if (!pick) continue;
    const { error } = await admin
      .from("message_sends")
      .insert({ user_id: userId, message_id: pick.message.id, category: pick.message.category, channel: pick.channel, slot_key: d.slotKey, sent_at: now.toISOString() });
    if (error) continue; // unique(user_id, slot_key) → another run already handled it
    recent.push({ messageId: pick.message.id, category: pick.message.category, sentAt: now, channel: pick.channel, slotKey: d.slotKey });
    if (pick.channel === "inbox") {
      report.inboxed++;
      continue;
    }
    const payload = JSON.stringify({ title: "Shake Shake", body: pick.message.text, url: d.url, tag: d.slotKey });
    for (const s of subs ?? []) {
      try {
        await sendNotification({ endpoint: s.endpoint, keys: { p256dh: s.p256dh, auth: s.auth } }, payload, { TTL: 3600 });
        report.pushed++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await admin.from("push_subscriptions").delete().eq("id", s.id);
          report.removedSubscriptions++;
        } else report.failed++;
      }
    }
  }
}
