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
          <div className="overflow-x-auto rounded-md border border-border">
            <table className="w-full min-w-[52rem] text-sm">
              <thead className="bg-muted/50 text-xs text-muted-foreground">
                <tr>
                  <th className="px-2 py-1.5 text-left font-medium">Platform</th>
                  <th className="px-2 py-1.5 text-left font-medium">Endowment</th>
                  <th className="px-2 py-1.5 text-left font-medium">Tier</th>
                  <th className="px-2 py-1.5 text-left font-medium">Access</th>
                  <th className="px-2 py-1.5 text-left font-medium">Categories</th>
                  <th className="px-2 py-1.5 text-right font-medium">Registry</th>
                </tr>
              </thead>
              <tbody>
                {matches.map(({ platform, existing, matchedBy }) => {
                  const state = platformState[platform.domain] ?? { kind: "idle" };
                  return (
                    <tr key={platform.domain} className="border-t border-border align-top">
                      <td className="px-2 py-1.5">
                        <a
                          href={`https://${platform.domain}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 font-medium text-foreground hover:text-primary"
                        >
                          {platform.name}
                          <ArrowUpRight className="size-3" aria-hidden />
                        </a>
                        <div className="text-xs text-muted-foreground">{platform.domain}</div>
                        {platform.notes ? (
                          <div className="mt-0.5 max-w-md text-xs text-muted-foreground">
                            {platform.notes}
                          </div>
                        ) : null}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {ENDOWMENT_LABELS[platform.endowment]}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {PUBLISHER_TIER_LABELS[platform.tier]}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {PUBLISHER_API_ACCESS_LABELS[platform.api_access_guess] ??
                          platform.api_access_guess}
                      </td>
                      <td className="px-2 py-1.5 text-xs text-muted-foreground">
                        {platform.categories.join(", ") || "—"}
                      </td>
                      <td className="px-2 py-1.5 text-right">
                        <PlatformAction
                          state={state}
                          existingSlug={existing?.slug ?? null}
                          matchedBy={matchedBy}
                          disabled={!canWriteRegistry}
                          onAdd={() => void handleAddPlatform(platform)}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
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
