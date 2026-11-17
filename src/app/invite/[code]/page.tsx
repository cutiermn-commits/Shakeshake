import { Suspense } from "react";
import { LoginForm } from "@/app/login/LoginForm";

async function Inner({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const clean = code.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 16);
  return <LoginForm invite={clean} notice="You've been invited to Shake Shake! Enter your email to join." />;
}

export default function InvitePage({ params }: { params: Promise<{ code: string }> }) {
  return (
    <Suspense fallback={<LoginForm />}>
      <Inner params={params} />
    </Suspense>
  );
}
