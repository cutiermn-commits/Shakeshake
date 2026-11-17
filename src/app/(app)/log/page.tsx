import { Suspense } from "react";
import { getConsents, requireMember } from "@/lib/server/dal";
import { slotsBetween } from "@/lib/server/stats";
import { localMinutes } from "@/lib/nutrition/balance";
import { Page, PageSkeleton } from "@/components/ui";
import { LogForm } from "./LogForm";

export const metadata = { title: "Log a meal" };

async function Log({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const { uid, supabase, today, profile } = await requireMember();
  const sp = await searchParams;
  const [consents, slots] = await Promise.all([getConsents(), slotsBetween(supabase, uid, today, today)]);
  let recipe: { id: string; title: string; kcal: number; protein: number } | null = null;
  const wantedId = sp.recipe ?? slots.find((s) => s.meal_type === sp.meal)?.recipe?.id;
  if (wantedId && /^[0-9a-f-]{36}$/i.test(wantedId)) {
    const { data } = await supabase.from("recipes").select("id, title, per_serving_kcal, per_serving_protein_g").eq("id", wantedId).maybeSingle();
    if (data) recipe = { id: data.id, title: data.title, kcal: data.per_serving_kcal, protein: Number(data.per_serving_protein_g) };
  }
  const nowHour = Math.floor(localMinutes(new Date(), profile.timezone) / 60);
  const defaultMeal = (sp.meal as "lunch" | "dinner" | undefined) ?? (nowHour < 11 ? "breakfast" : nowHour < 16 ? "lunch" : nowHour < 18 ? "snack" : "dinner");
  return <LogForm uid={uid} today={today} aiEnabled={consents.ai_processing} shareDefault={consents.social_sharing} recipe={recipe} defaultMeal={defaultMeal} />;
}

export default function LogPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={<PageSkeleton title="Log a meal" />}>
      <Page title="Log a meal" subtitle="Camera eats first. (It's a Chennai rule now.)">
        <Log searchParams={searchParams} />
      </Page>
    </Suspense>
  );
}
