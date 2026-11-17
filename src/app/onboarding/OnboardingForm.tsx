"use client";
import { useActionState, useMemo, useState } from "react";
import Link from "next/link";
import { completeOnboarding } from "@/app/actions/onboarding";
import type { FormState } from "@/app/actions/auth";
import { ageFromBirthYear, suggestTargets, type ActivityLevel, type Goal, type Sex } from "@/lib/nutrition/targets";
import { DISCLAIMER } from "@/components/ui";

const STEPS = ["You", "Body & goal", "Food", "Targets", "Privacy"] as const;
const AVATARS = ["idli", "dosa", "vada", "chilli", "coconut", "mango"] as const;
const AVATAR_EMOJI: Record<string, string> = { idli: "🍚", dosa: "🥞", vada: "🍩", chilli: "🌶️", coconut: "🥥", mango: "🥭" };
const REGIONS = [
  ["tamil", "Tamil"],
  ["kerala", "Kerala"],
  ["andhra", "Andhra"],
  ["karnataka", "Karnataka"],
  ["telangana", "Telangana"],
  ["mixed", "A mix"],
] as const;

export function OnboardingForm({ displayName }: { displayName: string }) {
  const [state, action, pending] = useActionState<FormState, FormData>(completeOnboarding, null);
  const [step, setStep] = useState(0);
  const [body, setBody] = useState({ sex: "female" as Sex, birthYear: 1986, heightCm: 160, weightKg: 60, activity: "moderate" as ActivityLevel, goal: "maintain" as Goal, medical: false, indian: false });
  const suggestion = useMemo(() => {
    try {
      return suggestTargets({ sex: body.sex, weightKg: body.weightKg, heightCm: body.heightCm, age: ageFromBirthYear(body.birthYear), activity: body.activity, goal: body.goal, medicalFlag: body.medical, indianAdjusted: body.indian });
    } catch {
      return null;
    }
  }, [body]);
  const key = suggestion ? `${suggestion.kcalMin}-${suggestion.kcalMax}-${suggestion.proteinGMin}-${suggestion.proteinGMax}` : "none";

  const section = (i: number) => `space-y-4 ${step === i ? "" : "hidden"}`;

  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-16 pt-[max(1rem,env(safe-area-inset-top))]">
      <h1 className="h1">Let&apos;s set you up</h1>
      <ol className="mt-3 flex gap-1" aria-label="Progress">
        {STEPS.map((s, i) => (
          <li key={s} className={`h-1.5 flex-1 rounded-full ${i <= step ? "bg-brand" : "bg-surface-2"}`} aria-current={i === step ? "step" : undefined}>
            <span className="sr-only">{s}</span>
          </li>
        ))}
      </ol>
      <p className="muted mt-2">Step {step + 1} of {STEPS.length}: {STEPS[step]} · about 3 minutes</p>

      <form action={action} className="mt-4" noValidate>
        {/* Step 1 */}
        <fieldset className={section(0)}>
          <legend className="h2">About you</legend>
          <div>
            <label className="label" htmlFor="display_name">Name</label>
            <input className="field" id="display_name" name="display_name" defaultValue={displayName} maxLength={40} required />
          </div>
          <div>
            <label className="label" htmlFor="city">City <span className="font-normal">(for ingredient ideas — optional)</span></label>
            <input className="field" id="city" name="city" maxLength={60} placeholder="Chennai" />
          </div>
          <div>
            <span className="label">Pick an avatar</span>
            <div className="grid grid-cols-6 gap-2">
              {AVATARS.map((a, i) => (
                <label key={a} className="cursor-pointer">
                  <input type="radio" name="avatar_preset" value={a} defaultChecked={i === 0} className="peer sr-only" />
                  <span className="flex aspect-square items-center justify-center rounded-2xl border-2 border-line text-3xl peer-checked:border-brand peer-focus-visible:outline" aria-label={a}>
                    {AVATAR_EMOJI[a]}
                  </span>
                </label>
              ))}
            </div>
            <p className="muted mt-1">You can upload a photo later in Settings.</p>
          </div>
        </fieldset>

        {/* Step 2 */}
        <fieldset className={section(1)}>
          <legend className="h2">Body & goal</legend>
          <p className="muted">Used only to suggest your targets. Never shown to friends.</p>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="sex">Sex (for the formula)</label>
              <select className="field" id="sex" name="sex" value={body.sex} onChange={(e) => setBody({ ...body, sex: e.target.value as Sex })}>
                <option value="female">Female</option>
                <option value="male">Male</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="birth_year">Birth year</label>
              <input className="field" id="birth_year" name="birth_year" type="number" inputMode="numeric" min={1925} max={2008} value={body.birthYear} onChange={(e) => setBody({ ...body, birthYear: Number(e.target.value) })} required />
            </div>
            <div>
              <label className="label" htmlFor="height_cm">Height (cm)</label>
              <input className="field" id="height_cm" name="height_cm" type="number" inputMode="decimal" min={120} max={230} step="0.5" value={body.heightCm} onChange={(e) => setBody({ ...body, heightCm: Number(e.target.value) })} required />
            </div>
            <div>
              <label className="label" htmlFor="weight_kg">Weight (kg)</label>
              <input className="field" id="weight_kg" name="weight_kg" type="number" inputMode="decimal" min={30} max={250} step="0.1" value={body.weightKg} onChange={(e) => setBody({ ...body, weightKg: Number(e.target.value) })} required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="activity_level">Activity</label>
            <select className="field" id="activity_level" name="activity_level" value={body.activity} onChange={(e) => setBody({ ...body, activity: e.target.value as ActivityLevel })}>
              <option value="sedentary">Mostly sitting</option>
              <option value="light">Light exercise 1–3 days/week</option>
              <option value="moderate">Moderate exercise 3–5 days/week</option>
              <option value="very_active">Hard exercise 6–7 days/week</option>
              <option value="extra_active">Very hard exercise or physical job</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="goal">Goal</label>
            <select className="field" id="goal" name="goal" value={body.goal} onChange={(e) => setBody({ ...body, goal: e.target.value as Goal })}>
              <option value="lose">Lose fat</option>
              <option value="maintain">Maintain</option>
              <option value="gain">Gain / build muscle</option>
              <option value="recomposition">Recomposition (lose fat, keep muscle)</option>
            </select>
          </div>
          <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
            <input type="checkbox" name="medical_flag" className="mt-1 size-5" checked={body.medical} onChange={(e) => setBody({ ...body, medical: e.target.checked })} />
            <span className="text-sm">A doctor limits my protein (e.g. kidney disease), or I&apos;m pregnant or breastfeeding.</span>
          </label>
        </fieldset>

        {/* Step 3 */}
        <fieldset className={section(2)}>
          <legend className="h2">Food</legend>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="diet_type">Diet</label>
              <select className="field" id="diet_type" name="diet_type" defaultValue="nonveg">
                <option value="nonveg">Non-veg</option>
                <option value="egg">Egg + veg</option>
                <option value="veg">Vegetarian</option>
              </select>
            </div>
            <div>
              <label className="label" htmlFor="spice_level">Spice</label>
              <select className="field" id="spice_level" name="spice_level" defaultValue="medium">
                <option value="mild">Mild</option>
                <option value="medium">Medium</option>
                <option value="hot">Hot 🌶️</option>
              </select>
            </div>
          </div>
          <div>
            <span className="label">Favourite styles</span>
            <div className="flex flex-wrap gap-2">
              {REGIONS.map(([v, l]) => (
                <label key={v} className="chip has-[:checked]:border-brand has-[:checked]:bg-brand/10">
                  <input type="checkbox" name="regions" value={v} defaultChecked={v === "mixed"} className="size-4" /> {l}
                </label>
              ))}
            </div>
          </div>
          <div>
            <label className="label" htmlFor="max_cook_minutes">Time to cook on a weekday</label>
            <select className="field" id="max_cook_minutes" name="max_cook_minutes" defaultValue="45">
              <option value="20">Up to 20 min</option>
              <option value="30">Up to 30 min</option>
              <option value="45">Up to 45 min</option>
              <option value="60">Up to 1 hour</option>
              <option value="90">I love long cooks</option>
            </select>
          </div>
          <div>
            <label className="label" htmlFor="allergies">Allergies <span className="font-normal">(comma-separated — we&apos;ll never show these)</span></label>
            <input className="field" id="allergies" name="allergies" placeholder="e.g. peanuts, prawns" maxLength={500} />
          </div>
          <div>
            <label className="label" htmlFor="dislikes">Dislikes</label>
            <input className="field" id="dislikes" name="dislikes" placeholder="e.g. brinjal, bitter gourd" maxLength={500} />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="lunch_time">Usual lunch</label>
              <input className="field" id="lunch_time" name="lunch_time" type="time" defaultValue="13:00" required />
            </div>
            <div>
              <label className="label" htmlFor="dinner_time">Usual dinner</label>
              <input className="field" id="dinner_time" name="dinner_time" type="time" defaultValue="20:00" required />
            </div>
          </div>
        </fieldset>

        {/* Step 4 */}
        <fieldset className={section(3)}>
          <legend className="h2">Your daily targets</legend>
          {suggestion ? (
            <div className="card space-y-2">
              <p className="text-sm">
                Estimated resting burn (BMR) <b>{suggestion.bmr} kcal</b> · daily burn (TDEE) <b>{suggestion.tdee} kcal</b>
              </p>
              <p className="muted text-xs">{suggestion.method}. {suggestion.sourceNote}</p>
              {suggestion.warnings.map((w) => (
                <p key={w} className="text-sm text-warn">{w}</p>
              ))}
            </div>
          ) : (
            <p className="text-sm text-danger">Please check your body details in step 2.</p>
          )}
          <label className="flex items-start gap-3">
            <input type="checkbox" name="indian_adjusted" className="mt-1 size-5" checked={body.indian} onChange={(e) => setBody({ ...body, indian: e.target.checked })} />
            <span className="text-sm">Use the Indian-adjusted estimate (−5 %, after ICMR-NIN 2020)</span>
          </label>
          <div key={key} className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="kcal_min">Calories from</label>
              <input className="field" id="kcal_min" name="kcal_min" type="number" inputMode="numeric" defaultValue={suggestion?.kcalMin ?? 1600} min={800} max={6000} required />
            </div>
            <div>
              <label className="label" htmlFor="kcal_max">to</label>
              <input className="field" id="kcal_max" name="kcal_max" type="number" inputMode="numeric" defaultValue={suggestion?.kcalMax ?? 2000} min={800} max={6000} required />
            </div>
            <div>
              <label className="label" htmlFor="protein_g_min">Protein (g) from</label>
              <input className="field" id="protein_g_min" name="protein_g_min" type="number" inputMode="numeric" defaultValue={suggestion?.proteinGMin ?? ""} min={10} max={400} required placeholder={body.medical ? "Doctor's target" : ""} />
            </div>
            <div>
              <label className="label" htmlFor="protein_g_max">to</label>
              <input className="field" id="protein_g_max" name="protein_g_max" type="number" inputMode="numeric" defaultValue={suggestion?.proteinGMax ?? ""} min={10} max={400} required />
            </div>
          </div>
          <div>
            <label className="label" htmlFor="active_kcal_goal">Daily active-calorie goal (e.g. from your Oura ring)</label>
            <input className="field" id="active_kcal_goal" name="active_kcal_goal" type="number" inputMode="numeric" defaultValue={400} min={50} max={3000} required />
            <p className="muted mt-1">Placeholder 400 kcal — we&apos;ll suggest your own once you&apos;ve logged a couple of weeks. Locked each leaderboard week.</p>
          </div>
        </fieldset>

        {/* Step 5 */}
        <fieldset className={section(4)}>
          <legend className="h2">Your privacy choices</legend>
          <p className="muted">Each is separate. You can change them any time in Settings.</p>
          <label className="card flex items-start gap-3">
            <input type="checkbox" name="consent_health_data" className="mt-1 size-5" required />
            <span className="text-sm"><b>Store my health details</b> (age, sex, height, weight, allergies) to suggest targets and safe recipes. <i>Required for targets.</i></span>
          </label>
          <label className="card flex items-start gap-3">
            <input type="checkbox" name="consent_ai_processing" className="mt-1 size-5" />
            <span className="text-sm">
              <b>Use AI (Google Gemini, free tier)</b> for recipe ideas and plate-photo estimates. Google states free-tier content <b>may be used to improve its products</b>. We never send your name or email. Optional — manual logging always works.
            </span>
          </label>
          <label className="card flex items-start gap-3">
            <input type="checkbox" name="consent_social_sharing" className="mt-1 size-5" defaultChecked />
            <span className="text-sm"><b>Share my meals with friends</b>, including calories and protein. You can make any single meal private.</span>
          </label>
          <label className="flex items-start gap-3 rounded-xl bg-surface-2 p-3">
            <input type="checkbox" name="accept_disclaimer" className="mt-1 size-5" required />
            <span className="text-sm">{DISCLAIMER} <Link href="/privacy" className="underline" target="_blank">Privacy notice</Link></span>
          </label>
        </fieldset>

        {state?.error ? <p role="alert" className="mt-4 text-sm text-danger">{state.error}</p> : null}

        <div className="mt-6 flex gap-3">
          {step > 0 ? (
            <button type="button" className="btn-ghost flex-1" onClick={() => setStep(step - 1)}>Back</button>
          ) : null}
          {step < STEPS.length - 1 ? (
            <button type="button" className="btn-primary flex-1" onClick={() => setStep(step + 1)} disabled={step === 1 && !suggestion}>Next</button>
          ) : (
            <button className="btn-primary flex-1" disabled={pending}>{pending ? "Saving…" : "Let's cook! 🍳"}</button>
          )}
        </div>
      </form>
    </main>
  );
}
