"use client";

/**
 * THE RULING SESSION — one keyword on screen, and every question you can answer
 * about it.
 *
 * 🚨 WHAT THIS USED TO BE, AND WHY IT WAS WRONG. Until 2026-08-24 this screen
 * called exactly one function, `setKeywordValue`: it asked "how much is this
 * worth?" and nothing else. That taught the opposite of the system it sits in —
 * a platform whose whole model is *stamps are meaning, worth is optional and
 * per-site* (P17) opened its most focused surface by demanding the one answer
 * that is optional, and refusing the ones that are not.
 *
 * It now assigns ANY dimension (including the traffic class), the service on
 * the topic tree, and a level — through the SAME RPCs every other surface uses:
 *
 *   • a dimension value → `setKeywordStamps`   (`seo.gsc_set_keyword_stamps`)
 *   • a service         → `setKeywordService`  (`seo.gsc_set_keyword_topic`)
 *   • a level           → the workbench's own ruling mutation
 *
 * This component owns NO write path. It owns a posture: one question, one
 * answer, next.
 *
 * THE REASON IS THE PRODUCT (P24). Arman: *"as they are assigning them, they
 * also type some text that explains why they're doing it… the presumption is
 * that artificial intelligence models are very good at being able to then mimic
 * that behavior on future things."* The reason box is shared by every control
 * on the card and rides along on whichever write the person makes — and it is
 * exactly what the trial (`./session/TrialPanel`) feeds the proposer.
 *
 * WHY THESE KEYWORDS. The queue is chosen server-side by real demand AND
 * diversity (`seo.gsc_ruling_session_queue`) — being asked the same question
 * ten times in slightly different words is how a session teaches nothing. Each
 * card says why it was picked.
 *
 * Skipping stays honest and first-class: an expert may genuinely not know yet.
 */

import { useEffect, useRef, useState } from "react";
import { keepPreviousData, useMutation, useQuery } from "@tanstack/react-query";
import {
  BrainCircuit,
  CheckCircle2,
  Gavel,
  Loader2,
  Network,
  SkipForward,
  X,
  ShieldQuestion,
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
import { knobInts } from "@/lib/knobs/featureKnobs";
import type { FacetDimension } from "@/features/marketing/seo/value-system/dimensions/data";
import { setKeywordStamps } from "@/features/marketing/seo/keyword-workbench/data";
import { setKeywordService } from "@/features/marketing/seo/keyword-workbench/data";
import { useSiteServices } from "@/features/marketing/seo/keyword-workbench/hooks/useSiteServices";
import {
  OfferingPicker,
  OFFERING_UNPLACED,
} from "@/features/marketing/seo/keyword-workbench/components/OfferingPicker";
import { AddLevelDialog } from "../pickers/AddLevelDialog";
import { humanizeSlug, type BandMeta, type ValueWindow } from "../lib";
import { getRulingSessionQueue, type SessionQueueRow } from "./session/data";
import { TrialPanel } from "./session/TrialPanel";
import { VerifyPanel } from "./session/VerifyPanel";
import type { SessionRuling } from "./session/trial";
import { trialDimensionSlug } from "./session/trial";

export interface SessionRulingInput {
  keywordIds: string[];
  tier: string;
  notes?: string;
  label: string;
}

/**
 * The dimension the fast lane opens on. Traffic class is the question every
 * site answers first, and it is a dimension like any other (P19) — this is a
 * starting position, not a special case: the switcher offers every dimension.
 */
const DEFAULT_FAST_DIMENSION = "traffic_class";

export function RulingSession({
  siteId,
  siteLabel,
  organizationId,
  window: reviewWindow,
  metas,
  dimensions,
  dimensionsLoading,
  totalUnvalued,
  ruledCount,
  onRule,
  rulingPending,
  onExit,
}: {
  siteId: string;
  /** The site's name/domain — context the proposer needs to read a phrase. */
  siteLabel: string;
  organizationId: string | null;
  window: ValueWindow;
  metas: BandMeta[];
  dimensions: FacetDimension[];
  dimensionsLoading?: boolean;
  /** From the decomposition — the true size of the pile, not just this batch. */
  totalUnvalued: number;
  /**
   * Rulings that ACTUALLY LANDED this session — owned by the workbench's
   * mutation, counted in its `onSuccess`. This component deliberately does not
   * count its own taps: it did, and a ruling that the DB rolled back still
   * moved the counter to "1 ruled", which is the precise class of lie this
   * whole feature exists to refuse.
   */
  ruledCount: number;
  onRule: (input: SessionRulingInput) => void;
  rulingPending: boolean;
  onExit: () => void;
}) {
  const [seen, setSeen] = useState<string[]>([]);
  const [notes, setNotes] = useState("");
  const [fastSlug, setFastSlug] = useState(DEFAULT_FAST_DIMENSION);
  const [addingLevel, setAddingLevel] = useState<string | null>(null);
  const [trialOpen, setTrialOpen] = useState(false);
  const [verifyOpen, setVerifyOpen] = useState(false);
  /** What the person taught this session, in their own words — the training set. */
  const [taught, setTaught] = useState<SessionRuling[]>([]);
  const cardRef = useRef<HTMLDivElement | null>(null);

  const knobs = useQuery({
    queryKey: ["knobs", "seo_ruling_session"],
    queryFn: () =>
      knobInts("seo_ruling_session", [
        "rulings_before_trial",
        "trial_batch_size",
        "queue_size",
      ] as const),
    staleTime: 5 * 60_000,
  });
  const queueSize = knobs.data?.queue_size ?? 10;
  const beforeTrial = knobs.data?.rulings_before_trial ?? 5;
  const trialBatch = knobs.data?.trial_batch_size ?? 20;

  const queue = useQuery({
    queryKey: [
      "marketing",
      "value",
      "ruling-session",
      siteId,
      reviewWindow.start,
      reviewWindow.end,
      queueSize,
      seen.length,
    ],
    queryFn: ({ signal }) =>
      getRulingSessionQueue(
        siteId,
        reviewWindow.start,
        reviewWindow.end,
        queueSize,
        seen,
        signal,
      ),
    enabled: knobs.isSuccess,
    staleTime: 30_000,
    placeholderData: keepPreviousData,
  });

  const services = useSiteServices(
    siteId,
    reviewWindow.start,
    reviewWindow.end,
  );

  const rows: SessionQueueRow[] = queue.data?.rows ?? [];
  const current = rows[0];
  const remaining = Math.max(
    (queue.data?.unruledTotal ?? totalUnvalued) - ruledCount,
    0,
  );

  const fastDimension =
    dimensions.find((dimension) => dimension.slug === fastSlug) ??
    dimensions.find((dimension) => dimension.slug === DEFAULT_FAST_DIMENSION) ??
    dimensions[0] ??
    null;
  const fastValues = (fastDimension?.values ?? []).filter(
    (value) => !value.abstain,
  );

  // Unvalued is where a keyword LANDS, never something a human rules it INTO.
  const levels = metas.filter((meta) => meta.reserved !== "unvalued");

  function advance(keywordId: string) {
    setSeen((previous) =>
      previous.includes(keywordId) ? previous : [...previous, keywordId],
    );
    setNotes("");
  }

  /** A dimension value — the ONE stamp write, with the reason on it (P24). */
  const stamp = useMutation({
    mutationFn: (input: {
      row: SessionQueueRow;
      valueId: string;
      valueKey: string;
      valueLabel: string;
      dimension: FacetDimension;
      reason: string;
    }) =>
      setKeywordStamps({
        siteId,
        keywordIds: [input.row.keywordId],
        valueId: input.valueId,
        notes: input.reason || null,
      }),
    onSuccess: (_result, input) => {
      setTaught((previous) => [
        ...previous,
        {
          keywordId: input.row.keywordId,
          phrase: input.row.keyword,
          dimensionSlug: input.dimension.slug,
          dimensionLabel: input.dimension.label,
          valueId: input.valueId,
          valueSlug: input.valueKey,
          valueLabel: input.valueLabel,
          reason: input.reason,
        },
      ]);
      toast.success(`${input.dimension.label}: ${input.valueLabel}`, {
        description: input.reason
          ? "Your reason is saved with it — that sentence is what teaches the system."
          : undefined,
      });
      advance(input.row.keywordId);
    },
    onError: (error) => {
      toast.error("Could not save that", {
        description: extractErrorMessage(error),
      });
    },
  });

  /** A service placement — the ONE placement write. */
  const place = useMutation({
    mutationFn: (input: { row: SessionQueueRow; topicId: string; reason: string }) =>
      setKeywordService({
        siteId,
        keywordIds: [input.row.keywordId],
        topicId: input.topicId,
        notes: input.reason || null,
      }),
    onSuccess: (_result, input) => {
      toast.success(
        `Placed on ${services.byId.get(input.topicId)?.name ?? "that offering"}`,
      );
      advance(input.row.keywordId);
    },
    onError: (error) => {
      toast.error("Could not place that", {
        description: extractErrorMessage(error),
      });
    },
  });

  function ruleLevel(row: SessionQueueRow, tier: string) {
    onRule({
      keywordIds: [row.keywordId],
      tier,
      notes: notes.trim() || undefined,
      label: row.keyword,
    });
    advance(row.keywordId);
  }

  const busy = stamp.isPending || place.isPending || rulingPending;

  // Keyboard-fast: the number keys answer the fast lane, `s` skips. Ignored
  // while the person is typing their reason — a session that eats keystrokes
  // out of a textarea is worse than one with no shortcuts at all.
  useEffect(() => {
    function onKey(event: KeyboardEvent) {
      if (trialOpen || busy || !current || !fastDimension) return;
      const target = event.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === "TEXTAREA" ||
          target.tagName === "INPUT" ||
          target.isContentEditable)
      ) {
        return;
      }
      if (event.metaKey || event.ctrlKey || event.altKey) return;
      if (event.key === "s") {
        event.preventDefault();
        advance(current.keywordId);
        return;
      }
      const index = Number(event.key) - 1;
      if (!Number.isInteger(index) || index < 0 || index >= fastValues.length) {
        return;
      }
      const value = fastValues[index];
      if (!value) return;
      event.preventDefault();
      stamp.mutate({
        row: current,
        valueId: value.value_id,
        valueKey: value.key,
        valueLabel: value.label,
        dimension: fastDimension,
        reason: notes.trim(),
      });
    }
    globalThis.addEventListener("keydown", onKey);
    return () => globalThis.removeEventListener("keydown", onKey);
  });

  const trialDimension =
    dimensions.find(
      (dimension) => dimension.slug === (trialDimensionSlug(taught) ?? ""),
    ) ?? null;
  const trialReady = taught.length >= beforeTrial && trialDimension !== null;

  // THE BLIND CHECK (KI-032): the system re-answers ALREADY-ruled keywords
  // cold; the fast dimension is the one to argue about.
  if (verifyOpen && fastDimension) {
    return (
      <VerifyPanel
        siteId={siteId}
        siteLabel={siteLabel}
        organizationId={organizationId}
        window={{ start: reviewWindow.start, end: reviewWindow.end }}
        dimension={fastDimension}
        dimensions={dimensions}
        onExit={() => setVerifyOpen(false)}
      />
    );
  }

  if (trialOpen && trialDimension) {
    return (
      <TrialPanel
        siteId={siteId}
        siteLabel={siteLabel}
        organizationId={organizationId}
        window={{ start: reviewWindow.start, end: reviewWindow.end }}
        dimension={trialDimension}
        dimensions={dimensions}
        rulings={taught}
        exclude={seen}
        batchSize={trialBatch}
        onExit={(seenKeywordIds) => {
          setSeen((previous) => [
            ...previous,
            ...seenKeywordIds.filter((id) => !previous.includes(id)),
          ]);
          setTrialOpen(false);
        }}
        onStamped={() => void queue.refetch()}
      />
    );
  }

  return (
    <section
      aria-label="Ruling session"
      className="mx-auto flex w-full max-w-2xl flex-col"
    >
      <div className="flex shrink-0 flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold text-foreground">
            Ruling session
          </h2>
          <p className="text-xs text-muted-foreground">
            {ruledCount > 0 || taught.length > 0 ? (
              <span className="font-medium text-success">
                {ruledCount + taught.length} ruled ·{" "}
              </span>
            ) : null}
            {formatCount(remaining)} keyword{remaining === 1 ? "" : "s"} carry no
            meaning yet — biggest traffic first, and never the same question
            twice
          </p>
        </div>
        <div className="flex items-center gap-2">
          {trialReady ? (
            <Button
              type="button"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setTrialOpen(true)}
              title={`Have the system answer ${trialDimension?.label.toLowerCase()} for the next ${trialBatch} the way you just did`}
            >
              <BrainCircuit className="h-3.5 w-3.5" />
              Let the system try the next {trialBatch}
            </Button>
          ) : null}
          {fastDimension ? (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-8 gap-1.5 text-xs"
              onClick={() => setVerifyOpen(true)}
              title={`The system re-answers your ${fastDimension.label.toLowerCase()} rulings cold — never shown your answers — and you argue the disagreements`}
            >
              <ShieldQuestion className="h-3.5 w-3.5" />
              Blind-check my rulings
            </Button>
          ) : null}
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="h-8 gap-1.5 text-xs"
            onClick={onExit}
          >
            <X className="h-3.5 w-3.5" />
            Done for now
          </Button>
        </div>
      </div>

      {!trialReady && taught.length > 0 ? (
        <p className="mt-1 shrink-0 text-[11px] text-muted-foreground">
          {beforeTrial - taught.length > 0
            ? `${beforeTrial - taught.length} more and the system will offer to try the next ${trialBatch} itself.`
            : null}
        </p>
      ) : null}

      <div className="mt-2.5 h-1.5 w-full shrink-0 overflow-hidden rounded-full bg-muted">
        <div
          className="h-full rounded-full bg-primary transition-all"
          style={{
            width: `${Math.min(
              ((ruledCount + taught.length) /
                Math.max(ruledCount + taught.length + remaining, 1)) *
                100,
              100,
            )}%`,
          }}
        />
      </div>

      <div className="mt-3">
        {queue.isPending || knobs.isPending ? (
          <CardLoading />
        ) : knobs.isError ? (
          <InlineQueryError
            what="this session's settings"
            error={knobs.error}
            onRetry={() => void knobs.refetch()}
          />
        ) : queue.isError ? (
          <InlineQueryError
            what="the queue"
            error={queue.error}
            onRetry={() => void queue.refetch()}
          />
        ) : !current ? (
          <div className="rounded-xl border border-border bg-card p-8 text-center">
            <CheckCircle2 className="mx-auto h-7 w-7 text-success" />
            <p className="mt-2.5 text-sm font-semibold text-foreground">
              {remaining === 0
                ? "Every keyword in this window carries some meaning — the queue is empty."
                : "You have seen everything this batch had that was worth asking separately."}
            </p>
            <div className="mt-3 flex flex-wrap items-center justify-center gap-2">
              {seen.length > 0 ? (
                <Button
                  type="button"
                  variant="outline"
                  size="sm"
                  className="h-7 text-xs"
                  onClick={() => setSeen([])}
                >
                  Show me the ones I skipped
                </Button>
              ) : null}
              <Button
                type="button"
                size="sm"
                className="h-7 text-xs"
                onClick={onExit}
              >
                Back to the workbench
              </Button>
            </div>
          </div>
        ) : (
          <div
            ref={cardRef}
            className={cn(
              "rounded-xl border border-border bg-card p-4 shadow-sm sm:p-5",
              (busy || queue.isFetching) && "opacity-70",
            )}
          >
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
              People found this site by searching
            </p>
            <p className="mt-1 text-lg font-semibold leading-snug text-foreground sm:text-xl">
              &ldquo;{current.keyword}&rdquo;
            </p>

            <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-muted-foreground">
              <span title="Clicks this keyword sent to the site in this window">
                <span className="font-medium tabular-nums text-foreground">
                  {formatCount(current.clicks)}
                </span>{" "}
                clicks
              </span>
              <span title="How often the site appeared in results for this search">
                <span className="font-medium tabular-nums text-foreground">
                  {formatCount(current.impressions)}
                </span>{" "}
                appearances
              </span>
            </div>

            {/* WHY THIS ONE — the sampling is not a mystery box. */}
            <p className="mt-1.5 text-[11px] italic text-muted-foreground">
              Chosen because it is{" "}
              {current.clicks > 0
                ? `${formatCount(current.clicks)} clicks of real demand`
                : `${formatCount(current.impressions)} appearances of real demand`}{" "}
              · {current.whyDistinct}
            </p>

            {/* ── the fast lane: any dimension, big buttons, number keys ── */}
            {fastDimension ? (
              <div className="mt-3 border-t border-dashed border-border pt-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-xs font-medium text-foreground">
                    What kind of search is this?
                  </p>
                  <CreatablePicker
                    value={fastDimension.dimension_id}
                    options={dimensions.map((dimension) => ({
                      value: dimension.dimension_id,
                      label: dimension.label,
                      hint: dimension.scope === "site" ? "yours" : undefined,
                    }))}
                    onSelect={(dimensionId) => {
                      const next = dimensions.find(
                        (dimension) => dimension.dimension_id === dimensionId,
                      );
                      if (next) setFastSlug(next.slug);
                    }}
                    placeholder="Dimension"
                    searchPlaceholder="Answer a different question…"
                    noun="dimension"
                    loading={dimensionsLoading}
                    ariaLabel="Which dimension the quick buttons answer"
                    className="w-44"
                  />
                </div>
                <div className="mt-2 flex flex-wrap gap-2">
                  {fastValues.map((value, index) => (
                    <button
                      key={value.value_id}
                      type="button"
                      disabled={busy}
                      title={value.description ?? undefined}
                      onClick={() =>
                        stamp.mutate({
                          row: current,
                          valueId: value.value_id,
                          valueKey: value.key,
                          valueLabel: value.label,
                          dimension: fastDimension,
                          reason: notes.trim(),
                        })
                      }
                      className="inline-flex items-center gap-2 rounded-lg border border-border bg-background px-3 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/5 disabled:opacity-50"
                    >
                      {index < 9 ? (
                        <span className="rounded bg-muted px-1 text-[10px] tabular-nums text-muted-foreground">
                          {index + 1}
                        </span>
                      ) : null}
                      {value.label}
                    </button>
                  ))}
                  {fastValues.length === 0 ? (
                    <p className="text-[11px] text-muted-foreground">
                      {fastDimension.readiness_note ||
                        "This dimension has no choices yet."}
                    </p>
                  ) : null}
                </div>
              </div>
            ) : null}

            {/* ── the service on the topic tree ── */}
            <div className="mt-3 border-t border-dashed border-border pt-3">
              <p className="flex items-center gap-1.5 text-xs font-medium text-foreground">
                <Network className="h-3.5 w-3.5 text-muted-foreground" />
                Which of your offerings is this about?
              </p>
              <OfferingPicker
                siteId={siteId}
                services={services}
                value={null}
                onSelect={(next) => {
                  if (next === OFFERING_UNPLACED) return;
                  place.mutate({
                    row: current,
                    topicId: next,
                    reason: notes.trim(),
                  });
                }}
                size="md"
                className="mt-1.5"
                ariaLabel="Offering"
              />
            </div>

            {/* ── the level: still here, still optional (P17) ── */}
            <div className="mt-3 border-t border-dashed border-border pt-3">
              <p className="text-xs font-medium text-foreground">
                How much is a visit from this worth?{" "}
                <span className="font-normal text-muted-foreground">
                  — optional; most keywords are identified, not priced
                </span>
              </p>
              <div className="mt-1.5 flex flex-wrap gap-2">
                {levels.map((meta) => (
                  <button
                    key={meta.value}
                    type="button"
                    disabled={busy}
                    title={meta.description ?? undefined}
                    onClick={() => ruleLevel(current, meta.value)}
                    className={cn(
                      "inline-flex items-center gap-2 rounded-lg border px-3 py-1.5 text-xs font-medium transition-all hover:brightness-110 disabled:opacity-50",
                      meta.chip,
                    )}
                  >
                    {meta.label}
                  </button>
                ))}
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => setAddingLevel("")}
                  className="inline-flex items-center rounded-lg border border-dashed border-border px-3 py-1.5 text-xs font-medium text-muted-foreground transition-colors hover:border-primary hover:text-foreground disabled:opacity-50"
                >
                  + Add a level
                </button>
              </div>
            </div>

            <Textarea
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              placeholder="Why? (optional — this sentence is what the system learns from)"
              className="mt-3 min-h-[56px] resize-none text-sm"
            />

            <div className="mt-2.5 flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="h-7 gap-1.5 px-2 text-xs text-muted-foreground"
                disabled={busy}
                onClick={() => advance(current.keywordId)}
              >
                <SkipForward className="h-3.5 w-3.5" />
                Not sure — skip
                <span className="ml-1 rounded bg-muted px-1 text-[10px]">s</span>
              </Button>
              <span className="inline-flex items-center gap-1.5 text-[11px] text-muted-foreground">
                {busy || queue.isFetching ? (
                  <>
                    <Loader2 className="h-3 w-3 animate-spin" />
                    {busy ? "Recording your answer…" : "Fetching the next…"}
                  </>
                ) : (
                  <>
                    <Gavel className="h-3 w-3" />
                    One tap answers it — the next appears automatically
                  </>
                )}
              </span>
            </div>
          </div>
        )}
      </div>

      {addingLevel !== null ? (
        <AddLevelDialog
          siteId={siteId}
          kind="value_band"
          initialLabel={addingLevel}
          onCancel={() => setAddingLevel(null)}
          onCreated={() => setAddingLevel(null)}
        />
      ) : null}
    </section>
  );
}
