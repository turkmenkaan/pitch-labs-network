"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

// Keeps a page that someone leaves open in step with what the other side does
// (a withdrawal, an acceptance, a cancellation): refreshes the server data when
// the tab regains focus and every 30 seconds while it is visible. Form input
// the person has typed stays put.
export function AutoRefresh({ intervalMs = 30_000 }: { intervalMs?: number }) {
  const router = useRouter();

  useEffect(() => {
    let last = Date.now();
    const refresh = () => {
      if (document.visibilityState !== "visible") return;
      if (Date.now() - last < 2_000) return; // focus + visibility fire together
      last = Date.now();
      router.refresh();
    };
    const timer = setInterval(refresh, intervalMs);
    window.addEventListener("focus", refresh);
    document.addEventListener("visibilitychange", refresh);
    return () => {
      clearInterval(timer);
      window.removeEventListener("focus", refresh);
      document.removeEventListener("visibilitychange", refresh);
    };
  }, [router, intervalMs]);

  return null;
}
