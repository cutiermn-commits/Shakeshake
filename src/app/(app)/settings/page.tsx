import { Suspense } from "react";
import Link from "next/link";
import { CONSENT_VERSION, getConsents, getHealthProfile, getTargets, isAdmin, requireMember } from "@/lib/server/dal";
import { PushSetup } from "@/components/PushSetup";
import { DISCLAIMER, Page, PageSkeleton } from "@/components/ui";
import { ConsentToggles, DangerZone, HealthForm, ProfileForm } from "./SettingsClient";

export const metadata = { title: "Settings" };

async function Settings() {
  const { profile } = await requireMember();
  const [consents, health, targets, admin] = await Promise.all([getConsents(), getHealthProfile(), getTargets(), isAdmin()]);
  return (
    <>
      <section className="card">
        <h2 className="h2 mb-3">Privacy choices</h2>
        <ConsentToggles consents={consents} />
        <p className="muted mt-3 text-xs">Consent version {CONSENT_VERSION} · <Link href="/privacy" className="underline">Privacy notice</Link></p>
      </section>
      <section className="card">
        <h2 className="h2">Reminders</h2>
        <PushSetup />
      </section>
      <section className="card">
        <h2 className="h2 mb-3">Profile</h2>
        <ProfileForm p={profile} />
      </section>
      <section className="card">
        <h2 className="h2 mb-1">Health & targets</h2>
        {targets ? <p className="muted mb-3 text-xs">{targets.method} · {targets.source_note}</p> : null}
        {consents.health_data ? <HealthForm h={health} t={targets} /> : <p className="muted">Turn on “Store my health details” above to edit these.</p>}
      </section>
      {admin ? <Link href="/admin" className="btn-ghost w-full">🛠️ Owner admin</Link> : null}
      <section className="card">
        <h2 className="h2 mb-3">Your data</h2>
        <DangerZone />
      </section>
      <p className="muted text-xs">{DISCLAIMER}</p>
    </>
  );
}

export default function SettingsPage() {
  return (
    <Page title="Settings">
      <Suspense fallback={<PageSkeleton title="" />}>
        <Settings />
      </Suspense>
    </Page>
  );
}
