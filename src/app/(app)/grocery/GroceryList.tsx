"use client";
import { useMemo, useState, useTransition } from "react";
import { buildGrocery, toggleGroceryItem } from "@/app/actions/settings";
import { groceryListAsText, type GroceryItem } from "@/lib/nutrition/grocery";

type Item = { id: string; name: string; qty: number; unit: string; aisle: string; aisle_label: string; is_staple: boolean; checked: boolean; grams: number };

export function GroceryList({ weekOf, items }: { weekOf: string; items: Item[] }) {
  const [list, setList] = useState(items);
  const [staples, setStaples] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const visible = list.filter((i) => staples || !i.is_staple);
  const groups = useMemo(() => {
    const g = new Map<string, Item[]>();
    for (const i of visible) g.set(i.aisle_label, [...(g.get(i.aisle_label) ?? []), i]);
    return [...g.entries()];
  }, [visible]);

  async function share() {
    const text = groceryListAsText(
      list.filter((i) => !i.checked).map((i) => ({ key: i.id, name: i.name, aisle: i.aisle as GroceryItem["aisle"], aisleLabel: i.aisle_label, grams: i.grams, qty: Number(i.qty), unit: i.unit as GroceryItem["unit"], isStaple: i.is_staple })),
      staples,
    );
    try {
      if (navigator.share) {
        await navigator.share({ title: "Grocery list", text });
        return;
      }
    } catch (e) {
      if ((e as Error).name === "AbortError") return;
    }
    await navigator.clipboard.writeText(text);
    setMsg("Copied! Paste it into WhatsApp.");
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-2">
        <button className="btn-ghost" disabled={pending} onClick={() => start(async () => { const r = await buildGrocery(weekOf); setMsg(r.ok ? (r.note ?? null) : r.error); if (r.ok) location.reload(); })}>
          {pending ? "Building…" : list.length ? "↻ Rebuild" : "Build list"}
        </button>
        <button className="btn-primary" disabled={!list.length} onClick={share}>Share 📤</button>
      </div>
      <label className="flex items-center gap-3">
        <input type="checkbox" className="size-5" checked={staples} onChange={(e) => setStaples(e.target.checked)} />
        <span className="text-sm">Show pantry staples (salt, spices, oil…)</span>
      </label>
      {msg ? <p role="status" className="text-sm text-ink-2">{msg}</p> : null}
      {groups.map(([aisle, rows]) => (
        <section key={aisle} className="card">
          <h2 className="h2">{aisle}</h2>
          <ul className="mt-2 divide-y divide-line">
            {rows.map((i) => (
              <li key={i.id}>
                <label className="flex min-h-11 items-center gap-3 py-1">
                  <input type="checkbox" className="size-5" checked={i.checked} onChange={(e) => {
                    const checked = e.target.checked;
                    setList((l) => l.map((x) => (x.id === i.id ? { ...x, checked } : x)));
                    void toggleGroceryItem(i.id, checked);
                  }} />
                  <span className={`flex-1 ${i.checked ? "text-ink-2 line-through" : ""}`}>{i.name}</span>
                  <span className="tabular-nums text-ink-2">{Number(i.qty)} {i.unit}</span>
                </label>
              </li>
            ))}
          </ul>
        </section>
      ))}
    </div>
  );
}
