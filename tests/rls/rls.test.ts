import { beforeAll, describe, expect, it } from "vitest";
import type { PGlite } from "@electric-sql/pglite";
import { as, freshDb, grantConsent, makeUser } from "./harness";

const A = "00000000-0000-4000-8000-00000000000a"; // Asha (inviter)
const B = "00000000-0000-4000-8000-00000000000b"; // Bala (friend of A via invite)
const C = "00000000-0000-4000-8000-00000000000c"; // Chitra (stranger)
const X = "00000000-0000-4000-8000-0000000000ff"; // signed up, never redeemed an invite

let db: PGlite;

beforeAll(async () => {
  db = await freshDb();
  await as(db, "service", (q) => q(`insert into public.invites (code, inviter_id, expires_at, max_uses) values ('BOOT01', null, now() + interval '1 day', 2)`));
  await makeUser(db, A, "Asha", "BOOT01");
  await as(db, A, (q) => q(`insert into public.invites (code, inviter_id, expires_at, max_uses) values ('ASHA01', $1, now() + interval '7 days', 1)`, [A]));
  await makeUser(db, B, "Bala", "ASHA01");
  await makeUser(db, C, "Chitra", "BOOT01");
  await db.query("insert into auth.users (id) values ($1)", [X]);
  for (const u of [A, B, C]) await grantConsent(db, u, "health_data");
  await grantConsent(db, A, "social_sharing");
});

describe("invites (M1-01)", () => {
  it("used-up, unknown and expired codes are rejected", async () => {
    await expect(as(db, X, (q) => q("select public.redeem_invite('ASHA01', 'X')"))).rejects.toThrow(/invalid or expired/);
    await expect(as(db, X, (q) => q("select public.redeem_invite('NOPE99', 'X')"))).rejects.toThrow(/invalid or expired/);
    await as(db, "service", (q) => q(`insert into public.invites (code, inviter_id, expires_at) values ('OLD001', null, now() - interval '1 minute')`));
    await expect(as(db, X, (q) => q("select public.redeem_invite('OLD001', 'X')"))).rejects.toThrow(/invalid or expired/);
    expect(await as(db, "anon", (q) => q("select public.invite_is_valid('OLD001') v"))).toEqual([{ v: false }]);
  });
  it("redeeming an invite befriends the inviter", async () => {
    expect(await as(db, B, (q) => q("select public.are_friends($1, $2) f", [A, B]))).toEqual([{ f: true }]);
  });
  it("non-members (no redeemed invite) can't write anything", async () => {
    await expect(as(db, X, (q) => q("insert into public.meal_logs (user_id, date, meal_type, dish, kcal, protein_g, source) values ($1, current_date, 'lunch', 'x', 1, 1, 'manual')", [X]))).rejects.toThrow(/row-level security/);
    await expect(as(db, X, (q) => q("select public.consume_ai_quota('suggest', 15, 100)"))).rejects.toThrow(/not a member/);
  });
  it("members can't mint unlimited invites", async () => {
    await expect(as(db, B, (q) => q(`insert into public.invites (code, inviter_id, expires_at, max_uses) values ('BIG001', $1, now() + interval '1 day', 50)`, [B]))).rejects.toThrow(/row-level security/);
  });
});

describe("anon role (deny by default)", () => {
  it("cannot read any table", async () => {
    await expect(as(db, "anon", (q) => q("select * from public.profiles"))).rejects.toThrow(/permission denied/);
    await expect(as(db, "anon", (q) => q("select * from public.foods"))).rejects.toThrow(/permission denied/);
  });
});

describe("owner-only health data (M1-07, D-013)", () => {
  beforeAll(async () => {
    await as(db, A, (q) => q("insert into public.health_profile (user_id, birth_year, sex, height_cm, weight_kg, allergies) values ($1, 1986, 'female', 160, 60, '{prawns}')", [A]));
    await as(db, A, (q) => q("insert into public.targets (user_id, kcal_min, kcal_max, protein_g_min, protein_g_max, method, source_note) values ($1, 1800, 2000, 90, 110, 'm', 's')", [A]));
  });
  it("friends and strangers can't read health_profile, targets or consents", async () => {
    for (const u of [B, C]) {
      expect(await as(db, u, (q) => q("select * from public.health_profile where user_id = $1", [A]))).toEqual([]);
      expect(await as(db, u, (q) => q("select * from public.targets where user_id = $1", [A]))).toEqual([]);
      expect(await as(db, u, (q) => q("select * from public.consents where user_id = $1", [A]))).toEqual([]);
    }
  });
  it("cannot write someone else's health data", async () => {
    await expect(as(db, B, (q) => q("insert into public.health_profile (user_id, weight_kg) values ($1, 99)", [A]))).rejects.toThrow();
    const r = await as(db, B, (q) => q("update public.health_profile set weight_kg = 99 where user_id = $1 returning *", [A]));
    expect(r).toEqual([]);
  });
  it("health data writes need health_data consent", async () => {
    await grantConsent(db, C, "health_data", false);
    await expect(as(db, C, (q) => q("insert into public.health_profile (user_id, weight_kg) values ($1, 70)", [C]))).rejects.toThrow(/row-level security/);
    await grantConsent(db, C, "health_data", true);
  });
  it("consents are append-only", async () => {
    expect(await as(db, A, (q) => q("update public.consents set granted = false where user_id = $1 returning id", [A])).catch((e) => String(e))).toMatch(/permission denied/);
  });
});

describe("feed visibility (M5-02)", () => {
  let pub = "";
  let priv = "";
  beforeAll(async () => {
    [{ id: pub }] = await as(db, A, (q) => q<{ id: string }>("insert into public.meal_logs (user_id, date, meal_type, dish, kcal, protein_g, source, photo_path) values ($1, current_date, 'lunch', 'Meen kuzhambu', 550, 32, 'manual', $2) returning id", [A, `${A}/p1.jpg`]));
    [{ id: priv }] = await as(db, A, (q) => q<{ id: string }>("insert into public.meal_logs (user_id, date, meal_type, dish, kcal, protein_g, source, visibility) values ($1, current_date, 'dinner', 'Egg curry', 450, 25, 'manual', 'private') returning id", [A]));
    await as(db, A, (q) => q("insert into storage.objects (bucket_id, name, owner) values ('meal-photos', $1, $2)", [`${A}/p1.jpg`, A]));
  });
  it("friend sees friends-visible logs and photo, not private ones", async () => {
    const rows = await as(db, B, (q) => q<{ id: string }>("select id from public.meal_logs where user_id = $1", [A]));
    expect(rows.map((r) => r.id)).toEqual([pub]);
    expect(await as(db, B, (q) => q("select name from storage.objects where bucket_id = 'meal-photos'"))).toHaveLength(1);
    expect(priv).toBeTruthy();
  });
  it("stranger sees nothing", async () => {
    expect(await as(db, C, (q) => q("select id from public.meal_logs where user_id = $1", [A]))).toEqual([]);
    expect(await as(db, C, (q) => q("select name from storage.objects where bucket_id = 'meal-photos'"))).toEqual([]);
    expect(await as(db, C, (q) => q("select id from public.profiles where id = $1", [A]))).toEqual([]);
  });
  it("revoking social_sharing consent hides the feed immediately", async () => {
    await grantConsent(db, A, "social_sharing", false);
    expect(await as(db, B, (q) => q("select id from public.meal_logs where user_id = $1", [A]))).toEqual([]);
    await grantConsent(db, A, "social_sharing", true);
  });
  it("friends can react/comment only on visible logs; strangers can't", async () => {
    await as(db, B, (q) => q("insert into public.reactions (log_id, user_id, emoji) values ($1, $2, '🔥')", [pub, B]));
    await expect(as(db, C, (q) => q("insert into public.reactions (log_id, user_id, emoji) values ($1, $2, '🔥')", [pub, C]))).rejects.toThrow(/row-level security/);
    await expect(as(db, B, (q) => q("insert into public.comments (log_id, user_id, body) values ($1, $2, 'yum')", [priv, B]))).rejects.toThrow(/row-level security/);
  });
  it("blocked users can't see each other (M5-01)", async () => {
    await as(db, B, (q) => q("select public.block_user($1)", [A]));
    expect(await as(db, B, (q) => q("select id from public.meal_logs where user_id = $1", [A]))).toEqual([]);
    expect(await as(db, A, (q) => q("select id from public.profiles where id = $1", [B]))).toEqual([]);
    // the blocked side can't see the block row or delete it
    expect(await as(db, A, (q) => q("select * from public.friendships where user_id = $1", [B]))).toEqual([]);
    // the block also hides behind send_friend_request
    const [{ friend_code }] = await as(db, B, (q) => q<{ friend_code: string }>("select friend_code from public.profiles where id = $1", [B]));
    expect(await as(db, A, (q) => q("select public.send_friend_request($1) r", [friend_code]))).toEqual([{ r: "not_found" }]);
  });
  it("can't log a meal as someone else", async () => {
    await expect(as(db, C, (q) => q("insert into public.meal_logs (user_id, date, meal_type, dish, kcal, protein_g, source) values ($1, current_date, 'lunch', 'x', 1, 1, 'manual')", [A]))).rejects.toThrow(/row-level security/);
  });
});

describe("friend requests", () => {
  it("request → accept by the other side only", async () => {
    const [{ friend_code }] = await as(db, C, (q) => q<{ friend_code: string }>("select friend_code from public.profiles where id = $1", [C]));
    expect(await as(db, A, (q) => q("select public.send_friend_request($1) r", [friend_code]))).toEqual([{ r: "requested" }]);
    // requester cannot self-accept
    expect(await as(db, A, (q) => q("update public.friendships set status = 'accepted' where user_id = $1 and friend_id = $2 returning *", [A, C]))).toEqual([]);
    // the pending counterpart can see the requester's profile name
    expect(await as(db, C, (q) => q<{ display_name: string }>("select display_name from public.profiles where id = $1", [A]))).toEqual([{ display_name: "Asha" }]);
    await as(db, C, (q) => q("update public.friendships set status = 'accepted' where user_id = $1 and friend_id = $2", [A, C]));
    expect(await as(db, C, (q) => q("select public.are_friends($1, $2) f", [A, C]))).toEqual([{ f: true }]);
  });
});

describe("server-only tables", () => {
  it("users can't write leaderboard, weekly goals, ai usage, messages, message_sends or foods", async () => {
    for (const sql of [
      `insert into public.leaderboard_daily (user_id, date, total) values ('${A}', current_date, 350)`,
      `insert into public.weekly_goals (user_id, week_start, active_kcal_goal, protein_target_g) values ('${A}', current_date, 1, 1)`,
      `insert into public.ai_usage (user_id, date, kind, calls) values ('${A}', current_date, 'suggest', -100)`,
      `insert into public.messages (id, category, text) values ('x', 'morning', 'x')`,
      `insert into public.foods (key, name, kcal_per_100g, protein_g, fat_g, carb_g, source_release) values ('x','x',1,1,1,1,'x')`,
    ]) {
      await expect(as(db, A, (q) => q(sql))).rejects.toThrow(/permission denied/);
    }
  });
  it("profile updates can't change identity or invite fields", async () => {
    await expect(as(db, A, (q) => q("update public.profiles set invited_by = null where id = $1", [A]))).rejects.toThrow(/permission denied/);
    const r = await as(db, A, (q) => q("update public.profiles set display_name = 'Hacked' where id = $1 returning id", [C]));
    expect(r).toEqual([]);
  });
  it("leaderboard rows: self + friends only", async () => {
    await as(db, "service", (q) => q(`insert into public.leaderboard_daily (user_id, date, total) values ($1, current_date, 100), ($2, current_date, 90), ($3, current_date, 80)`, [A, B, C]));
    const seenByC = await as(db, C, (q) => q<{ user_id: string }>("select user_id from public.leaderboard_daily order by user_id"));
    expect(seenByC.map((r) => r.user_id).sort()).toEqual([A, C].sort()); // C is friends with A (above), not with B
  });
});

describe("AI quota (D-017)", () => {
  it("enforces per-user and global caps atomically", async () => {
    const r: string[] = [];
    for (let i = 0; i < 3; i++) r.push((await as(db, C, (q) => q<{ r: string }>("select public.consume_ai_quota('suggest', 2, 100) r")))[0].r);
    expect(r).toEqual(["ok", "ok", "user_limit"]);
    expect((await as(db, A, (q) => q<{ r: string }>("select public.consume_ai_quota('plate', 15, 2) r")))[0].r).toBe("global_limit");
    // usage is private
    expect(await as(db, A, (q) => q("select * from public.ai_usage where user_id = $1", [C]))).toEqual([]);
  });
});

describe("moderation (M5-03, M5-06)", () => {
  it("reports land for admins only; admins can hide reported content", async () => {
    const [{ id }] = await as(db, A, (q) => q<{ id: string }>("select id from public.meal_logs where user_id = $1 and visibility = 'friends' limit 1", [A]));
    await as(db, C, (q) => q("insert into public.reports (target_type, target_id, reporter_id, reason) values ('meal_log', $1, $2, 'spam')", [id, C]));
    expect(await as(db, B, (q) => q("select * from public.reports"))).toEqual([]);
    const adminView = await as(db, B, (q) => q("select * from public.reports"), { admin: true });
    expect(adminView).toHaveLength(1);
    await as(db, B, (q) => q("update public.meal_logs set hidden = true where id = $1", [id]), { admin: true });
    expect(await as(db, C, (q) => q("select id from public.meal_logs where id = $1", [id]))).toEqual([]);
  });
});
