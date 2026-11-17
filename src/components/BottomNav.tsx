"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/today", label: "Today", icon: "🍛" },
  { href: "/plan", label: "Plan", icon: "🗓️" },
  { href: "/log", label: "Log", icon: "📸" },
  { href: "/feed", label: "Friends", icon: "👯" },
  { href: "/dashboard", label: "Me", icon: "📈" },
];

export function BottomNav() {
  return <NavBar path={usePathname()} />;
}

export function NavBar({ path }: { path: string }) {
  return (
    <nav aria-label="Main" className="fixed inset-x-0 bottom-0 z-20 border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur">
      <ul className="mx-auto grid max-w-xl grid-cols-5">
        {TABS.map((t) => {
          const active = path === t.href || path.startsWith(`${t.href}/`);
          return (
            <li key={t.href}>
              <Link href={t.href} aria-current={active ? "page" : undefined} className={`flex min-h-14 flex-col items-center justify-center text-xs ${active ? "font-bold text-brand" : "text-ink-2"}`}>
                <span aria-hidden className="text-xl leading-none">{t.icon}</span>
                {t.label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}
