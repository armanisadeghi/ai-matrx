"use client";

/**
 * BUSINESS GUIDELINES — its own door in the site Value area (KI-036).
 *
 * Until 2026-08-25 this document was only authored inside the retired
 * `?view=classification` workspace ("Teach classes"), which folded into the
 * Keyword Workbench once the Workbench reached parity on assignment. This
 * screen is that fold's home for the one thing the old view uniquely owned
 * here: the per-site prose document every AI classification/valuation run
 * reads first (D35). One clean screen — the document, its provenance, and
 * Save — reusing the same editor (`KwGuidelinesPanel`) and the same write
 * path (`setKwGuidelines` → `seo.gsc_set_site_kw_guidelines`) unchanged.
 *
 * SoR: common-docs/systems/marketing/seo/seo-keywords/value-system.md.
 */

import { BookOpenCheck } from "lucide-react";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import { KwGuidelinesPanel } from "./KwGuidelinesPanel";

export function GuidelinesWorkbench() {
  const { site } = useMarketingSite();

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border px-3 py-2.5 sm:px-4">
        <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
          <BookOpenCheck className="h-4 w-4 text-muted-foreground" />
          Business guidelines
        </h1>
        <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
          What the AI must know about this business before it judges a
          keyword — written once, read by every classification and valuation
          run for this site.
        </p>
      </header>

      <div className="mx-auto flex min-h-0 w-full max-w-3xl flex-1 flex-col overflow-hidden px-3 py-3 sm:px-4">
        <KwGuidelinesPanel siteId={site.id} />
      </div>
    </div>
  );
}
