"use client";
import { useState, useTransition } from "react";
import { addComment, deleteComment, report, toggleReaction } from "@/app/actions/social";

const EMOJI = ["❤️", "🔥", "💪", "😋"] as const;

export type FeedEntry = {
  id: string;
  owner: string;
  ownerName: string;
  avatar: string;
  isMine: boolean;
  dish: string;
  mealType: string;
  kcal: number;
  protein: number;
  estimated: boolean;
  when: string;
  photoUrl: string | null;
  reactions: Record<string, { count: number; mine: boolean }>;
  comments: { id: string; name: string; body: string; mine: boolean }[];
};

export function FeedItem({ e }: { e: FeedEntry }) {
  const [pending, start] = useTransition();
  const [text, setText] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  return (
    <article className="card" aria-label={`${e.ownerName}: ${e.dish}`}>
      <header className="flex items-center justify-between">
        <p className="font-semibold"><span aria-hidden>{e.avatar}</span> {e.ownerName} <span className="font-normal text-ink-2">· {e.mealType} · {e.when}</span></p>
        {!e.isMine ? <button className="btn-ghost btn-sm" aria-label="More" aria-expanded={menu} onClick={() => setMenu(!menu)}>⋯</button> : null}
      </header>
      {menu ? (
        <button className="mt-2 text-sm text-danger underline" onClick={() => {
          const reason = prompt("What's wrong with this post?");
          if (reason) start(async () => { const r = await report("meal_log", e.id, reason); setMsg(r.ok ? (r.note ?? null) : r.error); setMenu(false); });
        }}>Report this post</button>
      ) : null}
      {e.photoUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={e.photoUrl} alt={e.dish} loading="lazy" className="mt-3 aspect-[4/3] w-full rounded-xl object-cover" />
      ) : null}
      <h3 className="mt-2 text-lg font-bold">{e.dish}</h3>
      <p className="text-sm text-ink-2">💪 {Math.round(e.protein)} g protein · 🔥 {e.kcal} kcal{e.estimated ? " · estimated" : ""}</p>
      <div className="mt-3 flex gap-2">
        {EMOJI.map((em) => {
          const r = e.reactions[em];
          return (
            <button key={em} className={`chip ${r?.mine ? "border-brand bg-brand/10" : ""}`} aria-pressed={!!r?.mine} disabled={pending} onClick={() => start(async () => void (await toggleReaction(e.id, em)))}>
              {em} {r?.count ? <span className="tabular-nums">{r.count}</span> : null}
            </button>
          );
        })}
      </div>
      {e.comments.length ? (
        <ul className="mt-3 space-y-1 text-sm">
          {e.comments.map((c) => (
            <li key={c.id} className="flex justify-between gap-2">
              <span><b>{c.name}</b> {c.body}</span>
              {c.mine || e.isMine ? <button className="text-xs text-ink-2 underline" onClick={() => start(async () => void (await deleteComment(c.id)))}>delete</button> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <form className="mt-3 flex gap-2" onSubmit={(ev) => { ev.preventDefault(); start(async () => { const r = await addComment(e.id, text); if (r.ok) setText(""); else setMsg(r.error); }); }}>
        <label className="sr-only" htmlFor={`c-${e.id}`}>Comment</label>
        <input id={`c-${e.id}`} className="field" value={text} onChange={(ev) => setText(ev.target.value)} maxLength={280} placeholder="Say something nice…" />
        <button className="btn-ghost" disabled={pending || !text.trim()}>Send</button>
      </form>
      {msg ? <p role="status" className="mt-2 text-sm text-ink-2">{msg}</p> : null}
    </article>
  );
}
