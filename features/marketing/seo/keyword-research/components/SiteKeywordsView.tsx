"use client";

/**
 * The per-site keywords workspace shell — two views on one route:
 *   Performance     — persisted GSC/Bing query evidence + market data
 *                     (`SiteKeywordPerformanceWorkspace`, the original page).
 *   Classification  — the dedicated traffic-class truth-editing surface
 *                     (`KeywordClassificationWorkspace`, search-console
 *                     feature — it powers Traffic quality / Shifts / Juice).
 * View selection is URL state (`?view=classification`) so the Insights tab's
 * Unclassified row can deep-link straight into the review queue, filters
 * included (the classification table's own state is also URL state).
 */

import { useCallback } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { KeywordClassificationWorkspace } from "@/features/marketing/search-console/components/classification/KeywordClassificationWorkspace";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { cn } from "@/styles/themes/utils";
import { SiteKeywordPerformanceWorkspace } from "./SiteKeywordPerformanceWorkspace";

const VIEWS = [
  { key: "performance", label: "Performance" },
  { key: "classification", label: "Classification" },
] as const;

type SiteKeywordsViewKey = (typeof VIEWS)[number]["key"];

export function SiteKeywordsView() {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const view: SiteKeywordsViewKey =
    searchParams.get("view") === "classification"
      ? "classification"
      : "performance";

  const setView = useCallback(
    (next: SiteKeywordsViewKey) => {
      // Switching views drops the other view's table params (f_*, page, q)
      // deliberately — the two tables share the URL namespace.
      router.replace(
        next === "performance" ? pathname : `${pathname}?view=${next}`,
      );
    },
    [pathname, router],
  );

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="flex shrink-0 justify-end px-3 pt-2 sm:px-4">
        <ViewSwitch view={view} onChange={setView} />
      </div>
      {view === "performance" ? (
        <div className="min-h-0 flex-1">
          <SiteKeywordPerformanceWorkspace />
        </div>
      ) : (
        <ClassificationRouteMount />
      )}
    </div>
  );
}

function ClassificationRouteMount() {
  const { site } = useMarketingSite();
  return (
    <main className="flex min-h-0 flex-1 flex-col gap-2 overflow-y-auto bg-textured p-3 sm:p-4">
      <KeywordClassificationWorkspace
        siteId={site.id}
        siteDomain={site.domain}
        organizationId={site.organization_id}
      />
    </main>
  );
}

function ViewSwitch({
  view,
  onChange,
}: {
  view: SiteKeywordsViewKey;
  onChange: (view: SiteKeywordsViewKey) => void;
}) {
  return (
    <div className="pointer-events-auto flex items-center gap-0.5 rounded-md border border-border bg-card p-0.5 shadow-sm">
      {VIEWS.map((entry) => (
        <button
          key={entry.key}
          type="button"
          className={cn(
            "rounded px-2 py-1 text-xs transition-colors",
            view === entry.key
              ? "bg-accent font-medium text-foreground"
              : "text-muted-foreground hover:bg-accent hover:text-foreground",
          )}
          onClick={() => onChange(entry.key)}
        >
          {entry.label}
        </button>
      ))}
    </div>
  );
}
