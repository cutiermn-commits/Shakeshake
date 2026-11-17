import { Suspense } from "react";
import { LoginForm } from "./LoginForm";

async function Inner({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  const notice = sp.deleted ? "Your account and data have been deleted. Take care! 💛" : sp.error === "link"
        ? "That sign-in link expired or was already used. Request a new one below."
        : sp.error === "browser"
          ? "Please open the sign-in link in the same browser where you requested it (e.g. Safari), or request a new link here."
          : undefined;
  return <LoginForm invite={sp.invite ?? ""} notice={notice} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  return (
    <Suspense fallback={<LoginForm />}>
      <Inner searchParams={searchParams} />
    </Suspense>
  );
}
