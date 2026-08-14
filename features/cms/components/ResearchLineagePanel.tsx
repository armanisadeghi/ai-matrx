"use client";

import { useState } from "react";
import { FlaskConical, LoaderCircle, MoveRight } from "lucide-react";

import { AssociationList } from "@/features/scopes/components/associations/AssociationList";
import { toast } from "@/lib/toast";
import {
  RESEARCH_LINEAGE_TOKENS,
  type ResearchLineageEntry,
} from "../hooks/useCmsResearchLineage";
import type { ContainerResourcesAdapter } from "@/features/scopes/components/associations/AssociationList";

export function ResearchLineagePanel({
  adapter,
  entries,
  canPromoteScratch,
  promoteScratch,
}: {
  adapter: ContainerResourcesAdapter;
  entries: readonly ResearchLineageEntry[];
  canPromoteScratch: boolean;
  promoteScratch: () => Promise<{ ok: boolean; error?: string }>;
}) {
  const [isPromoting, setIsPromoting] = useState(false);

  return (
    <section className="rounded-lg border border-border bg-card p-4">
      <div className="mb-3 flex items-start gap-2">
        <FlaskConical className="mt-0.5 h-4 w-4 text-primary" />
        <div>
          <h3 className="text-sm font-semibold">Research lineage</h3>
          <p className="text-xs text-muted-foreground">
            Topics and research tags available to this site or page and every
            agent working here. Inherited links stay attached at their original
            site, plan page, or canonical page.
          </p>
          {entries.length > 0 ? (
            <p className="mt-1 text-[11px] text-muted-foreground">
              {entries.length} connected research{" "}
              {entries.length === 1 ? "item" : "items"}
            </p>
          ) : null}
        </div>
      </div>
      <AssociationList
        adapter={adapter}
        tokens={[...RESEARCH_LINEAGE_TOKENS]}
        variant="compact"
      />
      {canPromoteScratch ? (
        <button
          type="button"
          disabled={isPromoting}
          className="mt-3 inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1.5 text-xs font-medium hover:bg-accent disabled:cursor-not-allowed disabled:opacity-60"
          onClick={() => {
            setIsPromoting(true);
            void promoteScratch()
              .then((result) => {
                if (result.ok) {
                  toast.success(
                    "Research lineage moved to the canonical record.",
                  );
                } else {
                  toast.error(
                    result.error ?? "Research lineage could not be moved.",
                  );
                }
              })
              .finally(() => setIsPromoting(false));
          }}
        >
          {isPromoting ? (
            <LoaderCircle className="h-3.5 w-3.5 animate-spin" />
          ) : (
            <MoveRight className="h-3.5 w-3.5" />
          )}
          {isPromoting
            ? "Moving research lineage…"
            : "Move draft links to canonical lineage"}
        </button>
      ) : null}
    </section>
  );
}
