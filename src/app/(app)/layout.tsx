import { Suspense } from "react";
import { BottomNav, NavBar } from "@/components/BottomNav";

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <>
      {children}
      <Suspense fallback={<NavBar path="" />}>
        <BottomNav />
      </Suspense>
    </>
  );
}
