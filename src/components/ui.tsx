import Link from "next/link";
import type { ReactNode } from "react";

export function Page({ title, subtitle, children, action }: { title: string; subtitle?: ReactNode; children: ReactNode; action?: ReactNode }) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 pb-28 pt-[max(1rem,env(safe-area-inset-top))]">
      <header className="mb-4 flex items-start justify-between gap-3">
        <div>
          <h1 className="h1">{title}</h1>
          {subtitle ? <p className="muted mt-1">{subtitle}</p> : null}
        </div>
        {action}
      </header>
      <div className="space-y-4">{children}</div>
    </main>
  );
}

export function Skeleton({ lines = 3 }: { lines?: number }) {
  return (
    <div className="card animate-pulse space-y-3" aria-busy="true" aria-label="Loading">
      {Array.from({ length: lines }, (_, i) => (
        <div key={i} className="h-4 rounded bg-surface-2" style={{ width: `${90 - i * 15}%` }} />
      ))}
    </div>
  );
}

export function PageSkeleton({ title }: { title: string }) {
  return (
    <Page title={title}>
      <Skeleton />
      <Skeleton lines={2} />
    </Page>
  );
}

const STATUS: Record<string, { label: string; cls: string; title: string }> = {
  computed: { label: "Calculated", cls: "bg-leaf/15 text-leaf", title: "Calculated from USDA FoodData Central (CC0) · raw ingredient weights" },
  partial: { label: "≈ Partly calculated", cls: "bg-turmeric/25 text-warn", title: "Some ingredients couldn't be matched — numbers are approximate" },
  ai_estimate: { label: "AI estimate", cls: "bg-turmeric/25 text-warn", title: "Most ingredients couldn't be matched — this is the AI's estimate" },
};

export function NutritionBadge({ status }: { status: string }) {
  const s = STATUS[status] ?? STATUS.ai_estimate;
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-semibold ${s.cls}`} title={s.title}>
      {s.label}
    </span>
  );
}

export function Stat({ label, value, sub }: { label: string; value: ReactNode; sub?: ReactNode }) {
  return (
    <div className="rounded-xl bg-surface-2 p-3">
      <div className="text-xs font-medium uppercase tracking-wide text-ink-2">{label}</div>
      <div className="mt-1 text-xl font-bold tabular-nums">{value}</div>
      {sub ? <div className="text-xs text-ink-2">{sub}</div> : null}
    </div>
  );
}

export function Meter({ value, min, max, label }: { value: number; min: number | null; max: number | null; label: string }) {
  const goal = max ?? min ?? 0;
  const pct = goal > 0 ? Math.min(100, Math.round((value / goal) * 100)) : 0;
  const inRange = min != null && max != null && value >= min && value <= max;
  return (
    <div>
      <div className="mb-1 flex justify-between text-sm">
        <span className="font-medium">{label}</span>
        <span className="tabular-nums text-ink-2">
          {Math.round(value)} / {min != null && max != null ? `${min}–${max}` : goal}
        </span>
      </div>
      <div className="h-3 overflow-hidden rounded-full bg-surface-2" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={label}>
        <div className={`h-full rounded-full ${inRange ? "bg-leaf" : "bg-brand"}`} style={{ width: `${pct}%` }} />
      </div>
    </div>
  );
}

export function Empty({ children, cta }: { children: ReactNode; cta?: { href: string; label: string } }) {
  return (
    <div className="card text-center">
      <p className="text-ink-2">{children}</p>
      {cta ? (
        <Link href={cta.href} className="btn-primary mt-3">
          {cta.label}
        </Link>
      ) : null}
    </div>
  );
}

export const DISCLAIMER =
  "Shake Shake gives suggestions from published formulas and a food database. It is not medical advice. If you have a medical condition, are pregnant or breastfeeding, or have a history of disordered eating, please talk to a doctor or dietitian.";
