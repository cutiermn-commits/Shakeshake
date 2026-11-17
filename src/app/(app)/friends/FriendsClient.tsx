"use client";
import { useState, useTransition } from "react";
import { blockUser, createInvite, removeFriend, respondToRequest, sendFriendRequest, unblockUser } from "@/app/actions/social";

export function InviteBox({ friendCode }: { friendCode: string }) {
  const [pending, start] = useTransition();
  const [invite, setInvite] = useState<{ code: string; url: string } | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [code, setCode] = useState("");
  async function shareInvite(url: string) {
    const text = `Join me on Shake Shake — protein-rich South Indian meals & a friendly leaderboard 🍛💪 ${url}`;
    try {
      if (navigator.share) return void (await navigator.share({ title: "Shake Shake invite", text, url }));
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    await navigator.clipboard.writeText(text);
    setMsg("Invite link copied!");
  }
  return (
    <section className="card space-y-3">
      <h2 className="h2">Invite a friend</h2>
      <p className="muted">New to Shake Shake? Send an invite link (valid 7 days, one person).</p>
      {invite ? (
        <div className="rounded-xl bg-surface-2 p-3 text-sm">
          Code <b className="tracking-widest">{invite.code}</b>
          <button className="btn-primary mt-2 w-full" onClick={() => shareInvite(invite.url)}>Share invite 📤</button>
        </div>
      ) : (
        <button className="btn-primary w-full" disabled={pending} onClick={() => start(async () => { const r = await createInvite(1, 7); if (r.ok) setInvite(r.data!); else setMsg(r.error); })}>Create invite link</button>
      )}
      <hr className="border-line" />
      <p className="muted">Already on Shake Shake? Swap friend codes. Yours: <b className="tracking-widest text-ink">{friendCode}</b></p>
      <form className="flex gap-2" onSubmit={(e) => { e.preventDefault(); start(async () => { const r = await sendFriendRequest(code); setMsg(r.ok ? (r.note ?? "Sent") : r.error); if (r.ok) setCode(""); }); }}>
        <label htmlFor="fcode" className="sr-only">Friend code</label>
        <input id="fcode" className="field uppercase tracking-widest" value={code} onChange={(e) => setCode(e.target.value)} placeholder="Friend code" maxLength={12} />
        <button className="btn-ghost" disabled={pending || code.length < 6}>Add</button>
      </form>
      {msg ? <p role="status" className="text-sm text-ink-2">{msg}</p> : null}
    </section>
  );
}

export function RequestRow({ id, name }: { id: string; name: string }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <span className="font-medium">{name}</span>
      <span className="flex gap-1">
        <button className="btn-primary btn-sm" disabled={pending} onClick={() => start(async () => void (await respondToRequest(id, true)))}>Accept</button>
        <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => void (await respondToRequest(id, false)))}>Decline</button>
      </span>
    </li>
  );
}

export function FriendRow({ id, name, avatar }: { id: string; name: string; avatar: string }) {
  const [pending, start] = useTransition();
  const [open, setOpen] = useState(false);
  return (
    <li className="py-2">
      <div className="flex items-center justify-between">
        <span className="font-medium"><span aria-hidden>{avatar}</span> {name}</span>
        <button className="btn-ghost btn-sm" aria-expanded={open} onClick={() => setOpen(!open)} aria-label={`Options for ${name}`}>⋯</button>
      </div>
      {open ? (
        <div className="mt-2 flex gap-2">
          <button className="btn-ghost btn-sm flex-1" disabled={pending} onClick={() => confirm(`Remove ${name} as a friend?`) && start(async () => void (await removeFriend(id)))}>Remove</button>
          <button className="btn-ghost btn-sm flex-1 text-danger" disabled={pending} onClick={() => confirm(`Block ${name}? You won't see each other.`) && start(async () => void (await blockUser(id)))}>Block</button>
        </div>
      ) : null}
    </li>
  );
}

export function BlockedRow({ id }: { id: string }) {
  const [pending, start] = useTransition();
  return (
    <li className="flex items-center justify-between py-2 text-sm">
      <span className="text-ink-2">Blocked user</span>
      <button className="btn-ghost btn-sm" disabled={pending} onClick={() => start(async () => void (await unblockUser(id)))}>Unblock</button>
    </li>
  );
}
