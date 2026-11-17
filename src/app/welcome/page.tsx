import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile, getUserId } from "@/lib/server/dal";
import { WelcomeForm } from "./WelcomeForm";

async function Inner({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  if (!(await getUserId())) redirect("/login");
  const profile = await getProfile();
  if (profile) redirect(profile.onboarded ? "/today" : "/onboarding");
  const { invite = "" } = await searchParams;
  return <WelcomeForm invite={invite} />;
}

export default function Welcome({ searchParams }: { searchParams: Promise<{ invite?: string }> }) {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <h1 className="h1">Welcome! 👋</h1>
      <p className="muted mt-2">Shake Shake is invite-only for now. Enter your invite code to join.</p>
      <Suspense fallback={null}>
        <Inner searchParams={searchParams} />
      </Suspense>
    </main>
  );
}
