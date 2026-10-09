"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { parseWindow, type SpendWindowDays } from "./agentSpend";

/** The window (7d / 30d) lives in the address (`?days=`), so a link keeps it. */
export function useSpendWindow(): [SpendWindowDays, (d: SpendWindowDays) => void] {
  const params = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();
  const days = parseWindow(params.get("days"));
  const set = (d: SpendWindowDays) => {
    const next = new URLSearchParams(params.toString());
    next.set("days", String(d));
    router.replace(`${pathname}?${next.toString()}`, { scroll: false });
  };
  return [days, set];
}
