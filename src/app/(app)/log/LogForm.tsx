"use client";
import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import { blobToBase64, compressImage, PHOTO_OPTIONS } from "@/lib/image/compress";
import { estimatePlate, saveMealLog } from "@/app/actions/log";
import type { PlateEstimate } from "@/lib/ai/schemas";

type Recipe = { id: string; title: string; kcal: number; protein: number } | null;
type Meal = "breakfast" | "lunch" | "dinner" | "snack";

export function LogForm({ uid, today, aiEnabled, shareDefault, recipe, defaultMeal }: { uid: string; today: string; aiEnabled: boolean; shareDefault: boolean; recipe: Recipe; defaultMeal: Meal }) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [preview, setPreview] = useState<string | null>(null);
  const [photoPath, setPhotoPath] = useState<string | null>(null);
  const [photoB64, setPhotoB64] = useState<string | null>(null);
  const [estimate, setEstimate] = useState<PlateEstimate | null>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [meal, setMeal] = useState<Meal>(defaultMeal);
  const [dish, setDish] = useState(recipe?.title ?? "");
  const [portion, setPortion] = useState(1);
  const [kcal, setKcal] = useState<string>(recipe ? String(recipe.kcal) : "");
  const [protein, setProtein] = useState<string>(recipe ? String(Math.round(recipe.protein)) : "");
  const [edited, setEdited] = useState(false);
  const [visibility, setVisibility] = useState<"friends" | "private">(shareDefault ? "friends" : "private");

  const applyPortion = (f: number) => {
    setPortion(f);
    if (recipe) {
      setKcal(String(Math.round(recipe.kcal * f)));
      setProtein(String(Math.round(recipe.protein * f)));
    }
  };

  async function onPhoto(file: File) {
    setStatus("Shrinking your photo…");
    setEstimate(null);
    try {
      const blob = await compressImage(file, PHOTO_OPTIONS); // re-encode strips EXIF/GPS
      setPreview(URL.createObjectURL(blob));
      const path = `${uid}/${today}-${crypto.randomUUID().slice(0, 8)}.jpg`;
      const supabase = createClient();
      const { error } = await supabase.storage.from("meal-photos").upload(path, blob, { contentType: "image/jpeg", upsert: false });
      if (error) throw new Error("Upload failed — you can still log without a photo.");
      setPhotoPath(path);
      setPhotoB64(await blobToBase64(blob));
      setStatus(aiEnabled ? "Photo ready. Tap “Estimate” for an AI guess, or fill in the numbers." : "Photo saved. Fill in the numbers below.");
    } catch (e) {
      setStatus((e as Error).message);
    }
  }

  function runEstimate() {
    if (!photoB64) return;
    start(async () => {
      setStatus("Our AI chef is squinting at your plate…");
      const res = await estimatePlate({ imageBase64: photoB64, recipeId: recipe?.id });
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      const e = res.data!;
      setEstimate(e);
      if (!dish) setDish(e.dish_guess);
      if (recipe && e.portion_factor) {
        // NUTRITION_RULES §5: with a chosen recipe, prefer recipe macros × portion factor.
        applyPortion(Math.round(e.portion_factor * 4) / 4);
      } else {
        setKcal(String(Math.round((e.kcal_range[0] + e.kcal_range[1]) / 2)));
        setProtein(String(Math.round((e.protein_g_range[0] + e.protein_g_range[1]) / 2)));
      }
      setEdited(false);
      setStatus("Here's our best guess — please check and correct it.");
    });
  }

  function save() {
    start(async () => {
      const source = estimate ? (edited ? "ai_corrected" : "ai") : recipe && dish === recipe.title ? "recipe" : "manual";
      const res = await saveMealLog({
        date: today,
        meal_type: meal,
        dish: dish.trim(),
        kcal: Number(kcal),
        protein_g: Number(protein),
        recipe_id: recipe?.id ?? null,
        photo_path: photoPath,
        ai_estimate: estimate,
        portion_factor: recipe ? portion : null,
        source,
        visibility,
      });
      if (!res.ok) {
        setStatus(res.error);
        return;
      }
      router.push("/today");
    });
  }

  const valid = dish.trim().length > 0 && kcal !== "" && protein !== "" && Number(kcal) >= 0 && Number(protein) >= 0;

  return (
    <div className="space-y-4">
      <section className="card">
        <h2 className="h2">Photo <span className="muted font-normal">(optional)</span></h2>
        <p className="muted mt-1">Plate only, please — no faces. Location data is removed before upload.</p>
        <input ref={fileRef} type="file" accept="image/*" capture="environment" className="sr-only" id="photo" onChange={(e) => e.target.files?.[0] && onPhoto(e.target.files[0])} />
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt="Your plate" className="mt-3 aspect-[4/3] w-full rounded-xl object-cover" />
        ) : null}
        <div className="mt-3 grid grid-cols-2 gap-2">
          <label htmlFor="photo" className="btn-ghost cursor-pointer">{preview ? "Retake" : "📸 Take photo"}</label>
          <button className="btn-primary" disabled={!photoB64 || !aiEnabled || pending} onClick={runEstimate} title={aiEnabled ? "" : "Turn on AI help in Settings"}>
            {pending && !estimate ? "Estimating…" : "✨ Estimate"}
          </button>
        </div>
        {!aiEnabled ? <p className="muted mt-2 text-xs">AI estimate is off (Settings → Privacy). Manual logging works perfectly.</p> : null}
      </section>

      {estimate ? (
        <section className="card border-turmeric" aria-live="polite">
          <h2 className="h2">AI estimate</h2>
          <p className="mt-1">{estimate.dish_guess}</p>
          <p className="mt-1 text-sm">
            <b>{estimate.kcal_range[0]}–{estimate.kcal_range[1]} kcal</b> · <b>{estimate.protein_g_range[0]}–{estimate.protein_g_range[1]} g protein</b>
          </p>
          <p className="muted text-xs">Confidence: {estimate.confidence}. Photo estimates are approximate — please correct anything that looks off.</p>
          {estimate.components.length ? <p className="muted mt-1 text-xs">Seen: {estimate.components.map((c) => `${c.name} ~${Math.round(c.est_grams)} g`).join(", ")}</p> : null}
        </section>
      ) : null}

      <section className="card space-y-3">
        <h2 className="h2">What did you eat?</h2>
        <div className="grid grid-cols-4 gap-1" role="radiogroup" aria-label="Meal">
          {(["breakfast", "lunch", "snack", "dinner"] as const).map((m) => (
            <button key={m} role="radio" aria-checked={meal === m} className={`chip justify-center capitalize ${meal === m ? "border-brand bg-brand/10 font-semibold" : ""}`} onClick={() => setMeal(m)}>
              {m}
            </button>
          ))}
        </div>
        <div>
          <label className="label" htmlFor="dish">Dish</label>
          <input className="field" id="dish" value={dish} maxLength={80} onChange={(e) => { setDish(e.target.value); setEdited(true); }} placeholder="e.g. Meen kuzhambu with rice" />
        </div>
        {recipe ? (
          <div>
            <label className="label" htmlFor="portion">Portion vs one recipe serving: <b>{portion.toFixed(2)}×</b></label>
            <input id="portion" type="range" min={0.5} max={2} step={0.25} value={portion} onChange={(e) => { applyPortion(Number(e.target.value)); setEdited(true); }} className="w-full accent-[var(--brand)]" />
          </div>
        ) : null}
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="kcal">Calories (kcal)</label>
            <input className="field" id="kcal" inputMode="numeric" type="number" min={0} max={5000} value={kcal} onChange={(e) => { setKcal(e.target.value); setEdited(true); }} />
          </div>
          <div>
            <label className="label" htmlFor="protein">Protein (g)</label>
            <input className="field" id="protein" inputMode="decimal" type="number" min={0} max={400} value={protein} onChange={(e) => { setProtein(e.target.value); setEdited(true); }} />
          </div>
        </div>
        <label className="flex items-center gap-3">
          <input type="checkbox" className="size-5" checked={visibility === "private"} onChange={(e) => setVisibility(e.target.checked ? "private" : "friends")} />
          <span className="text-sm">Keep this meal private 🔒</span>
        </label>
      </section>

      {status ? <p role="status" className="text-sm text-ink-2">{status}</p> : null}
      <button className="btn-primary w-full" disabled={!valid || pending} onClick={save}>{pending ? "Saving…" : "Save meal"}</button>
    </div>
  );
}
