import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

async function Inner({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const notice = sp.deleted ? "Your account and data have been deleted. Take care! 💛" : sp.error === "link" ? "That sign-in link expired. Request a new code below." : undefined;
  return <LoginForm invite={sp.invite ?? ""} notice={notice} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={<LoginForm />}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}
