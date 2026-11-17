import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile, getUserId } from "@/lib/server/dal";
import { PageSkeleton } from "@/components/ui";
import { OnboardingForm } from "./OnboardingForm";

export const metadata = { title: "Welcome" };

async function Inner() {
  if (!(await getUserId())) redirect("/login");
  const profile = await getProfile();
  if (!profile) redirect("/welcome");
  if (profile.onboarded) redirect("/today");
  return <OnboardingForm displayName={profile.display_name} />;
}

export default function Onboarding() {
  return (
    <Suspense fallback={<PageSkeleton title="Let's set you up" />}>
      <Inner />
    </Suspense>
  );
}
