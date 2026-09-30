"use client";

/**
 * "Review what goes in" — THE canonical body.
 *
 * The friendly, general version of the research context builder
 * (`features/research/components/resources/ContextBuilder.tsx`, the champion):
 * MANIFEST (sizes, never bodies, from `POST /sources/manifest`) → the
 * person's choices → ONE planner (`plan.ts`) that feeds both this screen and
 * the returned `SourceSet`, so the screen never shows a number the result
 * does not carry. The window (`SourceReviewWindow`) and any page render THIS
 * component — never a copy.
 */

import { useEffect, useRef, useState } from "react";
import { Plus, RefreshCw } from "lucide-react";
import { createSourceRef, type SourceManifest, type SourceRef, type SourceSet } from "@ai-matrx/agents/sources";
import { Button, ErrorBox, Skeleton, cn } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectModelLabelById } from "@/features/ai-models/redux/modelRegistrySlice";
import { useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
import { estimateTokens, formatChars, formatTokens, pagesPhrase } from "@/lib/tokens/estimate";
import {
  deliveryPatch,
  deliverySwitchedNote,
  fitDelivery,
  planSourceReview,
  sourceKey,
  type SourcePlan,
} from "@ai-matrx/agents/sources/runtime";
import { sourcesClient } from "../sourceSetApi";
import { reviewDefaultContextTokens } from "./knobs";
import { SourceReviewRow } from "./SourceReviewRow";
import type { SourceReviewOptions } from "./types";

export interface SourceReviewProps {
  sourceSet: SourceSet;
  options?: SourceReviewOptions;
  onApply: (sourceSet: SourceSet) => void;
  onAddMore?: (sourceSet: SourceSet) => void;
  onCancel: () => void;
  /** Called on every change with the live plan (the dev harness proves numbers with it). */
  onPlanChange?: (plan: SourcePlan) => void;
}

/**
 * The manifest request: identity + chosen VERSION only (the version changes the
 * parts). Parts, limits and delivery are planned locally, so changing them never
 * re-measures.
 */
function manifestRequest(refs: SourceRef[], base: SourceSet, targetModelId?: string): SourceSet {
  return {
    ...base,
    sources: refs.map((r) => {
      const { include_segments: _parts, max_chars: _cap, delivery: _delivery, ...rest } = r;
      return rest;
    }),
    ...(targetModelId ? { target_model_id: targetModelId } : {}),
  };
}

export function SourceReview({
  sourceSet,
  options = {},
  onApply,
  onAddMore,
  onCancel,
  onPlanChange,
}: SourceReviewProps) {
  const targetModelId = options.targetModelId ?? sourceSet.target_model_id;
  // A Source handed in set to a delivery this host cannot use is switched
  // back here, once, and the screen says so (never a choice that cannot work).
  const [initial] = useState(() => {
    const switched: string[] = [];
    const fitted = sourceSet.sources.map((r) => {
      const fit = fitDelivery(r, options.deliveries);
      if (!fit) return r;
      switched.push(deliverySwitchedNote(fit.to));
      return createSourceRef(r.resource_type, r.resource_id, { ...r, ...fit.patch });
    });
    return { fitted, switchedNote: switched[0] ?? null, switchedCount: switched.length };
  });
  const [refs, setRefs] = useState<SourceRef[]>(() => initial.fitted);
  const [removed, setRemoved] = useState<Set<number>>(() => new Set());
  const [manifest, setManifest] = useState<SourceManifest | null>(null);
  const [error, setError] = useState<unknown>(null);
  const [loading, setLoading] = useState(true);
  const [fallbackWindow, setFallbackWindow] = useState<number | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  useClippedContentGuard(listRef, { label: "Review what goes in — Source list" });
  const modelLabel = useAppSelector((s) => selectModelLabelById(s, targetModelId));

  // The manifest is re-read only when a version (form) changes or on retry —
  // parts, caps and delivery are planned locally with the server's own rules.
  const manifestBody = JSON.stringify(manifestRequest(refs, sourceSet, targetModelId));

  useEffect(() => {
    const controller = new AbortController();
    setLoading(true);
    setError(null);
    sourcesClient
      .manifest(JSON.parse(manifestBody) as SourceSet, { signal: controller.signal })
      .then((m) => {
        if (!controller.signal.aborted) setManifest(m);
      })
      .catch((err: unknown) => {
        if (!controller.signal.aborted) setError(err);
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false);
      });
    return () => controller.abort();
  }, [manifestBody, reloadKey]);

  useEffect(() => {
    let live = true;
    reviewDefaultContextTokens()
      .then((n) => live && setFallbackWindow(n))
      .catch((err: unknown) => live && setError(err));
    return () => {
      live = false;
    };
  }, []);

  const keptIndexes = refs.map((_, i) => i).filter((i) => !removed.has(i));
  const plan =
    manifest && fallbackWindow !== null && manifest.sources.length === refs.length
      ? planSourceReview({
          manifest: { ...manifest, sources: keptIndexes.map((i) => manifest.sources[i]!) },
          refs: keptIndexes.map((i) => refs[i]!),
          base: sourceSet,
          modelWindowTokens: manifest.model_context_tokens,
          fallbackWindowTokens: fallbackWindow,
          targetModelId,
          // The web app's ONE estimator — the review and the run never disagree.
          estimateTokens,
        })
      : null;

  const reported = useRef<string | null>(null);
  const planKey = plan ? JSON.stringify([plan.sourceSet, plan.sentChars, plan.verdict]) : null;
  useEffect(() => {
    if (!plan || !planKey || reported.current === planKey) return;
    reported.current = planKey;
    onPlanChange?.(plan);
  }, [plan, planKey, onPlanChange]);

  const setRef = (index: number, next: SourceRef) =>
    setRefs((prev) => prev.map((r, i) => (i === index ? next : r)));

  const lookUpLeftOut = () => {
    if (!plan) return;
    const leftOut = new Set(plan.leftOut.map((e) => keptIndexes[e.index]!));
    setRefs((prev) =>
      prev.map((r, i) =>
        leftOut.has(i) ? createSourceRef(r.resource_type, r.resource_id, { ...r, ...deliveryPatch("context") }) : r,
      ),
    );
  };

  const canLookUp = !options.deliveries || options.deliveries.includes("context");

  return (
    <div className="matrx-touch-targets flex h-full min-h-0 flex-col">
      <div className="shrink-0 space-y-3 border-b border-border px-4 pb-3 pt-1">
        {initial.switchedNote ? (
          <p className="text-xs text-amber-700 dark:text-amber-400" role="status">
            {initial.switchedCount > 1
              ? `${initial.switchedCount} Sources were switched back: ${initial.switchedNote}`
              : initial.switchedNote}
          </p>
        ) : null}
        {plan ? (
          <BudgetSummary
            plan={plan}
            modelLabel={modelLabel ?? targetModelId ?? null}
            onLookUpLeftOut={canLookUp ? lookUpLeftOut : null}
          />
        ) : (
          !error && <Skeleton className="h-16 w-full" />
        )}
      </div>

      <div ref={listRef} className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        {error ? (
          <ErrorBox
            as="div"
            message="Your Sources could not be measured."
            error={error}
            operation="Measure Sources for review"
          >
            <div className="space-y-2">
              <p className="text-sm">
                Your Sources could not be measured, so nothing here can be trusted yet.
                {error instanceof Error && error.message ? ` ${error.message}` : ""}
              </p>
              <Button type="button" size="sm" variant="outline" onClick={() => setReloadKey((k) => k + 1)}>
                <RefreshCw className="mr-1.5 h-4 w-4" />
                Try again
              </Button>
            </div>
          </ErrorBox>
        ) : !plan ? (
          <div className="space-y-2">
            {refs.map((r) => (
              <Skeleton key={`${r.resource_type}:${r.resource_id}`} className="h-14 w-full" />
            ))}
          </div>
        ) : plan.entries.length === 0 ? (
          <p className="py-8 text-center text-sm text-muted-foreground">No Sources left in this request.</p>
        ) : (
          <ul className={cn("space-y-2", loading && "opacity-60")}>
            {plan.entries.map((entry) => {
              const index = keptIndexes[entry.index]!;
              return (
                <SourceReviewRow
                  key={`${entry.ref.resource_type}:${entry.ref.resource_id}:${index}`}
                  plan={entry}
                  defaultOpen={plan.entries.length === 1}
                  deliveries={options.deliveries}
                  describe={options.describe?.[sourceKey(entry.ref)]}
                  onChange={(next) => setRef(index, next)}
                  onFormChange={(representation) =>
                    setRef(index, {
                      ...refs[index]!,
                      representation,
                      include_segments: undefined,
                    })
                  }
                  onRemove={() => setRemoved((prev) => new Set(prev).add(index))}
                />
              );
            })}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3 pb-safe">
        {onAddMore && options.addMoreLabel && (
          <Button
            type="button"
            variant="outline"
            className="mr-auto min-w-0"
            disabled={!plan}
            onClick={() => plan && onAddMore(plan.sourceSet)}
          >
            <Plus className="mr-1.5 h-4 w-4 shrink-0" />
            <span className="truncate">{options.addMoreLabel}</span>
          </Button>
        )}
        <Button type="button" variant="ghost" onClick={onCancel}>
          Cancel
        </Button>
        <Button type="button" disabled={!plan || loading} onClick={() => plan && onApply(plan.sourceSet)}>
          Use these
        </Button>
      </div>
    </div>
  );
}

const VERDICT = {
  empty: { label: "Nothing goes in", dot: "bg-muted-foreground", text: "text-muted-foreground" },
  fine: { label: "Fine", dot: "bg-emerald-500", text: "text-emerald-700 dark:text-emerald-400" },
  heavy: { label: "Getting heavy", dot: "bg-amber-500", text: "text-amber-700 dark:text-amber-400" },
  too_much: { label: "Too much", dot: "bg-red-500", text: "text-red-700 dark:text-red-400" },
} as const;

function BudgetSummary({
  plan,
  modelLabel,
  onLookUpLeftOut,
}: {
  plan: SourcePlan;
  modelLabel: string | null;
  /** Null when the host cannot use "look it up" — the button is not offered. */
  onLookUpLeftOut: (() => void) | null;
}) {
  const v = VERDICT[plan.verdict];
  const pct = Math.round(plan.share * 100);
  const onDemand = plan.entries.filter((e) => e.status === "on_demand").length;
  // One line, value only (R9): the verdict and how full the AI's reading room is.
  // Sizes a person understands (characters, pages); tokens only in the tooltip.
  const size = `${pct}% full${plan.windowIsFallback ? "" : modelLabel ? ` · ${modelLabel}` : ""}`;
  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1">
        <span className="flex items-center gap-1.5">
          <span aria-hidden className={cn("h-2.5 w-2.5 rounded-full", v.dot)} />
          <span className={cn("text-sm font-semibold", v.text)}>{v.label}</span>
        </span>
        {plan.verdict === "empty" ? null : (
          <span
            className="text-sm text-foreground"
            title={`${formatTokens(plan.sentTokens)} of ${formatTokens(plan.windowTokens)} tokens`}
          >
            {size}
          </span>
        )}
      </div>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-muted" aria-hidden>
        <div
          className={cn("h-full rounded-full transition-all", v.dot)}
          style={{ width: `${Math.min(100, Math.max(plan.share > 0 ? 2 : 0, pct))}%` }}
        />
      </div>

      <p className="truncate text-xs text-muted-foreground">
        {/* THE one size (the same number the cards and the header show); the budget's exact wire length rides data-sent-chars. */}
        <span title={`${plan.chars.toLocaleString()} characters`} data-sent-chars={plan.sentChars}>
          {formatChars(plan.chars)} characters
        </span>
        {` · ${pagesPhrase(plan.chars)}`}
        {onDemand > 0 ? ` · ${onDemand} looked up when needed` : null}
      </p>

      {plan.leftOut.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-red-500/30 bg-red-500/[0.06] px-3 py-2 text-xs text-red-700 dark:text-red-400">
          <span className="min-w-0 flex-1">
            Won&apos;t go in: {plan.leftOut.map((e) => e.entry.label).join(", ")}.
          </span>
          {onLookUpLeftOut ? (
            <Button type="button" size="sm" variant="outline" onClick={onLookUpLeftOut}>
              Let the AI look {plan.leftOut.length === 1 ? "it" : "them"} up instead
            </Button>
          ) : (
            null
          )}
        </div>
      )}
    </div>
  );
}
