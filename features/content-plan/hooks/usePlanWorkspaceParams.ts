"use client";

/**
 * URL-backed workspace state for /content-plan: `?site=<web.site id>` and
 * `?view=tree|map|entities`. The shell header controls and the body
 * workbench both read/write through this ONE hook, so the header can live
 * in the PageHeader center zone (core-route doctrine: no in-body toolbar)
 * while the body stays in sync — and the URL stays shareable.
 */
import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export type PlanView = "tree" | "map" | "entities";

const VIEWS: readonly PlanView[] = ["tree", "map", "entities"];

export function usePlanWorkspaceParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const siteId = searchParams.get("site");
  const viewParam = searchParams.get("view");
  const view: PlanView = VIEWS.includes(viewParam as PlanView)
    ? (viewParam as PlanView)
    : "tree";

  const setParam = useCallback(
    (key: string, value: string | null) => {
      const params = new URLSearchParams(searchParams.toString());
      if (value === null) params.delete(key);
      else params.set(key, value);
      router.replace(`${pathname}?${params.toString()}`, { scroll: false });
    },
    [router, pathname, searchParams],
  );

  const setSiteId = useCallback(
    (next: string) => setParam("site", next),
    [setParam],
  );
  const setView = useCallback(
    (next: PlanView) => setParam("view", next === "tree" ? null : next),
    [setParam],
  );

  return { siteId, view, setSiteId, setView };
}
