"use client";

// features/admin/spend/SpendLocalRedirect.tsx — AN OLD SPEND LINK WITH A DAY OR AN HOUR (lane
// DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL R4). The Spend Explorer's `f.day` / `f.hour` were the VIEWER's
// local day and hour (admin_spend_breakdown cut them in the browser's zone), so only the browser can
// map them to their real instants: it does, and replaces the address with the usage explorer's.

import { useEffect } from "react";
import { useRouter } from "next/navigation";

import { spendAddressToUsage } from "@/features/admin/usage-drill/usageLinks";

export function SpendLocalRedirect({ query }: { query: string }) {
  const router = useRouter();
  useEffect(() => {
    const zone = Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
    router.replace(spendAddressToUsage(new URLSearchParams(query), zone).href);
  }, [router, query]);
  return <div data-spend-local-redirect className="h-96 animate-pulse rounded-md bg-muted/50" />;
}
