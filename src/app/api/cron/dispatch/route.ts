import { NextResponse, type NextRequest } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { dispatch } from "@/lib/server/dispatch";

/** Called by Supabase Cron (pg_cron + pg_net) every 5 minutes — see supabase/cron.sql and DECISIONS D-021. */
export async function POST(request: NextRequest) {
  const secret = process.env.CRON_SECRET ?? "";
  const got = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ?? "";
  const ok = secret.length >= 24 && got.length === secret.length && timingSafeEqual(Buffer.from(got), Buffer.from(secret));
  if (!ok) return NextResponse.json({ error: "unauthorized" }, { status: 401 });
  const report = await dispatch();
  return NextResponse.json(report);
}
