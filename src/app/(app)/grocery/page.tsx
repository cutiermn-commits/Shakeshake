import { Suspense } from "react";
import { requireMember } from "@/lib/server/dal";
import { weekStart } from "@/lib/nutrition/balance";
import { AISLE_LABELS, type Aisle } from "@/lib/data/ingredients";
import { Page, PageSkeleton } from "@/components/ui";
import { GroceryList } from "./GroceryList";

export const metadata = { title: "Groceries" };

async function Grocery({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { uid, supabase, today } = await requireMember();
  const sp = await searchParams;
  const ws = weekStart(sp.week && /^\d{4}-\d{2}-\d{2}$/.test(sp.week) ? sp.week : today);
  const { data: list } = await supabase.from("grocery_lists").select("id, grocery_items(id, name, qty, unit, aisle, is_staple, checked, grams)").eq("user_id", uid).eq("week_start", ws).maybeSingle();
  const order = Object.keys(AISLE_LABELS);
  const items = ((list?.grocery_items ?? []) as { id: string; name: string; qty: number; unit: string; aisle: string; is_staple: boolean; checked: boolean; grams: number }[])
    .map((i) => ({ ...i, aisle_label: AISLE_LABELS[i.aisle as Aisle] ?? "Other" }))
    .sort((a, b) => order.indexOf(a.aisle) - order.indexOf(b.aisle) || a.name.localeCompare(b.name));
  return <GroceryList weekOf={ws} items={items} />;
}

export default function GroceryPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  return (
    <Suspense fallback={<PageSkeleton title="Groceries" />}>
      <Page title="Groceries" subtitle="From your week plan · quantities rounded up to shop-friendly sizes">
        <Grocery searchParams={searchParams} />
      </Page>
    </Suspense>
  );
}
