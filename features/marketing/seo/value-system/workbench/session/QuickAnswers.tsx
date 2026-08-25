"use client";

/**
 * QUICK ANSWERS — one question, five keywords.
 *
 * WHY THIS EXISTS. The value screen used to open on a LEVEL dropdown: the one
 * answer the system computes for you, presented as the one thing to type in.
 * Arman, 2026-08-25: *"it immediately tries to force you to select the level.
 * Isn't that the exact opposite of what we just worked our asses off doing?"*
 * The columns fix put the questions on the row. This is the fast lane for
 * answering them — and it is a WINDOW, not a takeover, so the table stays live
 * behind it and you can see the levels move as you teach.
 *
 * THE POSTURE. One question at the top. Five keywords under it, deduped so they
 * are not five phrasings of the same search, and drawn from BOTH ends of demand
 * — some that earn clicks today, some that only have impressions. Answer them
 * one at a time, or answer all five at once when the answer really is the same.
 *
 * IT OWNS NO WRITE PATH. Answers go through `setKeywordStamps` — the same
 * function the ruling session, the right-click menu and the bulk bar call. The
 * reason box rides along on every write, because that sentence is what an AI
 * later learns the pattern from (P24).
 */

import { useEffect, useMemo, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BrainCircuit,
  CheckCircle2,
  Loader2,
  MousePointerClick,
  Eye,
  SkipForward,
} from "lucide-react";

import { cn } from "@/styles/themes/utils";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { CreatablePicker } from "@/components/ui/creatable-picker";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import { setKeywordStamps } from "@/features/marketing/seo/keyword-workbench/data";
import { getBatchQuestion, type BatchKeyword } from "./batch";

export function QuickAnswers({
  siteId,
  siteLabel,
  dimensionSlug,
  onDimensionChange,
  onAnswered,
  className,
}: {
  siteId: string;
  siteLabel?: string | null;
  /** Null lets the server choose the question worth asking next. */
  dimensionSlug: string | null;
  onDimensionChange: (slug: string | null) => void;
  /** Fires after every landed write so a host can refresh what it shows. */
  onAnswered?: () => void;
  className?: string;
}) {
  const [seen, setSeen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [answered, setAnswered] = useState(0);
  const [done, setDone] = useState<Record<string, string>>({});

  const catalog = useQuery({
    queryKey: ["marketing", "seo", "dimension-catalog", siteId],
    queryFn: () => getFacetDimensionCatalog(siteId),
    enabled: !!siteId,
    staleTime: 5 * 60 * 1000,
  });
  const dimensions = catalog.data ?? [];

  const batch = useQuery({
    queryKey: ["seo", "batch-question", siteId, dimensionSlug, seen.length],
    queryFn: ({ signal }) =>
      getBatchQuestion(siteId, {
        dimension: dimensionSlug,
        size: 5,
        exclude: seen,
        signal,
      }),
    enabled: !!siteId,
    placeholderData: keepPreviousData,
  });

  // The server may pick the question; reflect its choice back to the host so
  // the picker never shows "choose one" while five keywords sit under a name.
  const activeSlug = batch.data?.dimensionSlug ?? dimensionSlug;
  const activeDimension = useMemo(
    () => dimensions.find((d) => d.slug === activeSlug) ?? null,
    [dimensions, activeSlug],
  );
  const values = activeDimension?.values ?? [];

  // A new question is a clean slate — the keywords behind it are different.
  useEffect(() => {
    setDone({});
  }, [activeSlug]);

  const stamp = useMutation({
    mutationFn: async (input: {
      keywordIds: string[];
      valueId: string;
      valueLabel: string;
    }) => {
      await setKeywordStamps({
        siteId,
        keywordIds: input.keywordIds,
        valueId: input.valueId,
        notes: reason.trim() || null,
      });
      return input;
    },
    onSuccess: (input) => {
      setDone((prior) => {
        const next = { ...prior };
        for (const id of input.keywordIds) next[id] = input.valueLabel;
        return next;
      });
      setAnswered((n) => n + input.keywordIds.length);
      toast.success(
        input.keywordIds.length === 1
          ? `Answered — ${input.valueLabel}`
          : `${input.keywordIds.length} keywords answered — ${input.valueLabel}`,
      );
      onAnswered?.();
    },
    onError: (error) =>
      toast.error(extractErrorMessage(error) || "That answer did not save"),
  });

  const keywords = batch.data?.keywords ?? [];
  const outstanding = keywords.filter((k) => !done[k.keywordId]);
  const allDone = keywords.length > 0 && outstanding.length === 0;

  const nextBatch = () => {
    setSeen((prior) => [...prior, ...keywords.map((k) => k.keywordId)]);
    setDone({});
  };

  if (catalog.isError || batch.isError) {
    return (
      <InlineQueryError
        what="the next questions"
        error={catalog.error ?? batch.error}
        onRetry={() => {
          void catalog.refetch();
          void batch.refetch();
        }}
      />
    );
  }

  return (
    <div className={cn("flex h-full min-h-0 flex-col", className)}>
      {/* ── the question ── */}
      <div className="shrink-0 border-b border-border px-3 py-2">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="min-w-0">
            <p className="flex items-center gap-1.5 text-sm font-medium text-foreground">
              <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
              {activeDimension?.label ?? "Pick a question"}
            </p>
            <p className="mt-0.5 truncate text-[11px] text-muted-foreground">
              {batch.data?.why ? `Asked because it ${batch.data.why}. ` : ""}
              {batch.data?.remaining
                ? `${formatCount(batch.data.remaining)} keywords still have no answer.`
                : null}
            </p>
          </div>
          <CreatablePicker
            value={activeDimension?.dimension_id ?? null}
            options={dimensions.map((dimension) => ({
              value: dimension.dimension_id,
              label: dimension.label,
              hint: dimension.scope === "site" ? "yours" : undefined,
            }))}
            onSelect={(dimensionId) => {
              const next = dimensions.find(
                (dimension) => dimension.dimension_id === dimensionId,
              );
              onDimensionChange(next?.slug ?? null);
            }}
            placeholder="Question"
            searchPlaceholder="Ask a different question…"
            noun="dimension"
            loading={catalog.isLoading}
            ariaLabel="Which question these keywords are being asked"
            className="w-44"
          />
        </div>
        {activeDimension?.description ? (
          <p className="mt-1 text-[11px] text-muted-foreground">
            {activeDimension.description}
          </p>
        ) : null}
      </div>

      {/* ── the five ── */}
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 scrollbar-thin">
        {batch.isLoading ? (
          <CardLoading />
        ) : keywords.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
            <CheckCircle2 className="h-5 w-5 text-success" />
            <p className="text-sm font-medium text-foreground">
              Nothing left to ask here
            </p>
            <p className="max-w-xs text-xs text-muted-foreground">
              Every keyword with demand on {siteLabel ?? "this site"} has an
              answer for this one. Pick a different question above.
            </p>
          </div>
        ) : (
          keywords.map((row) => (
            <KeywordRow
              key={row.keywordId}
              row={row}
              answeredAs={done[row.keywordId] ?? null}
              values={values}
              busy={stamp.isPending}
              onAnswer={(valueId, valueLabel) =>
                stamp.mutate({
                  keywordIds: [row.keywordId],
                  valueId,
                  valueLabel,
                })
              }
            />
          ))
        )}

        {/* Same answer for everything still open — the reason this is a batch. */}
        {outstanding.length > 1 && values.length > 0 ? (
          <div className="rounded-lg border border-dashed border-border p-2">
            <p className="text-[11px] font-medium text-muted-foreground">
              Same answer for the {outstanding.length} still open
            </p>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {values.map((value) => (
                <button
                  key={value.value_id}
                  type="button"
                  disabled={stamp.isPending}
                  title={value.description ?? undefined}
                  onClick={() =>
                    stamp.mutate({
                      keywordIds: outstanding.map((k) => k.keywordId),
                      valueId: value.value_id,
                      valueLabel: value.label,
                    })
                  }
                  className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                >
                  {value.label}
                </button>
              ))}
            </div>
          </div>
        ) : null}
      </div>

      {/* ── the reason, and the way on ── */}
      <div className="shrink-0 space-y-2 border-t border-border px-3 py-2">
        <Textarea
          value={reason}
          onChange={(event) => setReason(event.target.value)}
          placeholder="Why? — one sentence. It rides along on every answer here, and it is what the AI learns your judgement from."
          rows={2}
          className="min-h-0 resize-none text-xs"
          aria-label="Your reason"
        />
        <div className="flex items-center justify-between gap-2">
          <p className="text-[11px] text-muted-foreground">
            {answered > 0
              ? `${answered} answered this session`
              : "Nothing answered yet"}
          </p>
          <Button
            size="sm"
            variant={allDone ? "default" : "outline"}
            className="h-7 gap-1.5 text-xs"
            disabled={batch.isFetching || keywords.length === 0}
            onClick={nextBatch}
          >
            {batch.isFetching ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : allDone ? (
              <ArrowRight className="h-3.5 w-3.5" />
            ) : (
              <SkipForward className="h-3.5 w-3.5" />
            )}
            {allDone ? "Next five" : "Skip these"}
          </Button>
        </div>
      </div>
    </div>
  );
}

function KeywordRow({
  row,
  answeredAs,
  values,
  busy,
  onAnswer,
}: {
  row: BatchKeyword;
  answeredAs: string | null;
  values: { value_id: string; label: string; description: string | null }[];
  busy: boolean;
  onAnswer: (valueId: string, valueLabel: string) => void;
}) {
  const DemandIcon = row.pickedFor === "clicks" ? MousePointerClick : Eye;
  return (
    <div
      className={cn(
        "rounded-lg border p-2 transition-colors",
        answeredAs
          ? "border-success/40 bg-success/5"
          : "border-border bg-background",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs font-medium text-foreground">
          {row.keyword}
        </p>
        <span
          className="inline-flex shrink-0 items-center gap-1 text-[10px] tabular-nums text-muted-foreground"
          title={
            row.pickedFor === "clicks"
              ? "Picked because it earns clicks today"
              : "Picked because it is seen a lot but earns nothing yet"
          }
        >
          <DemandIcon className="h-3 w-3" />
          {row.pickedFor === "clicks"
            ? `${formatCount(row.clicks)} clicks`
            : `${formatCount(row.impressions)} impr.`}
        </span>
      </div>
      {answeredAs ? (
        <p className="mt-1 inline-flex items-center gap-1 text-[11px] text-success">
          <CheckCircle2 className="h-3 w-3" />
          {answeredAs}
        </p>
      ) : (
        <div className="mt-1.5 flex flex-wrap gap-1.5">
          {values.length === 0 ? (
            <p className="text-[11px] text-muted-foreground">
              This question has no choices yet.
            </p>
          ) : (
            values.map((value) => (
              <button
                key={value.value_id}
                type="button"
                disabled={busy}
                title={value.description ?? undefined}
                onClick={() => onAnswer(value.value_id, value.label)}
                className="rounded-md border border-border bg-background px-2 py-1 text-[11px] text-foreground transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
              >
                {value.label}
              </button>
            ))
          )}
        </div>
      )}
    </div>
  );
}
