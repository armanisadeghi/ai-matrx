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

import {
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
  type Ref,
} from "react";
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
import { CardLoading } from "@/components/matrx/LoadingComponents";
import { CreatablePicker } from "@/components/ui/creatable-picker";
import { toast } from "@/lib/toast";
import { extractErrorMessage } from "@/utils/errors";
import { InlineQueryError } from "@/features/marketing/components/shared/MarketingUi";
import { formatCount } from "@/features/marketing/search-console/types";
import { getFacetDimensionCatalog } from "@/features/marketing/seo/value-system/dimensions/data";
import { setKeywordStamps } from "@/features/marketing/seo/keyword-workbench/data";
import { getBatchQuestion, type BatchKeyword } from "./batch";
import {
  ProTextarea,
  type ProTextareaElement,
} from "@/components/official/ProTextarea";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { buildApplicationScopeFromMenuContext } from "@/features/context-menu-v3/utils/build-application-scope";
import { CONTEXT_MENU_ENTITY_KEY } from "@/features/context-menu-v3/types";
import {
  keywordEntityRef,
  useKeywordAssignSurfaces,
  useKeywordMenuSection,
  type KeywordMenuRow,
} from "@/features/marketing/seo/keyword/keyword-actions";
import {
  KEYWORD_QUICK_ANSWERS_SURFACE_NAME,
  createKeywordQuickAnswersScope,
  keywordQuickAnswersManifest,
} from "@/features/surfaces/manifests/keyword-quick-answers.manifest";
import { surfaceValueLabels } from "@/features/surfaces/utils/surface-display";
import type { SurfaceScopePayload } from "@/features/surfaces/types";

export interface QuickAnswersSurfaceHandle {
  /** Full live window scope, assembled only when a launcher asks for it. */
  getScope: () => SurfaceScopePayload;
  /** Draft-only write twin; never submits an answer. */
  setReasonDraft: (value: unknown) => void;
  /** UI-only write twin; never submits an answer. */
  setActiveDimensionSlug: (value: unknown) => void;
}

interface QuickAnswersProps {
  siteId: string;
  siteLabel?: string | null;
  /** Null lets the server choose the question worth asking next. */
  dimensionSlug: string | null;
  onDimensionChange: (slug: string | null) => void;
  /** Fires after every landed write so a host can refresh what it shows. */
  onAnswered?: () => void;
  className?: string;
  /** Window-owned bridge for the nested SurfaceRuntimeProvider. */
  surfaceHandleRef?: Ref<QuickAnswersSurfaceHandle>;
}

const V = surfaceValueLabels(keywordQuickAnswersManifest);

export function QuickAnswers({
  siteId,
  siteLabel,
  dimensionSlug,
  onDimensionChange,
  onAnswered,
  className,
  surfaceHandleRef,
}: QuickAnswersProps) {
  const [seen, setSeen] = useState<string[]>([]);
  const [reason, setReason] = useState("");
  const [answered, setAnswered] = useState(0);
  const [doneState, setDoneState] = useState<{
    dimensionSlug: string | null;
    values: Record<string, string>;
  }>({ dimensionSlug: null, values: {} });
  const reasonRef = useRef<ProTextareaElement | null>(null);

  /**
   * THE KEYWORD ROW'S OWN MENU (context-menu-v3 rollout). The outer pane menu
   * below answers for the SITE; right-clicking one of the five keywords must
   * answer for THAT keyword instead — same shared builder the Value Workbench
   * this window opens out of already uses, so a class/level/service set here
   * is the identical write path and shows up there too.
   */
  const clickedKeywordRow = useRef<BatchKeyword | null>(null);
  const keywordAssignSurfaces = useKeywordAssignSurfaces({
    siteId,
    onChanged: () => void batch.refetch(),
  });
  const keywordMenuSection = useKeywordMenuSection({
    siteId,
    siteName: siteLabel,
    surfaces: keywordAssignSurfaces,
    getRow: (): KeywordMenuRow | null => {
      const row = clickedKeywordRow.current;
      return row
        ? { phrase: row.keyword, keywordId: row.keywordId }
        : null;
    },
  });

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
  const done = doneState.dimensionSlug === activeSlug ? doneState.values : {};

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
      setDoneState((prior) => {
        const next =
          prior.dimensionSlug === activeSlug ? { ...prior.values } : {};
        for (const id of input.keywordIds) next[id] = input.valueLabel;
        return { dimensionSlug: activeSlug, values: next };
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

  const getScope = () => {
    const isLoading = catalog.isFetching || batch.isFetching;
    const isSaving = stamp.isPending;
    return createKeywordQuickAnswersScope({
      site_summary: { id: siteId, label: siteLabel ?? null },
      site_id: siteId,
      site_label: siteLabel ?? undefined,
      dimension_catalog: dimensions,
      active_dimension: activeDimension ?? undefined,
      active_dimension_id: activeDimension?.dimension_id,
      active_dimension_slug: activeSlug ?? undefined,
      active_dimension_label:
        activeDimension?.label ?? batch.data?.dimensionLabel ?? undefined,
      active_dimension_scope: activeDimension?.scope,
      active_dimension_choices: values,
      current_question: batch.data,
      question_reason: batch.data?.why ?? undefined,
      remaining_unanswered: batch.data?.remaining,
      current_keywords: keywords,
      outstanding_keywords: outstanding,
      answered_results: done,
      reason_draft: reason,
      answered_this_session: answered,
      seen_keyword_ids: seen,
      all_done: allDone,
      is_loading: isLoading,
      is_saving: isSaving,
      session_progress: {
        answered,
        seen: seen.length,
        visible: keywords.length,
        outstanding: outstanding.length,
        all_done: allDone,
        loading: isLoading,
        saving: isSaving,
      },
      content: reason,
      context: {
        site: { id: siteId, label: siteLabel ?? null },
        active_question: {
          slug: activeSlug,
          label: activeDimension?.label ?? batch.data?.dimensionLabel ?? null,
          why: batch.data?.why ?? null,
          choices: values,
        },
        current_keywords: keywords,
        outstanding_keyword_ids: outstanding.map((row) => row.keywordId),
        answered_results: done,
      },
    });
  };

  const getEditableApplicationScope = () => {
    const element = reasonRef.current;
    const start = element?.selectionStart ?? 0;
    const end = element?.selectionEnd ?? start;
    const selectedText = element
      ? element.value.slice(Math.min(start, end), Math.max(start, end))
      : "";
    return buildApplicationScopeFromMenuContext({
      selectedText,
      selectionRange: element
        ? { type: "editable", element, start, end }
        : null,
      contextData: getScope(),
    });
  };

  const getReadOnlyApplicationScope = () =>
    buildApplicationScopeFromMenuContext({
      selectedText:
        typeof window === "undefined"
          ? ""
          : (window.getSelection()?.toString() ?? ""),
      selectionRange: null,
      contextData: getScope(),
    });

  const setReasonDraft = (value: unknown) => {
    if (typeof value !== "string") {
      throw new Error("reason_draft expects a string.");
    }
    setReason(value);
  };

  const setActiveDimensionSlug = (value: unknown) => {
    if (typeof value !== "string" || !value.trim()) {
      throw new Error("active_dimension_slug expects a non-empty string.");
    }
    const next = dimensions.find(
      (dimension) => dimension.slug === value.trim(),
    );
    if (!next) {
      throw new Error(
        `active_dimension_slug must name one of the ${dimensions.length} loaded questions.`,
      );
    }
    onDimensionChange(next.slug);
  };

  useImperativeHandle(surfaceHandleRef, () => ({
    getScope,
    setReasonDraft,
    setActiveDimensionSlug,
  }));

  const nextBatch = () => {
    setSeen((prior) => [...prior, ...keywords.map((k) => k.keywordId)]);
    setDoneState({ dimensionSlug: activeSlug, values: {} });
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
    <div
      className={cn("flex h-full min-h-0 flex-col", className)}
      data-surface-value="site_id"
    >
      {keywordAssignSurfaces.node}
      <NonEditableContextMenu
        sourceFeature="marketing"
        surfaceName={KEYWORD_QUICK_ANSWERS_SURFACE_NAME}
        menuVersion={1}
        getApplicationScope={getReadOnlyApplicationScope}
        contentSource={{ type: "raw" }}
        entity={{
          type: "web_site",
          id: siteId,
          title: siteLabel ?? siteId,
          resourceType: "web_site",
        }}
      >
        <div
          className="flex min-h-0 flex-1 flex-col"
          data-surface-value="current_question"
        >
          {/* ── the question ── */}
          <div
            className="shrink-0 border-b border-primary/25 bg-primary/5 px-4 py-3"
            data-surface-value="active_dimension"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0" data-surface-value="active_dimension_id">
                <p
                  className="flex items-center gap-1.5 text-sm font-medium text-foreground"
                  data-surface-value="active_dimension_label"
                >
                  <BrainCircuit className="h-4 w-4 shrink-0 text-primary" />
                  {activeDimension?.label ?? "Pick a question"}
                </p>
                <p
                  className="mt-0.5 truncate text-xs text-foreground/70"
                  data-surface-value="question_reason"
                >
                  {batch.data?.why
                    ? `Asked because it ${batch.data.why}. `
                    : ""}
                  <span data-surface-value="remaining_unanswered">
                    {batch.data?.remaining
                      ? `${formatCount(batch.data.remaining)} keywords still have no answer.`
                      : null}
                  </span>
                </p>
              </div>
              <div data-surface-value="dimension_catalog">
                <div data-surface-value="active_dimension_scope">
                  <div data-surface-value="active_dimension_slug">
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
                      className="w-52"
                    />
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── the five ── */}
          <div
            className="min-h-0 flex-1 space-y-2 overflow-y-auto overscroll-contain p-3 scrollbar-thin"
            data-surface-value="current_keywords"
          >
            <div data-surface-value="answered_results">
              {batch.isLoading ? (
                <div data-surface-value="is_loading">
                  <CardLoading />
                </div>
              ) : keywords.length === 0 ? (
                <div className="flex h-full flex-col items-center justify-center gap-1 text-center">
                  <CheckCircle2 className="h-5 w-5 text-success" />
                  <p className="text-sm font-medium text-foreground">
                    Nothing left to ask here
                  </p>
                  <p className="max-w-xs text-xs text-muted-foreground">
                    Every keyword with demand on {siteLabel ?? "this site"} has
                    an answer for this one. Pick a different question above.
                  </p>
                </div>
              ) : (
                <NonEditableContextMenu
                  sourceFeature="marketing"
                  contentSource={{ type: "raw" }}
                  extraSections={[keywordMenuSection]}
                  resolveContextOnOpen={(target) => {
                    const el = target?.closest<HTMLElement>("[data-row-id]");
                    const id = el?.getAttribute("data-row-id") ?? null;
                    const row = keywords.find((k) => k.keywordId === id) ?? null;
                    clickedKeywordRow.current = row;
                    return {
                      [CONTEXT_MENU_ENTITY_KEY]: keywordEntityRef(
                        row ? { phrase: row.keyword, keywordId: row.keywordId } : null,
                      ),
                      content: row ? row.keyword : "",
                    };
                  }}
                >
                  <div className="space-y-2" data-surface-value="is_saving">
                    {keywords.map((row) => (
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
                    ))}
                  </div>
                </NonEditableContextMenu>
              )}
            </div>

            {/* Same answer for everything still open — the reason this is a batch. */}
            {outstanding.length > 1 && values.length > 0 ? (
              <div
                className="rounded-lg border border-dashed border-primary/40 bg-primary/5 p-2.5"
                data-surface-value="outstanding_keywords"
              >
                <p className="text-xs font-semibold text-primary">
                  Same answer for the {outstanding.length} still open
                </p>
                <div
                  className="mt-1.5 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin"
                  data-surface-value="active_dimension_choices"
                >
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
                      className="shrink-0 rounded-md border border-primary/35 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-50"
                    >
                      {value.label}
                    </button>
                  ))}
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </NonEditableContextMenu>

      {/* ── the reason, and the way on ── */}
      <div
        className="shrink-0 space-y-2 border-t border-border px-3 py-2"
        data-surface-value="session_progress"
      >
        <div data-surface-value="reason_draft">
          <EditableContextMenu
            sourceFeature="marketing"
            surfaceName={KEYWORD_QUICK_ANSWERS_SURFACE_NAME}
            menuVersion={1}
            getTextarea={() => reasonRef.current}
            getApplicationScope={getEditableApplicationScope}
            contentSource={{ type: "raw" }}
            onTextReplace={setReason}
          >
            <ProTextarea
              ref={reasonRef}
              value={reason}
              onChange={(event) => setReason(event.target.value)}
              placeholder="Add a reason (optional)"
              rows={2}
              className="min-h-0 resize-none bg-card text-sm"
              aria-label={V.reason_draft}
              surfaceName={KEYWORD_QUICK_ANSWERS_SURFACE_NAME}
              sourceFeature="marketing"
              getApplicationScope={getEditableApplicationScope}
            />
          </EditableContextMenu>
        </div>
        <div
          className="flex items-center justify-between gap-2"
          data-surface-value="seen_keyword_ids"
        >
          <p
            className="text-[11px] text-muted-foreground"
            data-surface-value="answered_this_session"
          >
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
            data-surface-value="all_done"
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
      data-row-id={row.keywordId}
      className={cn(
        "relative overflow-hidden rounded-lg border p-2.5 transition-colors before:absolute before:inset-y-0 before:left-0 before:w-1",
        answeredAs
          ? "border-success/40 bg-success/5 before:bg-success"
          : row.pickedFor === "clicks"
            ? "border-primary/30 bg-primary/5 before:bg-primary"
            : "border-info/30 bg-info/5 before:bg-info",
      )}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 flex-1 text-xs font-medium text-foreground">
          {row.keyword}
        </p>
        <span
          className={cn(
            "inline-flex shrink-0 items-center gap-1 text-[11px] font-medium tabular-nums",
            row.pickedFor === "clicks" ? "text-primary" : "text-info",
          )}
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
        <div className="mt-2 flex flex-nowrap gap-1.5 overflow-x-auto pb-0.5 scrollbar-thin">
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
                className="shrink-0 rounded-md border border-primary/30 bg-card px-2.5 py-1.5 text-xs font-medium text-foreground transition-colors hover:border-primary hover:bg-primary/10 disabled:opacity-50"
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
