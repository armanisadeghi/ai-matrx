"use client";

import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { clearCxTableFilters, hasActiveCxSourceFilters } from "../utils/filters";

/** Declares source filters to the canonical table's global Clear action. */
export function useCxTableFilters(tableId: string) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  return {
    active: hasActiveCxSourceFilters(new URLSearchParams(searchParams)),
    onReset: () => {
      // Read current URL so an immediately preceding table clear cannot be undone.
      const params = clearCxTableFilters(new URLSearchParams(window.location.search), tableId);
      const query = params.toString();
      router.push(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
    },
  };
}
