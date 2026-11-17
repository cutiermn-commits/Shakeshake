import Link from "next/link";
import { DISCLAIMER } from "@/components/ui";

export default function Landing() {
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-6 py-12">
      <p className="text-5xl" aria-hidden>🍳</p>
      <h1 className="mt-4 text-4xl font-extrabold tracking-tight">Shake Shake</h1>
      <p className="mt-2 text-lg text-ink-2">The only shake you need is the one you give the pan.</p>
      <ul className="mt-6 space-y-2 text-ink">
        <li>🍛 Protein-rich South Indian lunch & dinner ideas — swap anything</li>
        <li>🗓️ A weekly plan and a grocery list that writes itself</li>
        <li>📸 Snap your plate, get a calorie & protein estimate you can correct</li>
        <li>👯 Cheer friends on with a fair leaderboard</li>
      </ul>
      <Link href="/login" className="btn-primary mt-8 w-full">Sign in</Link>
      <p className="muted mt-3 text-center">Invite-only for now. Got a code? Use it on the sign-in page.</p>
      <p className="mt-10 text-xs text-ink-2">{DISCLAIMER} <Link className="underline" href="/privacy">Privacy</Link></p>
    </main>
  );
}
