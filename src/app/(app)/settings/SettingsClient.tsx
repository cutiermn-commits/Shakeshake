"use client";
import { useActionState, useState, useTransition } from "react";
import { deleteAccount, setConsent, updateHealthAndTargets, updateProfile } from "@/app/actions/settings";
import { signOut } from "@/app/actions/auth";
import type { ActionResult } from "@/app/actions/meals";
import type { ConsentPurpose } from "@/lib/server/dal";

const CONSENT_TEXT: Record<ConsentPurpose, { title: string; body: string }> = {
  health_data: { title: "Store my health details", body: "Needed for target suggestions and allergy-safe recipes. Turning this off deletes your health profile." },
  ai_processing: { title: "AI help (Google Gemini, free tier)", body: "Recipe ideas, swaps, weekly plans and plate estimates. Google states free-tier content may be used to improve its products. Off = manual only." },
  social_sharing: { title: "Share my meals with friends", body: "Friends see meals you don't mark private, including calories and protein." },
  marketing_push: { title: "Reminders & messages by push", body: "Max 4 a day, quiet 10 pm–7 am. Messages always appear in your inbox too." },
};

export function ConsentToggles({ consents }: { consents: Record<ConsentPurpose, boolean> }) {
  const [state, setState] = useState(consents);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);
  return (
    <ul className="space-y-3">
      {(Object.keys(CONSENT_TEXT) as ConsentPurpose[]).map((p) => (
        <li key={p}>
          <label className="flex items-start justify-between gap-3">
            <span>
              <span className="font-medium">{CONSENT_TEXT[p].title}</span>
              <span className="block text-sm text-ink-2">{CONSENT_TEXT[p].body}</span>
            </span>
            <input type="checkbox" role="switch" className="mt-1 size-6 shrink-0 accent-[var(--brand)]" checked={state[p]} disabled={pending} onChange={(e) => {
              const v = e.target.checked;
              if (!v && p === "health_data" && !confirm("This deletes your health profile. Targets stay, but can't be re-suggested until you turn it back on. Continue?")) return;
              setState({ ...state, [p]: v });
              start(async () => { const r = await setConsent(p, v); if (!r.ok) { setMsg(r.error); setState((s) => ({ ...s, [p]: !v })); } });
            }} />
          </label>
        </li>
      ))}
      {msg ? <li role="alert" className="text-sm text-danger">{msg}</li> : null}
    </ul>
  );
}

function Msg({ s }: { s: ActionResult | null }) {
  if (!s) return null;
  return <p role="status" className={`text-sm ${s.ok ? "text-leaf" : "text-danger"}`}>{s.ok ? s.note : s.error}</p>;
}

type P = { display_name: string; city: string | null; diet_type: string; spice_level: string; max_cook_minutes: number; lunch_time: string; dinner_time: string; timezone: string; regions: string[]; muted_categories: string[] };

export function ProfileForm({ p }: { p: P }) {
  const [s, action, pending] = useActionState<ActionResult | null, FormData>(updateProfile, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div className="col-span-2"><label className="label" htmlFor="display_name">Name</label><input className="field" id="display_name" name="display_name" defaultValue={p.display_name} maxLength={40} /></div>
        <div><label className="label" htmlFor="city">City</label><input className="field" id="city" name="city" defaultValue={p.city ?? ""} /></div>
        <div><label className="label" htmlFor="timezone">Timezone</label><input className="field" id="timezone" name="timezone" defaultValue={p.timezone} /></div>
        <div><label className="label" htmlFor="diet_type">Diet</label><select className="field" id="diet_type" name="diet_type" defaultValue={p.diet_type}><option value="nonveg">Non-veg</option><option value="egg">Egg + veg</option><option value="veg">Vegetarian</option></select></div>
        <div><label className="label" htmlFor="spice_level">Spice</label><select className="field" id="spice_level" name="spice_level" defaultValue={p.spice_level}><option value="mild">Mild</option><option value="medium">Medium</option><option value="hot">Hot</option></select></div>
        <div><label className="label" htmlFor="lunch_time">Lunch</label><input className="field" type="time" id="lunch_time" name="lunch_time" defaultValue={p.lunch_time.slice(0, 5)} /></div>
        <div><label className="label" htmlFor="dinner_time">Dinner</label><input className="field" type="time" id="dinner_time" name="dinner_time" defaultValue={p.dinner_time.slice(0, 5)} /></div>
        <div className="col-span-2"><label className="label" htmlFor="max_cook_minutes">Max cooking time (min)</label><input className="field" type="number" id="max_cook_minutes" name="max_cook_minutes" defaultValue={p.max_cook_minutes} min={10} max={240} /></div>
      </div>
      <fieldset>
        <legend className="label">Styles</legend>
        <div className="flex flex-wrap gap-2">
          {["tamil", "kerala", "andhra", "karnataka", "telangana", "mixed"].map((r) => (
            <label key={r} className="chip capitalize"><input type="checkbox" name="regions" value={r} defaultChecked={p.regions.includes(r)} className="size-4" /> {r}</label>
          ))}
        </div>
      </fieldset>
      <fieldset>
        <legend className="label">Mute push for…</legend>
        <div className="flex flex-wrap gap-2">
          {[["morning", "Morning hello"], ["suggestion_ready", "Meal ideas"], ["plate_reminder", "Plate reminders"], ["love_note", "Love notes"], ["weekly_plan", "Weekly plan"]].map(([k, l]) => (
            <label key={k} className="chip"><input type="checkbox" name="muted" value={k} defaultChecked={p.muted_categories.includes(k)} className="size-4" /> {l}</label>
          ))}
        </div>
      </fieldset>
      <Msg s={s} />
      <button className="btn-primary w-full" disabled={pending}>Save profile</button>
    </form>
  );
}

type H = { weight_kg: number | null; activity_level: string | null; goal: string | null; allergies: string[]; dislikes: string[] } | null;
type T = { kcal_min: number; kcal_max: number; protein_g_min: number | null; protein_g_max: number | null; active_kcal_goal: number } | null;

export function HealthForm({ h, t }: { h: H; t: T }) {
  const [s, action, pending] = useActionState<ActionResult | null, FormData>(updateHealthAndTargets, null);
  return (
    <form action={action} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><label className="label" htmlFor="weight_kg">Weight (kg)</label><input className="field" type="number" step="0.1" id="weight_kg" name="weight_kg" defaultValue={h?.weight_kg ?? ""} /></div>
        <div><label className="label" htmlFor="activity_level">Activity</label><select className="field" id="activity_level" name="activity_level" defaultValue={h?.activity_level ?? "moderate"}><option value="sedentary">Sedentary</option><option value="light">Light</option><option value="moderate">Moderate</option><option value="very_active">Very active</option><option value="extra_active">Extra active</option></select></div>
        <div className="col-span-2"><label className="label" htmlFor="goal">Goal</label><select className="field" id="goal" name="goal" defaultValue={h?.goal ?? "maintain"}><option value="lose">Lose fat</option><option value="maintain">Maintain</option><option value="gain">Gain</option><option value="recomposition">Recomposition</option></select></div>
        <div className="col-span-2"><label className="label" htmlFor="allergies">Allergies</label><input className="field" id="allergies" name="allergies" defaultValue={h?.allergies.join(", ") ?? ""} /></div>
        <div className="col-span-2"><label className="label" htmlFor="dislikes">Dislikes</label><input className="field" id="dislikes" name="dislikes" defaultValue={h?.dislikes.join(", ") ?? ""} /></div>
        <div><label className="label" htmlFor="kcal_min">kcal from</label><input className="field" type="number" id="kcal_min" name="kcal_min" defaultValue={t?.kcal_min ?? ""} /></div>
        <div><label className="label" htmlFor="kcal_max">to</label><input className="field" type="number" id="kcal_max" name="kcal_max" defaultValue={t?.kcal_max ?? ""} /></div>
        <div><label className="label" htmlFor="protein_g_min">Protein g from</label><input className="field" type="number" id="protein_g_min" name="protein_g_min" defaultValue={t?.protein_g_min ?? ""} /></div>
        <div><label className="label" htmlFor="protein_g_max">to</label><input className="field" type="number" id="protein_g_max" name="protein_g_max" defaultValue={t?.protein_g_max ?? ""} /></div>
        <div className="col-span-2"><label className="label" htmlFor="active_kcal_goal">Active-calorie goal</label><input className="field" type="number" id="active_kcal_goal" name="active_kcal_goal" defaultValue={t?.active_kcal_goal ?? 400} /></div>
      </div>
      <Msg s={s} />
      <button className="btn-primary w-full" disabled={pending}>Save health & targets</button>
    </form>
  );
}

export function DangerZone() {
  const [s, action, pending] = useActionState<ActionResult | null, FormData>(deleteAccount, null);
  return (
    <div className="space-y-3">
      <a href="/api/account/export" className="btn-ghost w-full">⬇️ Download my data (JSON)</a>
      <form action={signOut}><button className="btn-ghost w-full">Sign out</button></form>
      <details className="rounded-xl border border-danger/40 p-3">
        <summary className="cursor-pointer font-semibold text-danger">Delete my account</summary>
        <form action={action} className="mt-3 space-y-2">
          <p className="text-sm">This permanently deletes your profile, meals, photos, plans, friends and messages. It can&apos;t be undone.</p>
          <label className="label" htmlFor="confirm">Type DELETE to confirm</label>
          <input className="field" id="confirm" name="confirm" autoComplete="off" />
          <Msg s={s} />
          <button className="btn w-full bg-danger text-white" disabled={pending}>{pending ? "Deleting…" : "Delete everything"}</button>
        </form>
      </details>
    </div>
  );
}
