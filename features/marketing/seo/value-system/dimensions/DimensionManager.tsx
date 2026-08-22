"use client";

/**
 * KEYWORD DIMENSION MANAGER — the screen that ends the "rules in the agent's
 * head" problem for keyword vocabulary.
 *
 * THE RULING BEHIND IT (Arman, 2026-08-21): "When an agent calls something
 * 'certificate_seeking' that's great but an agent tomorrow will use a
 * different set of options and rules because the rules are in their own head
 * AND the user gets no say in that!" Until the D37 migration the 13 keyword
 * dimensions were hard columns with CHECK arrays: a site could not add one at
 * all. Now it can, and this is where.
 *
 * REFERENCE PRODUCT: Airtable's single-select field editor. It is the surface
 * where a non-technical person routinely does exactly this job — name a field,
 * write its allowed choices, and see them used everywhere afterwards — and it
 * never asks them what a taxonomy is. The two things we add that Airtable does
 * not have, because governance demands them: every choice shows how much data
 * already wears it, and shared-vs-yours is stated on the row rather than
 * implied by whether a control happens to be greyed out.
 *
 * WHAT IT DOES NOT DO. There is no delete. A dimension row can vanish; the
 * keywords classified against it cannot. Retirement is a separate change with
 * its own proof, and this screen shows the counts that make that decision
 * possible instead of offering a button that quietly orphans facts.
 */

import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { Layers, Lock, Plus } from "lucide-react";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteContext";
import {
  InlineQueryError,
  QueryError,
} from "@/features/marketing/components/shared/MarketingUi";
import { WhatIsADimension } from "./WhatIsADimension";
import { DimensionCard } from "./DimensionCard";
import { DimensionForm, type DimensionFormValue } from "./DimensionForm";
import { getFacetDimensionCatalog, upsertFacetDimension } from "./data";

function CatalogSkeleton() {
  return (
    <div className="space-y-2" aria-hidden>
      {[0, 1, 2, 3].map((row) => (
        <div key={row} className="rounded-lg border border-border bg-card p-3">
          <div className="flex items-center gap-2">
            <Skeleton className="h-4 w-4 rounded" />
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-4 w-16" />
          </div>
          <Skeleton className="mt-2 h-3 w-3/4" />
          <Skeleton className="mt-1.5 h-3 w-1/3" />
        </div>
      ))}
    </div>
  );
}

export function DimensionManager() {
  const { site } = useMarketingSite();
  const siteId = site.id;
  const queryClient = useQueryClient();
  const [creating, setCreating] = useState(false);
  const [savingNew, setSavingNew] = useState(false);

  const catalogKey = ["marketing", "seo", "facet-dimensions", siteId];
  const catalog = useQuery({
    queryKey: catalogKey,
    queryFn: ({ signal }) => getFacetDimensionCatalog(siteId, signal),
    staleTime: 60_000,
  });

  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: catalogKey });
  };

  const createDimension = async (draft: DimensionFormValue) => {
    setSavingNew(true);
    try {
      await upsertFacetDimension({
        slug: draft.slug,
        label: draft.label,
        description: draft.description || null,
        cardinality: draft.cardinality,
        siteId,
      });
      setCreating(false);
      toast.success(`“${draft.label}” is yours — now write its answers`);
      refresh();
    } catch (error) {
      // A governance refusal is a SENTENCE written for this reader. Never
      // replace it with a generic message.
      toast.error(extractErrorMessage(error));
    } finally {
      setSavingNew(false);
    }
  };

  const dimensions = catalog.data ?? [];
  const mine = dimensions.filter((dimension) => dimension.scope === "site");
  const shared = dimensions.filter((dimension) => dimension.scope !== "site");

  return (
    <div className="flex h-full min-h-0 flex-col overflow-hidden">
      <header className="shrink-0 border-b border-border px-3 py-2.5 sm:px-4">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div className="min-w-0">
            <h1 className="flex items-center gap-2 text-base font-semibold text-foreground">
              <Layers className="h-4 w-4 text-muted-foreground" />
              Keyword dimensions
            </h1>
            <p className="mt-0.5 max-w-2xl text-xs leading-5 text-muted-foreground">
              The questions asked about every search term your customers type,
              and the only answers allowed. Written down here, they are the same
              tomorrow as today — for every person and every agent.
            </p>
          </div>
          {!creating ? (
            <Button
              size="sm"
              className="h-8 shrink-0"
              onClick={() => setCreating(true)}
            >
              <Plus className="mr-1.5 h-3.5 w-3.5" /> New dimension
            </Button>
          ) : null}
        </div>
      </header>

      <div className="min-h-0 flex-1 overflow-y-auto scrollbar-thin">
        <div className="mx-auto w-full max-w-4xl space-y-4 px-3 py-3 sm:px-4">
          {/* Keyed so the "nobody has authored one yet" case opens the
              explainer the moment the catalogue answers — a default read on
              the first (loading) render would always be false. */}
          <WhatIsADimension
            key={
              catalog.data
                ? mine.length === 0
                  ? "explainer-empty"
                  : "explainer-filled"
                : "explainer-pending"
            }
            defaultOpen={Boolean(catalog.data) && mine.length === 0}
          />

          {catalog.isPending && !catalog.isError ? <CatalogSkeleton /> : null}

          {/* Two honest failure shapes. Nothing to show -> the whole panel is
              the error. Something to show but the REFRESH failed -> keep the
              rows and say so out loud, because silently serving stale counts
              on a screen whose whole job is "what is true" is a lie. */}
          {catalog.isError && !catalog.data ? (
            <QueryError
              error={catalog.error}
              onRetry={() => void catalog.refetch()}
            />
          ) : null}
          {catalog.isError && catalog.data ? (
            <InlineQueryError
              what="the latest dimensions — what you see below may be out of date"
              error={catalog.error}
              onRetry={() => void catalog.refetch()}
            />
          ) : null}

          {catalog.data ? (
            <>
              <section className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <h2 className="text-sm font-semibold text-foreground">
                    Your dimensions
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Only this site uses these. You name them and you decide what
                    they mean.
                  </p>
                </div>

                {creating ? (
                  <DimensionForm
                    mode="create"
                    existing={dimensions.map((dimension) => ({
                      slug: dimension.slug,
                      label: dimension.label,
                      scope: dimension.scope,
                    }))}
                    pending={savingNew}
                    onCancel={() => setCreating(false)}
                    onSubmit={(draft) => void createDimension(draft)}
                  />
                ) : null}

                {mine.length === 0 && !creating ? (
                  <div className="rounded-lg border border-dashed border-border bg-card px-3 py-4">
                    <p className="text-xs font-semibold text-foreground">
                      You have not added a dimension of your own yet
                    </p>
                    <p className="mt-1 max-w-2xl text-[11px] leading-4 text-muted-foreground">
                      Right now your keywords are only sorted by the shared
                      facts below — what kind of query it is, whether it is
                      local, how urgent it sounds. None of them know the one
                      thing that decides whether a job is worth having in{" "}
                      <em>your</em> business. Add that one thing and every
                      keyword report, every value rule, and every agent starts
                      using it immediately.
                    </p>
                    <Button
                      size="sm"
                      className="mt-2.5 h-8"
                      onClick={() => setCreating(true)}
                    >
                      <Plus className="mr-1.5 h-3.5 w-3.5" /> Add your first
                      dimension
                    </Button>
                  </div>
                ) : null}

                {mine.map((dimension) => (
                  <DimensionCard
                    key={dimension.dimension_id}
                    dimension={dimension}
                    siteId={siteId}
                    defaultExpanded={mine.length <= 3}
                    onSaved={refresh}
                  />
                ))}
              </section>

              <section className="space-y-2">
                <div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
                  <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
                    <Lock className="h-3.5 w-3.5 text-muted-foreground" />
                    Shared across every site
                  </h2>
                  <p className="text-[11px] text-muted-foreground">
                    Facts that mean the same thing everywhere, so results stay
                    comparable. Read them; you cannot rename them.
                  </p>
                </div>
                {shared.length === 0 ? (
                  <p className="rounded-lg border border-dashed border-border px-3 py-4 text-[11px] text-muted-foreground">
                    No shared dimensions are published yet.
                  </p>
                ) : (
                  shared.map((dimension) => (
                    <DimensionCard
                      key={dimension.dimension_id}
                      dimension={dimension}
                      siteId={siteId}
                      defaultExpanded={false}
                      onSaved={refresh}
                    />
                  ))
                )}
              </section>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}
