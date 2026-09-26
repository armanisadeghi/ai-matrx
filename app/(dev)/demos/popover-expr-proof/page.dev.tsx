"use client";

// app/(dev)/demos/popover-expr-proof/page.tsx — lane POPOVER-EXPR (2026-09-23)
//
// Headless proof harness for the three `sizing="content"` adoptions this lane
// made on callers whose width lived inside an EXPRESSION className (not the
// literal `className="w-64 ..."` the original guard could already see):
//
//   1. IconSelect          (components/official/IconSelect.tsx) — searchable
//      popover list; item labels are real project names of unpredictable
//      length.
//   2. EntityTypeCombobox  (components/entity-types/EntityTypeCombobox.tsx) —
//      the real, unmodified platform entity-type registry (system data, not
//      synthesized).
//   3. RunControlShell     (features/marketing/seo/topical-map/.../RunControlShell.tsx)
//      — a topical-map run's status popover; `error` is the server's own
//      sentence, unbounded length.
//
// THE USE CASE (owner law — no fake test data, never a real person): Northbay
// Commercial Solar's SEO topical-map campaign and its phased installation
// project list — the same synthesized, realistic template POPOVER-CENSUS used.
// Real field shapes, real-looking names, nobody a real person.
//
// No auth, no route params, no data fetch — every prop is inline so this page
// is reachable headlessly with nothing else running.

import IconSelect from "@/components/official/IconSelect";
import { EntityTypeCombobox } from "@/components/entity-types/EntityTypeCombobox";
import { RunControlShell } from "@/features/marketing/seo/topical-map/views/pages/runs/RunControlShell";
import { FolderKanban } from "lucide-react";
import { AGENT_ICON } from "@/components/icons/domain-icons";

const PROJECT_ITEMS = [
  {
    id: "1",
    label: "Northbay Commercial Solar — Marisol Okonkwo, Site Superintendent",
    icon: <FolderKanban className="h-4 w-4" />,
    value: "northbay-marisol",
  },
  {
    id: "2",
    label: "Northbay Commercial Solar — Fairview Distribution Center, Phase 2 Rooftop Array",
    icon: <FolderKanban className="h-4 w-4" />,
    value: "northbay-fairview",
  },
  {
    id: "3",
    label: "Northbay Commercial Solar — Del Rio Cold Storage, Carport Canopy Retrofit",
    icon: <FolderKanban className="h-4 w-4" />,
    value: "northbay-delrio",
  },
];

export default function PopoverExprProofPage() {
  return (
    <div className="flex min-h-screen flex-col gap-16 p-10">
      <section data-proof="icon-select" className="flex flex-col items-start gap-2">
        <h2 className="text-sm font-semibold">IconSelect (searchable)</h2>
        <IconSelect
          items={PROJECT_ITEMS}
          icon={<FolderKanban className="h-4 w-4" />}
          value="northbay-marisol"
          searchable
          ariaLabel="Choose project"
        />
      </section>

      {/* Realistic caller width: a side-panel form field, ~24rem, matching
          RuleEditorForm's usage — not the unconstrained full page width. */}
      <section data-proof="entity-type-combobox" className="flex max-w-sm flex-col items-start gap-2">
        <h2 className="text-sm font-semibold">EntityTypeCombobox</h2>
        <EntityTypeCombobox value={null} onChange={() => {}} />
      </section>

      <section data-proof="run-control-shell" className="flex flex-col items-start gap-2">
        <h2 className="text-sm font-semibold">RunControlShell</h2>
        <RunControlShell
          label="Map the pages"
          icon={<AGENT_ICON className="h-3.5 w-3.5" />}
          state={{
            running: false,
            restoring: false,
            stage: null,
            waitMessage: null,
            elapsedMs: 0,
            error:
              "The topical map run for Northbay Commercial Solar's \"Phased Commercial Rooftop Installation\" cluster stopped after page 14 of 22: the sitemap crawler received a 503 from northbaycommercialsolar.com/sitemap-projects.xml five times in a row and gave up rather than publish a partial map silently.",
            retry: async () => {},
            instanceId: "seo-command:proof",
          }}
        >
          <div className="text-xs text-muted-foreground">Run parameters would render here.</div>
        </RunControlShell>
      </section>
    </div>
  );
}
