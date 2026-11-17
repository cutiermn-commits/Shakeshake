import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { createAdminClient } from "@/lib/supabase/server";

/**
 * Daily photo retention (D-019): delete meal photos older than PHOTO_RETENTION_DAYS (default 90).
 * The meal log (dish, kcal, protein) is kept; only the image is removed.
 * KNOWN GAP: D-019 says "thumbnails kept" — thumbnails are not generated yet, so the photo is removed entirely.
 */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  if (!(secret.length >= 24 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret)))) {
    return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  }
  const days = Number(process.env.PHOTO_RETENTION_DAYS ?? 90);
  const cutoff = new Date(Date.now() - days * 86400_000).toISOString();
  const admin = createAdminClient();
  let removed = 0;
  for (let i = 0; i < 20; i++) {
    const { data } = await admin.from("meal_logs").select("id, photo_path").not("photo_path", "is", null).lt("created_at", cutoff).limit(100);
    if (!data?.length) break;
    const { error } = await admin.storage.from("meal-photos").remove(data.map((d) => d.photo_path as string));
    if (error) return NextResponse.json({ removed, error: error.message }, { status: 500 });
    await admin.from("meal_logs").update({ photo_path: null }).in("id", data.map((d) => d.id));
    removed += data.length;
  }
  return NextResponse.json({ removed, cutoff });
}
