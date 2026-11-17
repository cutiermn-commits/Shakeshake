"use client";
import { useTransition } from "react";
import { deleteMealLog, setLogVisibility } from "@/app/actions/log";

export function LogRow({ log }: { log: { id: string; dish: string; meal_type: string; kcal: number; protein_g: number; visibility: string; source: string } }) {
  const [pending, start] = useTransition();
  const est = log.source === "ai" || log.source === "ai_corrected";
  return (
    <li className="flex items-center justify-between gap-2 py-2">
      <div className="min-w-0">
        <p className="truncate font-medium">{log.dish}</p>
        <p className="text-xs text-ink-2">
          <span className="capitalize">{log.meal_type}</span> · {log.kcal} kcal · {Math.round(log.protein_g)} g protein{est ? " · estimated" : ""}
        </p>
      </div>
      <div className="flex shrink-0 gap-1">
        <button className="btn-ghost btn-sm" disabled={pending} aria-label={log.visibility === "private" ? "Share with friends" : "Make private"} onClick={() => start(async () => void (await setLogVisibility(log.id, log.visibility === "private" ? "friends" : "private")))}>
          {log.visibility === "private" ? "🔒" : "👯"}
        </button>
        <button className="btn-ghost btn-sm" disabled={pending} aria-label="Delete" onClick={() => confirm("Delete this meal?") && start(async () => void (await deleteMealLog(log.id)))}>🗑️</button>
      </div>
    </li>
  );
}
