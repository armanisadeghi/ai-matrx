"use client";

/**
 * The portfolio, rendered as WORK.
 *
 * Every row here has a real action: a platform becomes a `web.listing_publisher`
 * row through the WS7 intake contract, an artifact becomes a tracked platform
 * task linked to the brand. Nothing on this panel is decorative prose —
 * the markdown twin (the Endowment Analyst) is where prose belongs.
 *
 * Doctrine: `../../../../common-docs/systems/marketing/local-listings/ENDOWMENTS.md`
 */

import { useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Check,
  CircleAlert,
  ListPlus,
  Plus,
  Trophy,
} from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
import { Separator } from "@/components/ui/separator";
import {
  useAddDiscoveredPublisher,
  useListingPublishers,
} from "@/features/marketing/data/hooks";
import { upsertSystemTask } from "@/features/tasks/services/taskService";
import {
  ENDOWMENT_LABELS,
  ENDOWMENT_QUESTIONS,
  REFERENCE_CLASS_LABELS,
  TIER3_ARCHETYPE_LABELS,
  matchPlatformsToRegistry,
  toArtifactTask,
  toDiscoveredPublisher,
  type EndowmentPortfolio,
  type EndowmentVerdict,
  type PortfolioArtifact,
  type PortfolioPlatform,
  type RegistryMatch,
} from "@/features/marketing/local/endowment-portfolio";
import {
  PUBLISHER_API_ACCESS_LABELS,
  PUBLISHER_TIER_LABELS,
  type ListingPublisher,
} from "@/features/marketing/types";
import { toast } from "@/lib/toast";

const VERDICT_CLASS: Record<EndowmentVerdict, string> = {
  strong: "bg-emerald-500/15 text-emerald-700 dark:text-emerald-400",
  moderate: "bg-amber-500/15 text-amber-700 dark:text-amber-400",
  weak: "bg-muted text-muted-foreground",
};

/** Per-row outcome, so a queued/tracked row states what happened, not just "done". */
type RowState =
  | { kind: "idle" }
  | { kind: "working" }
  | { kind: "added"; label: string; href?: string }
  | { kind: "failed"; message: string };

/**
 * The platform columns. Every value here is on the row, so the definition is a
 * module constant — the registry ACTION is a `rowActions` cell, because it is a
 * write, not data to sort by.
 */
const platformColumns: MatrxColumnDef<RegistryMatch>[] = [
  {
    id: "platform",
    accessorFn: (match) => match.platform.name,
    header: "Platform",
    filter: "text",
    cell: (match) => (
      <div className="min-w-0">
        <a
          href={`https://${match.platform.domain}`}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
        >
          {match.platform.name}
          <ArrowUpRight className="size-3" aria-hidden />
        </a>
        <div className="text-xs text-muted-foreground">
          {match.platform.domain}
        </div>
        {match.platform.notes ? (
          <div className="mt-0.5 max-w-md text-xs text-muted-foreground">
            {match.platform.notes}
          </div>
        ) : null}
      </div>
    ),
  },
  {
    id: "endowment",
    accessorFn: (match) => ENDOWMENT_LABELS[match.platform.endowment],
    header: "Endowment",
    filter: "select",
    width: 170,
    cell: (match) => (
      <span className="text-xs text-muted-foreground">
        {ENDOWMENT_LABELS[match.platform.endowment]}
      </span>
    ),
  },
  {
    id: "tier",
    accessorFn: (match) => PUBLISHER_TIER_LABELS[match.platform.tier],
    header: "Tier",
    filter: "select",
    width: 150,
    cell: (match) => (
      <span className="text-xs text-muted-foreground">
        {PUBLISHER_TIER_LABELS[match.platform.tier]}
      </span>
    ),
  },
  {
    id: "access",
    accessorFn: (match) =>
      PUBLISHER_API_ACCESS_LABELS[match.platform.api_access_guess] ??
      match.platform.api_access_guess,
    header: "Access",
    filter: "select",
    width: 150,
    cell: (match) => (
      <span className="text-xs text-muted-foreground">
        {PUBLISHER_API_ACCESS_LABELS[match.platform.api_access_guess] ??
          match.platform.api_access_guess}
      </span>
    ),
  },
  {
    id: "categories",
    accessorFn: (match) => match.platform.categories.join(", "),
    header: "Categories",
    filter: "text",
    cell: (match) => (
      <span className="text-xs text-muted-foreground">
        {match.platform.categories.join(", ") || "—"}
      </span>
    ),
  },
  {
    id: "registry",
    /* Sortable and filterable on purpose: "show me everything not yet
       tracked" is the whole job this panel exists for. */
    accessorFn: (match) => (match.existing ? "Already tracked" : "Not tracked"),
    header: "Registry",
    filter: "select",
    width: 140,
    cell: (match) => (
      <span className="text-xs text-muted-foreground">
        {match.existing ? "Already tracked" : "Not tracked"}
      </span>
    ),
  },
];

export function EndowmentPortfolioPanel({
  portfolio,
  brandId,
  brandLabel,
  surfaceUrl,
  organizationId,
  canWriteRegistry,
}: {
  portfolio: EndowmentPortfolio;
  brandId: string;
  brandLabel: string;
  /** Deep link back to this surface — carried onto every task created here. */
  surfaceUrl: string;
  /** The brand's org — the artifact tasks belong to it, not the ambient org. */
  organizationId: string;
  /**
   * The publisher registry is the SYSTEM org's shared registry and its RLS
   * makes it super-admin writable. Non-admins still see every verdict and can
   * still queue artifacts — only the registry write is withheld, with a reason.
   */
  canWriteRegistry: boolean;
}) {
  const addPublisher = useAddDiscoveredPublisher();
  const [platformState, setPlatformState] = useState<Record<string, RowState>>({});
  const [artifactState, setArtifactState] = useState<Record<string, RowState>>({});

  // The cached registry LABELS rows ("already tracked"); it never DECIDES.
  // `addDiscoveredPublisher` re-runs the dedup against a complete read at write
  // time, so a stale or short cache costs a click, never a duplicate row.
  // access-errors: ok — labeling cache only; a failed read costs a duplicate-looking row label, and addDiscoveredPublisher re-dedupes at write time
  const publishersQuery = useListingPublishers();
  const [addedRows, setAddedRows] = useState<ListingPublisher[]>([]);
  const matches = matchPlatformsToRegistry(portfolio.platforms, [
    ...(publishersQuery.data ?? []),
    ...addedRows,
  ]);

  const handleAddPlatform = async (platform: PortfolioPlatform) => {
    setPlatformState((prev) => ({ ...prev, [platform.domain]: { kind: "working" } }));
    try {
      const result = await addPublisher.mutateAsync(
        toDiscoveredPublisher(platform, brandId),
      );
      setAddedRows((prev) => [...prev, result.publisher]);
      setPlatformState((prev) => ({
        ...prev,
        [platform.domain]: {
          kind: "added",
          label: result.created
            ? "Added to registry"
            : `Already tracked as ${result.publisher.slug}`,
        },
      }));
      toast.success(
        result.created
          ? `${platform.name} added to the publisher registry.`
          : `${platform.name} was already tracked as ${result.publisher.slug}.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The registry write failed.";
      setPlatformState((prev) => ({
        ...prev,
        [platform.domain]: { kind: "failed", message },
      }));
      toast.error(message);
    }
  };

  const handleQueueArtifact = async (artifact: PortfolioArtifact) => {
    const input = toArtifactTask(artifact, { brandId, brandLabel, surfaceUrl });
    setArtifactState((prev) => ({ ...prev, [input.dedupeKey]: { kind: "working" } }));
    try {
      const result = await upsertSystemTask({
        dedupeKey: input.dedupeKey,
        title: input.title,
        description: input.description,
        origin: "agent",
        sourceType: input.sourceType,
        sourceId: input.sourceId,
        sourceUrl: input.sourceUrl,
        sourceLabel: input.sourceLabel,
        priority: input.priority,
        organizationId,
        metadata: input.metadata,
      });
      if (!result?.id) {
        throw new Error(
          "The task exists but isn't visible to you — check the brand's organization.",
        );
      }
      setArtifactState((prev) => ({
        ...prev,
        [input.dedupeKey]: {
          kind: "added",
          label: result.created ? "Queued" : "Already queued",
          href: `/tasks/${result.id}`,
        },
      }));
      toast.success(
        result.created
          ? `"${artifact.title}" is on the task list.`
          : `"${artifact.title}" was already queued.`,
      );
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "The task could not be created.";
      setArtifactState((prev) => ({
        ...prev,
        [input.dedupeKey]: { kind: "failed", message },
      }));
      toast.error(message);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {portfolio.business_read ? (
        <p className="text-sm text-foreground">{portfolio.business_read}</p>
      ) : null}

      {portfolio.endowments.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {portfolio.endowments.map((entry) => (
            <Badge
              key={entry.endowment}
              variant="secondary"
              className={`gap-1.5 font-normal ${VERDICT_CLASS[entry.verdict]}`}
              title={entry.rationale || ENDOWMENT_QUESTIONS[entry.endowment]}
            >
              <span className="font-medium">{ENDOWMENT_LABELS[entry.endowment]}</span>
              <span className="opacity-80">{entry.verdict}</span>
            </Badge>
          ))}
        </div>
      ) : null}

      {portfolio.platforms.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <div className="flex items-baseline justify-between">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              Publishing platforms ({portfolio.platforms.length})
            </h4>
            {!canWriteRegistry ? (
              <span className="text-[11px] text-muted-foreground">
                The shared registry is super-admin writable
              </span>
            ) : null}
          </div>
          {/* P26 — ONE table. The portfolio picks which columns show; the
              canonical table decides that every one of them sorts and filters,
              which is what makes a 40-platform verdict list usable. */}
          <MatrxDataTable<RegistryMatch>
            data={matches}
            columns={platformColumns}
            getRowId={(match) => match.platform.domain}
            isLoading={publishersQuery.isPending}
            pageSize={25}
            zebra
            rowActions={(match) => (
              <PlatformAction
                state={platformState[match.platform.domain] ?? { kind: "idle" }}
                existingSlug={match.existing?.slug ?? null}
                matchedBy={match.matchedBy}
                disabled={!canWriteRegistry}
                onAdd={() => void handleAddPlatform(match.platform)}
              />
            )}
            copy={{
              label: "Publishing platform",
              listLabel: "Publishing platforms",
              location: surfaceUrl,
              rowKind: "endowment_portfolio_platform",
              listKind: "endowment_portfolio_platform_list",
              humanRow: (match) =>
                `${match.platform.name} (${match.platform.domain}) — ${ENDOWMENT_LABELS[match.platform.endowment]}, ${PUBLISHER_TIER_LABELS[match.platform.tier]}${match.existing ? ", already in the registry" : ""}`,
            }}
          />
        </section>
      ) : null}

      {portfolio.artifacts.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            Ranked artifact portfolio ({portfolio.artifacts.length})
          </h4>
          <ul className="flex flex-col gap-1.5">
            {portfolio.artifacts.map((artifact, index) => {
              const key = toArtifactTask(artifact, {
                brandId,
                brandLabel,
                surfaceUrl,
              }).dedupeKey;
              const state = artifactState[key] ?? { kind: "idle" };
              return (
                <li
                  key={key}
                  className="flex items-start gap-2 rounded-md border border-border px-2 py-1.5"
                >
                  <span className="mt-0.5 w-5 shrink-0 text-xs tabular-nums text-muted-foreground">
                    {index + 1}
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-foreground">
                      {artifact.title}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {artifact.description}
                    </div>
                    <div className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[11px] text-muted-foreground">
                      <span>{ENDOWMENT_LABELS[artifact.endowment]}</span>
                      <span aria-hidden>·</span>
                      <span>
                        {artifact.effort_hours}h
                      </span>
                      <span aria-hidden>·</span>
                      <span>{REFERENCE_CLASS_LABELS[artifact.reference_class]}</span>
                      {artifact.target_platforms.length > 0 ? (
                        <>
                          <span aria-hidden>·</span>
                          <span>{artifact.target_platforms.join(", ")}</span>
                        </>
                      ) : null}
                    </div>
                  </div>
                  <ArtifactAction
                    state={state}
                    onQueue={() => void handleQueueArtifact(artifact)}
                  />
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}

      {portfolio.tier3_concepts.length > 0 ? (
        <section className="flex flex-col gap-1.5">
          <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            <Trophy className="size-3.5" aria-hidden />
            Tier 3 — the registry they could operate
          </h4>
          <ul className="flex flex-col gap-1">
            {portfolio.tier3_concepts.map((concept) => (
              <li
                key={concept.name}
                className="rounded-md border border-border px-2 py-1.5 text-sm"
              >
                <span className="font-medium text-foreground">{concept.name}</span>
                <span className="ml-1.5 text-xs text-muted-foreground">
                  {TIER3_ARCHETYPE_LABELS[concept.archetype]}
                </span>
                <div className="text-xs text-muted-foreground">
                  Judged on {concept.criteria_axis}. Links from {concept.who_would_link}.
                </div>
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {portfolio.what_not_to_do.length > 0 ? (
        <>
          <Separator />
          <section className="flex flex-col gap-1">
            <h4 className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              <CircleAlert className="size-3.5" aria-hidden />
              What not to do
            </h4>
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {portfolio.what_not_to_do.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </section>
        </>
      ) : null}
    </div>
  );
}

function PlatformAction({
  state,
  existingSlug,
  matchedBy,
  disabled,
  onAdd,
}: {
  state: RowState;
  existingSlug: string | null;
  matchedBy: "domain" | "slug" | null;
  disabled: boolean;
  onAdd: () => void;
}) {
  if (state.kind === "added") {
    return (
      <span className="inline-flex items-center gap-1 text-xs text-emerald-600 dark:text-emerald-400">
        <Check className="size-3.5" aria-hidden />
        {state.label}
      </span>
    );
  }
  if (existingSlug) {
    return (
      <span
        className="text-xs text-muted-foreground"
        title={`Matched an existing registry row by ${matchedBy}`}
      >
        Already tracked
      </span>
    );
  }
  return (
    <div className="flex flex-col items-end gap-0.5">
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-2 text-xs"
        onClick={onAdd}
        disabled={disabled || state.kind === "working"}
        title={
          disabled
            ? "The shared publisher registry is writable by super admins only"
            : undefined
        }
      >
        <Plus className="size-3" aria-hidden />
        {state.kind === "working" ? "Adding…" : "Add to registry"}
      </Button>
      {state.kind === "failed" ? (
        <span className="max-w-[16rem] text-right text-[11px] text-destructive">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}

function ArtifactAction({ state, onQueue }: { state: RowState; onQueue: () => void }) {
  if (state.kind === "added") {
    return (
      <Link
        href={state.href ?? "/tasks"}
        className="inline-flex shrink-0 items-center gap-1 text-xs text-emerald-600 hover:underline dark:text-emerald-400"
      >
        <Check className="size-3.5" aria-hidden />
        {state.label}
      </Link>
    );
  }
  return (
    <div className="flex shrink-0 flex-col items-end gap-0.5">
      <Button
        size="sm"
        variant="outline"
        className="h-6 gap-1 px-2 text-xs"
        onClick={onQueue}
        disabled={state.kind === "working"}
      >
        <ListPlus className="size-3" aria-hidden />
        {state.kind === "working" ? "Queueing…" : "Queue as task"}
      </Button>
      {state.kind === "failed" ? (
        <span className="max-w-[16rem] text-right text-[11px] text-destructive">
          {state.message}
        </span>
      ) : null}
    </div>
  );
}
