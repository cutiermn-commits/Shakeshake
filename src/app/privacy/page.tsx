import Link from "next/link";
import { DISCLAIMER } from "@/components/ui";

export const metadata = { title: "Privacy & disclaimer" };

/**
 * M6-02. DRAFT — must be reviewed by a qualified person before public launch (DECISIONS O-009).
 */
export default function Privacy() {
  return (
    <main className="prose mx-auto max-w-xl px-5 py-10 text-ink">
      <h1 className="h1">Privacy & disclaimer</h1>
      <p className="muted">Draft notice · version 2026-11-17 · pending legal review before public launch.</p>

      <h2 className="h2 mt-6">Not medical advice</h2>
      <p>{DISCLAIMER}</p>

      <h2 className="h2 mt-6">What we collect and why</h2>
      <ul className="list-disc pl-5">
        <li><b>Account:</b> your email (to sign you in) and display name.</li>
        <li><b>Health details</b> (only with your consent): birth year, sex, height, weight, activity, goal, allergies and dislikes — used only to suggest targets and safe recipes. Never shown to friends.</li>
        <li><b>Meals & burn:</b> what you log, optional plate photos, calories burned you enter.</li>
        <li><b>Social</b> (only with your consent): friends can see meals you mark as visible, including calories and protein. You can make any meal private.</li>
        <li><b>Notifications:</b> your browser&apos;s push subscription, if you turn reminders on.</li>
      </ul>

      <h2 className="h2 mt-6">AI processing (Google Gemini)</h2>
      <p>
        If — and only if — you switch on AI help, recipe requests and plate photos are sent to Google&apos;s Gemini API on its <b>free tier</b>. Google states that free-tier content may be used to improve its products. We send only what the task needs (diet, targets, allergies, dish names, the photo) — never your name, email or avatar. Please photograph the plate, not people. You can switch AI off at any time in Settings; manual logging always works.
      </p>

      <h2 className="h2 mt-6">Where data lives</h2>
      <p>Supabase (database, sign-in, photo storage) and Vercel (app hosting). Photos are private; friends only see photos of meals you share. Original photos are deleted after 90 days.</p>

      <h2 className="h2 mt-6">Your rights</h2>
      <p>You can change or withdraw each consent separately, download all your data (Settings → Export) and delete your account and photos (Settings → Delete account). Withdrawing health-data consent deletes your health profile.</p>

      <h2 className="h2 mt-6">Contact</h2>
      <p>Questions or a data request? Contact the app owner who invited you. A grievance contact will be published before public launch (India DPDP Act 2023 / DPDP Rules 2025).</p>

      <p className="mt-8"><Link href="/" className="underline">Back</Link></p>
    </main>
  );
}
