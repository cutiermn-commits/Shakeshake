"use client";
import { useEffect, useState, useSyncExternalStore } from "react";
import { removePushSubscription, savePushSubscription } from "@/app/actions/settings";

function urlBase64ToUint8Array(base64: string) {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const raw = atob((base64 + padding).replace(/-/g, "+").replace(/_/g, "/"));
  return Uint8Array.from(raw, (c) => c.charCodeAt(0));
}

type Env = { ios: boolean; standalone: boolean; supported: boolean; permission: NotificationPermission | "unsupported" };

let cachedEnv: Env | null = null;
const noopSubscribe = () => () => {};
function getEnv(): Env {
  return (cachedEnv ??= detect());
}

function detect(): Env {
  const ua = navigator.userAgent;
  const ios = /iPhone|iPad|iPod/.test(ua) || (ua.includes("Macintosh") && navigator.maxTouchPoints > 1);
  const standalone = window.matchMedia("(display-mode: standalone)").matches || (navigator as unknown as { standalone?: boolean }).standalone === true;
  const supported = "serviceWorker" in navigator && "PushManager" in window && "Notification" in window;
  return { ios, standalone, supported, permission: supported ? Notification.permission : "unsupported" };
}

/**
 * M1-06: Add-to-Home-Screen guide for iOS Safari + push opt-in that only asks on a tap.
 * VERIFIED (webkit.org/blog/13878): iOS/iPadOS 16.4+ Web Push requires a Home Screen web app and a user gesture.
 */
export function PushSetup({ compact = false }: { compact?: boolean }) {
  const env = useSyncExternalStore(noopSubscribe, getEnv, () => null);
  const [subscribed, setSubscribed] = useState<PushSubscription | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (getEnv().supported) navigator.serviceWorker.getRegistration().then((r) => r?.pushManager.getSubscription()).then((s) => setSubscribed(s ?? null)).catch(() => {});
  }, []);

  if (!env) return null;

  if (env.ios && !env.standalone) {
    return (
      <section className="card border-turmeric" aria-label="Install the app">
        <h2 className="h2">Add Shake Shake to your Home Screen 📲</h2>
        <ol className="mt-2 list-decimal space-y-1 pl-5 text-sm">
          <li>Tap the <b>Share</b> button <span aria-hidden>⬆️</span> in Safari.</li>
          <li>Choose <b>Add to Home Screen</b>.</li>
          <li>Open Shake Shake from your Home Screen, then turn on reminders here.</li>
        </ol>
        <p className="muted mt-2">iPhone only allows reminders for apps on the Home Screen (iOS 16.4 or later).</p>
      </section>
    );
  }
  if (!env.supported) return compact ? null : <p className="muted">This browser can&apos;t receive reminders — you&apos;ll still find them in your inbox.</p>;
  if (subscribed && compact) return null;

  async function enable() {
    setBusy(true);
    setMsg(null);
    try {
      const perm = await Notification.requestPermission(); // called directly from the tap handler
      if (perm !== "granted") {
        setMsg("No problem — reminders will wait in your inbox instead.");
        return;
      }
      const reg = (await navigator.serviceWorker.getRegistration()) ?? (await navigator.serviceWorker.register("/sw.js", { scope: "/" }));
      await navigator.serviceWorker.ready;
      const key = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!key) throw new Error("Reminders aren't configured yet.");
      const sub = await reg.pushManager.subscribe({ userVisibleOnly: true, applicationServerKey: urlBase64ToUint8Array(key) });
      const res = await savePushSubscription(JSON.parse(JSON.stringify(sub)), navigator.userAgent);
      if (!res.ok) throw new Error(res.error);
      setSubscribed(sub);
      setMsg("Reminders on! Max 4 a day, never between 10 pm and 7 am.");
    } catch (e) {
      setMsg((e as Error).message || "Couldn't turn on reminders.");
    } finally {
      setBusy(false);
    }
  }

  async function disable() {
    if (!subscribed) return;
    setBusy(true);
    await removePushSubscription(subscribed.endpoint);
    await subscribed.unsubscribe().catch(() => {});
    setSubscribed(null);
    setBusy(false);
    setMsg("Reminders off. Messages will still appear in your inbox.");
  }

  return (
    <section className={compact ? "card" : ""} aria-label="Reminders">
      {compact ? <h2 className="h2">Turn on reminders 🔔</h2> : null}
      {compact ? <p className="muted mt-1">Plate-photo nudges and a little love — max 4 a day.</p> : null}
      {subscribed ? (
        <button className="btn-ghost mt-3 w-full" onClick={disable} disabled={busy}>Turn reminders off</button>
      ) : (
        <button className="btn-primary mt-3 w-full" onClick={enable} disabled={busy}>{busy ? "Asking…" : "Turn on reminders"}</button>
      )}
      {msg ? <p role="status" className="mt-2 text-sm text-ink-2">{msg}</p> : null}
    </section>
  );
}
