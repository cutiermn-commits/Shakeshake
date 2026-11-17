import { Suspense } from "react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { requireMember } from "@/lib/server/dal";
import { NutritionBadge, Page, PageSkeleton, Stat } from "@/components/ui";

export const metadata = { title: "Recipe" };

const REGION: Record<string, string> = { tamil: "Tamil Nadu", kerala: "Kerala", andhra: "Andhra", karnataka: "Karnataka", telangana: "Telangana", mixed: "South Indian" };

async function Recipe({ params }: { params: Promise<{ id: string }> }) {
  const { supabase } = await requireMember();
  const { id } = await params;
  if (!/^[0-9a-f-]{36}$/i.test(id)) notFound();
  const { data: r } = await supabase.from("recipes").select("*, recipe_ingredients(position, raw_name, grams, matched, added)").eq("id", id).maybeSingle();
  if (!r) notFound();
  const ingredients = [...(r.recipe_ingredients as { position: number; raw_name: string; grams: number; matched: boolean; added: boolean }[])].sort((a, b) => a.position - b.position);
  const steps = (r.steps as string[]) ?? [];
  return (
    <Page title={r.title} subtitle={`${REGION[r.cuisine_region] ?? "South Indian"} · ${r.cook_minutes} min · serves ${r.servings}`}>
      <section className="card">
        <div className="mb-3 flex items-center justify-between">
          <h2 className="h2">Per serving</h2>
          <NutritionBadge status={r.nutrition_status} />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Stat label="Protein" value={`${Math.round(r.per_serving_protein_g)} g`} />
          <Stat label="Calories" value={`${r.per_serving_kcal}`} sub="kcal" />
          <Stat label="Fat" value={r.per_serving_fat_g != null ? `${Math.round(r.per_serving_fat_g)} g` : "—"} />
          <Stat label="Carbs" value={r.per_serving_carb_g != null ? `${Math.round(r.per_serving_carb_g)} g` : "—"} />
        </div>
        <p className="muted mt-3 text-xs">
          {r.nutrition_status === "ai_estimate" ? "AI estimate — most ingredients couldn't be matched to USDA FoodData Central." : "Calculated from USDA FoodData Central (CC0) · raw ingredient weights."}
          {r.unmatched?.length ? ` Not matched: ${r.unmatched.join(", ")}.` : ""}
          {r.oil_added ? " We added 1 tsp oil per serving because the method fries or tempers." : ""}
        </p>
      </section>
      <section className="card">
        <h2 className="h2">Ingredients</h2>
        <ul className="mt-2 divide-y divide-line">
          {ingredients.map((i) => (
            <li key={i.position} className="flex justify-between gap-3 py-2 text-sm">
              <span>
                {i.raw_name}
                {i.added ? <span className="text-ink-2"> (added by app)</span> : null}
                {!i.matched ? <span className="text-warn" title="Not in our food database"> ≈</span> : null}
              </span>
              <span className="tabular-nums text-ink-2">{Math.round(i.grams)} g</span>
            </li>
          ))}
        </ul>
        <p className="muted mt-2 text-xs">Raw weights for the whole recipe.</p>
      </section>
      <section className="card">
        <h2 className="h2">Method</h2>
        <ol className="mt-2 list-decimal space-y-2 pl-5">
          {steps.map((s, i) => (
            <li key={i}>{s}</li>
          ))}
        </ol>
        {r.protein_tip ? <p className="mt-3 rounded-xl bg-surface-2 p-3 text-sm">💡 {r.protein_tip}</p> : null}
      </section>
      <Link href={`/log?recipe=${r.id}`} className="btn-primary w-full">I cooked this — log my plate 📸</Link>
      <p className="muted text-xs">Recipe written by AI ({r.ai_model ?? "model not recorded"}, prompt {r.prompt_version}). Use your judgement in the kitchen.</p>
    </Page>
  );
}

export default function RecipePage({ params }: { params: Promise<{ id: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton title="Recipe" />}>
      <Recipe params={params} />
    </Suspense>
  );
}
