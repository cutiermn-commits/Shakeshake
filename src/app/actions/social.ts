"use server";

import { z } from "zod";
import { revalidatePath } from "next/cache";
import { randomBytes } from "node:crypto";
import { isAdmin, requireMember } from "@/lib/server/dal";
import type { ActionResult } from "./meals";

function newCode(): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no 0/O/1/I
  const bytes = randomBytes(8);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

/** M5-01: members create invites (≤ 5 uses, ≤ 30 days — enforced by RLS). */
export async function createInvite(maxUses = 1, days = 7): Promise<ActionResult<{ code: string; url: string }>> {
  const { uid, supabase } = await requireMember();
  const admin = await isAdmin();
  const uses = z.number().int().min(1).max(admin ? 50 : 5).parse(maxUses);
  const d = z.number().int().min(1).max(admin ? 90 : 30).parse(days);
  const code = newCode();
  const { error } = await supabase.from("invites").insert({ code, inviter_id: uid, max_uses: uses, expires_at: new Date(Date.now() + d * 86400_000).toISOString() });
  if (error) return { ok: false, error: "Couldn't create an invite right now." };
  revalidatePath("/friends");
  return { ok: true, data: { code, url: `${process.env.NEXT_PUBLIC_APP_URL ?? ""}/invite/${code}` } };
}

export async function sendFriendRequest(friendCode: string): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const code = z.string().trim().toUpperCase().regex(/^[A-Z0-9]{6,12}$/).safeParse(friendCode);
  if (!code.success) return { ok: false, error: "Friend codes are 8 letters/numbers." };
  const { data, error } = await supabase.rpc("send_friend_request", { p_friend_code: code.data });
  if (error) return { ok: false, error: "Couldn't send the request." };
  revalidatePath("/friends");
  if (data === "not_found") return { ok: false, error: "No one found with that code." };
  return { ok: true, note: data === "accepted" ? "You're now friends! 🎉" : "Request sent." };
}

export async function respondToRequest(fromUserId: string, accept: boolean): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const from = z.uuid().parse(fromUserId);
  if (accept) await supabase.from("friendships").update({ status: "accepted" }).eq("user_id", from).eq("friend_id", uid).eq("status", "pending");
  else await supabase.from("friendships").delete().eq("user_id", from).eq("friend_id", uid).eq("status", "pending");
  revalidatePath("/friends");
  return { ok: true };
}

export async function removeFriend(otherId: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const o = z.uuid().parse(otherId);
  await supabase.from("friendships").delete().or(`and(user_id.eq.${uid},friend_id.eq.${o}),and(user_id.eq.${o},friend_id.eq.${uid})`).neq("status", "blocked");
  revalidatePath("/friends");
  return { ok: true };
}

export async function blockUser(otherId: string): Promise<ActionResult> {
  const { supabase } = await requireMember();
  const { error } = await supabase.rpc("block_user", { p_other: z.uuid().parse(otherId) });
  if (error) return { ok: false, error: "Couldn't block right now." };
  revalidatePath("/friends");
  revalidatePath("/feed");
  return { ok: true, note: "Blocked. They can't see you and you won't see them." };
}

export async function unblockUser(otherId: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  await supabase.from("friendships").delete().eq("user_id", uid).eq("friend_id", z.uuid().parse(otherId)).eq("status", "blocked");
  revalidatePath("/friends");
  return { ok: true };
}

const EMOJI = z.enum(["❤️", "🔥", "💪", "😋"]);

export async function toggleReaction(logId: string, emoji: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const id = z.uuid().parse(logId);
  const e = EMOJI.parse(emoji);
  const { data } = await supabase.from("reactions").select("emoji").eq("log_id", id).eq("user_id", uid).eq("emoji", e).maybeSingle();
  if (data) await supabase.from("reactions").delete().eq("log_id", id).eq("user_id", uid).eq("emoji", e);
  else await supabase.from("reactions").insert({ log_id: id, user_id: uid, emoji: e });
  revalidatePath("/feed");
  return { ok: true };
}

/** Simple rate limit: ≤ 30 comments per user per hour (ASSUMPTION, abuse protection). */
export async function addComment(logId: string, body: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const text = z.string().trim().min(1).max(280).safeParse(body);
  if (!text.success) return { ok: false, error: "Comments are 1–280 characters." };
  const { count } = await supabase.from("comments").select("id", { count: "exact", head: true }).eq("user_id", uid).gte("created_at", new Date(Date.now() - 3600_000).toISOString());
  if ((count ?? 0) >= 30) return { ok: false, error: "Slow down a little — try again later." };
  const { error } = await supabase.from("comments").insert({ log_id: z.uuid().parse(logId), user_id: uid, body: text.data });
  if (error) return { ok: false, error: "Couldn't post that comment." };
  revalidatePath("/feed");
  return { ok: true };
}

export async function deleteComment(commentId: string): Promise<ActionResult> {
  const { supabase } = await requireMember();
  await supabase.from("comments").delete().eq("id", z.uuid().parse(commentId));
  revalidatePath("/feed");
  return { ok: true };
}

export async function report(targetType: "meal_log" | "comment" | "profile", targetId: string, reason: string): Promise<ActionResult> {
  const { uid, supabase } = await requireMember();
  const r = z.string().trim().min(1).max(300).safeParse(reason);
  if (!r.success) return { ok: false, error: "Please add a short reason." };
  const { error } = await supabase.from("reports").insert({ target_type: z.enum(["meal_log", "comment", "profile"]).parse(targetType), target_id: z.uuid().parse(targetId), reporter_id: uid, reason: r.data });
  if (error) return { ok: false, error: "Couldn't send the report." };
  return { ok: true, note: "Thanks — the owner will review it." };
}

/** M5-06 (admin): resolve a report, optionally hiding the content. */
export async function resolveReport(reportId: string, action: "hide" | "dismiss"): Promise<ActionResult> {
  const { supabase } = await requireMember();
  if (!(await isAdmin())) return { ok: false, error: "Admins only." };
  const { data: rep } = await supabase.from("reports").select("*").eq("id", z.uuid().parse(reportId)).single();
  if (!rep) return { ok: false, error: "Report not found." };
  if (action === "hide") {
    if (rep.target_type === "meal_log") await supabase.from("meal_logs").update({ hidden: true }).eq("id", rep.target_id);
    if (rep.target_type === "comment") await supabase.from("comments").update({ hidden: true }).eq("id", rep.target_id);
  }
  await supabase.from("reports").update({ status: action === "hide" ? "actioned" : "dismissed" }).eq("id", rep.id);
  revalidatePath("/admin");
  return { ok: true };
}
