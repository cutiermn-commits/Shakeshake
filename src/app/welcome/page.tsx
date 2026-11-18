import { Suspense } from "react";
import { redirect } from "next/navigation";
import { getProfile, getUserId } from "@/lib/server/dal";
import { WelcomeForm } from "./WelcomeForm";

async function Inner({ searchParams }: { searchParams: Promise<{ invite?: string; bad?: string }> }) {
  if (!(await getUserId())) redirect("/login");
  const profile = await getProfile();
  if (profile) redirect(profile.onboarded ? "/today" : "/onboarding");
  const { invite = "", bad } = await searchParams;
  return (
    <>
      {bad ? <p role="alert" className="mt-4 rounded-xl bg-surface-2 p-3 text-sm">That invite code didn&apos;t work (it may have expired or been used up). Ask the person who invited you for a new one.</p> : null}
      <WelcomeForm invite={invite} />
    </>
  );
}

export default function Welcome({ searchParams }: { searchParams: Promise<{ invite?: string; bad?: string }> }) {
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
