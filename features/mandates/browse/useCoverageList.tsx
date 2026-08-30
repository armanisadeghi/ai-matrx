"use client";

// features/mandates/browse/useCoverageList.tsx
//
// What both mandate LISTS (/agents/mandates and an organization's mandate
// settings) share to wear coverage badges: ONE fetch, ONE filter state, and the
// service wired to narrow the page server-side when a badge is clicked.
//
// The narrowing carries KEYS the server already classified — never a second
// implementation of the green/orange/red rule (see ./service.ts).

import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import type { EntityListController } from "@/lib/entity-list/config";
import {
  COVERAGE_META,
  coverageKeysInBucket,
} from "@/features/mandates/coverage";
import {
  useMandateCoverageStates,
  useMandateCoverageView,
  type MandateCoverageFilterBucket,
  type MandateCoverageView,
} from "./CoverageBadge";
import {
  mandateListService,
  type MandateCoverageNarrowing,
  type MandateListScope,
} from "./service";
import type { MandateListRow } from "./types";

export interface CoverageListArgs {
  scope: MandateListScope;
  /**
   * Scope the report to ONE owner's mandates (the ownership law: an org page
   * answers for the org). Omit on the personal registry page.
   */
  organizationId?: string | null;
  /** False until the page can name its organization — see the hook. */
  enabled?: boolean;
}

export interface CoverageList {
  view: MandateCoverageView;
  service: ReturnType<typeof mandateListService>;
}

export function useCoverageList({
  scope,
  organizationId = null,
  enabled = true,
}: CoverageListArgs): CoverageList {
  const { report, states, loading, error } = useMandateCoverageStates(
    organizationId,
    enabled,
  );
  const [active, setActive] = useState<MandateCoverageFilterBucket | null>(null);

  const narrowing: MandateCoverageNarrowing | null =
    active && report
      ? { bucket: active, keys: coverageKeysInBucket(report, active) }
      : null;

  return {
    view: {
      report,
      states,
      loading,
      error,
      scoped: Boolean(organizationId),
      active,
      onToggleFilter: (bucket) =>
        setActive((prev) => (prev === bucket ? null : bucket)),
    },
    service: mandateListService(scope, narrowing),
  };
}

/**
 * The active-narrowing strip. It also OWNS the refetch: the shell re-queries on
 * a query change, and the coverage filter deliberately lives outside the URL
 * query (a 33-key list has no business in a shareable link), so the one thing
 * that has to happen when a badge is clicked is this refresh.
 */
export function MandateCoverageNotice({
  list,
}: {
  list: EntityListController<MandateListRow>;
}) {
  const view = useMandateCoverageView();
  const active = view?.active ?? null;
  const first = useRef(true);

  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    list.setPage(1);
    list.refresh();
  }, [active]);

  if (!view || !active) return null;
  const meta = COVERAGE_META[active];

  return (
    <div
      className={cn(
        "flex items-center gap-2 rounded-lg border px-3 py-1.5 text-[12px]",
        active === "orange"
          ? "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-400"
          : "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-400",
      )}
    >
      <span className="font-medium">Showing only: {meta.label}</span>
      <span className="min-w-0 flex-1 truncate text-muted-foreground">
        {meta.description}
      </span>
      <Button
        size="sm"
        variant="ghost"
        className="h-6 shrink-0 px-2 text-[11px]"
        onClick={() => view.onToggleFilter(active)}
      >
        <X className="mr-1 h-3 w-3" />
        Clear
      </Button>
    </div>
  );
}
