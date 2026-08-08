"use client";

/**
 * Keyword classification workbench — the dedicated manual truth-editing
 * surface for the GSC traffic-class system (drives Traffic quality / Shifts /
 * Juice / class-aware digs). v2 (2026-08-08, Arman's spec):
 *
 *  - Live class scoreboard (`ClassStatsBand`) — numbers move as you rule.
 *  - The class chip IS the control (`ClassCell` dropdown — scalable class
 *    list, no button row).
 *  - Pattern rules (`ClassRulesPanel`): clue templates + user rules; preview
 *    pipes the rule's matches into THIS table (server-side matching),
 *    matches come preselected, prune then apply. Per-rule auto-apply is
 *    opt-in; auto-applied rulings carry confirmed=false and render flagged
 *    until confirmed.
 *  - CSV / workbook export-import (`ImportExportMenu`) with a server diff
 *    before anything applies.
 *  - "Classify with AI" — the existing universal classifier
 *    (`seo.keyword_classifier` slot via aidream `/seo/keywords/classify`);
 *    results land as "AI intent" provenance, overridable like any machine
 *    signal. The Site Intake Wizard (`../intake/`) remains the full-site
 *    AI interview; this button is the surgical batch complement.
 *
 * Reusable ANYWHERE: props-based (siteId/siteDomain/organizationId), with
 * URL-backed table state on the route and local state inside the window
 * panel (`urlState={false}`). One write path: `gsc_set_keyword_class`.
 */

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { Check, ListFilter, Loader2, Scale, Sparkles, Tags, X } from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type {
  MatrxColumnDef,
  MatrxDataTableQueryState,
} from "@/components/official/matrx-data-table/types";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
import { supabase } from "@/utils/supabase/client";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { ClassCell } from "@/features/marketing/search-console/components/classification/ClassCell";
import { ClassStatsBand } from "@/features/marketing/search-console/components/classification/ClassStatsBand";
import { ClassRulesPanel } from "@/features/marketing/search-console/components/classification/ClassRulesPanel";
import { ImportExportMenu } from "@/features/marketing/search-console/components/classification/ImportExportMenu";
import {
  classifyKeywordsWithAi,
  confirmGscKeywordClass,
  getGscClassReview,
  getGscClassReviewAll,
  setGscKeywordClass,
  type GscClassRuling,
  type GscClassReviewQuery,
} from "@/features/marketing/search-console/data-classification";
import {
  adoptClassTemplate,
  createClassRule,
  deleteClassRule,
  listClassRules,
  updateClassRule,
} from "@/features/marketing/search-console/data-class-rules";
import type {
  ClassRuleDraft,
  KeywordClassRuleRow,
} from "@/features/marketing/search-console/lib/class-rules";
import type {
  GscClassReviewRow,
  GscClassSource,
  GscDateRange,
  GscTrafficClass,
} from "@/features/marketing/search-console/types";
import {
  GSC_CLASS_SOURCES,
  GSC_TRAFFIC_CLASSES,
  formatCount,
} from "@/features/marketing/search-console/types";

/** Provenance chip — WHY a keyword has its class, always visible. */
export function ClassSourceChip({ source }: { source: string | null }) {
  const meta = GSC_CLASS_SOURCES.find((s) => s.key === source);
  if (!meta) return <span className="text-xs text-muted-foreground">—</span>;
  return (
    <span
      className={cn(
        "rounded border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]",
        meta.tone,
      )}
      title={meta.description}
    >
      {meta.label}
    </span>
  );
}

/** Review window: the freshest ~28 GSC days (GSC data lags ~2 days). */
function reviewRange(): GscDateRange {
  const iso = (d: Date) => d.toISOString().slice(0, 10);
  const end = new Date();
  end.setUTCDate(end.getUTCDate() - 2);
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 27);
  return { start: iso(start), end: iso(end) };
}

const SORTABLE = new Set(["impressions", "clicks", "ctr", "query"]);
const DEFAULT_STATE: MatrxDataTableQueryState = {
  page: 1,
  pageSize: 50,
  search: "",
  anyOf: "",
  columnFilters: {},
  sort: { id: "impressions", direction: "desc" },
};

/** Local (non-URL) table state with the same surface as
 *  `useMarketingTableState` — for the window-panel mount, where URL params
 *  belong to the page underneath. */
function useLocalTableState() {
  const [state, setState] = useState<MatrxDataTableQueryState>(DEFAULT_STATE);
  return {
    state,
    queryState: state,
    onStateChange: setState,
  };
}

interface RulePreview {
  pattern: string;
  matchKind: ClassRuleDraft["matchKind"];
  targetClass: ClassRuleDraft["targetClass"];
  notes: string;
  rule: KeywordClassRuleRow | null;
  label: string;
}

/** One auto-apply pass per (site) per session — rules with auto_apply pick
 *  up NEW unclassified matches on workspace open, flagged unconfirmed. */
const autoApplyDone = new Set<string>();

export interface KeywordClassificationWorkspaceProps {
  siteId: string;
  siteDomain: string;
  organizationId: string | null;
  /** false inside the window panel — table state stays local, URL untouched. */
  urlState?: boolean;
}

export function KeywordClassificationWorkspace({
  siteId,
  siteDomain,
  organizationId,
  urlState = true,
}: KeywordClassificationWorkspaceProps) {
  const dispatch = useAppDispatch();
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const queryClient = useQueryClient();
  const range = useMemo(reviewRange, []);
  const urlTable = useMarketingTableState({
    defaultSort: { id: "impressions", direction: "desc" },
    defaultPageSize: 50,
  });
  const localTable = useLocalTableState();
  const table = urlState ? urlTable : localTable;

  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [excluded, setExcluded] = useState<ReadonlySet<string>>(new Set());
  const [preview, setPreview] = useState<RulePreview | null>(null);
  const [rulesOpen, setRulesOpen] = useState(false);
  const [dialog, setDialog] = useState<{
    ruling: GscClassRuling;
    keywordIds: string[];
    label: string;
  } | null>(null);
  const [notes, setNotes] = useState("");
  const [aiBusy, setAiBusy] = useState(false);
  const [applyBusy, setApplyBusy] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const state = table.queryState;
  const classFilter = state.columnFilters.traffic_class;
  const sourceFilter = state.columnFilters.class_source;
  const confirmedFilter = state.columnFilters.ruling_confirmed;
  const sortId =
    state.sort && SORTABLE.has(state.sort.id) ? state.sort.id : "impressions";

  const selectValues = (
    filter: typeof classFilter,
  ): string[] | null =>
    filter?.kind === "select"
      ? filter.values?.length
        ? filter.values
        : filter.value
          ? [filter.value]
          : null
      : null;

  const reviewQuery: Omit<GscClassReviewQuery, "page" | "pageSize"> = {
    trafficClasses: selectValues(classFilter) as GscTrafficClass[] | null,
    sources: selectValues(sourceFilter) as GscClassSource[] | null,
    search: state.search,
    sort: sortId as "impressions" | "clicks" | "ctr" | "query",
    sortDir: state.sort?.direction === "asc" ? "asc" : "desc",
    pattern: preview?.pattern ?? null,
    matchKind: preview?.matchKind ?? null,
    confirmed:
      confirmedFilter?.kind === "boolean" ? confirmedFilter.value : null,
  };

  const review = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "class-review",
      siteId,
      range.start,
      range.end,
      state,
      preview?.pattern ?? "",
      preview?.matchKind ?? "",
    ],
    queryFn: ({ signal }) =>
      getGscClassReview(
        siteId,
        range,
        { ...reviewQuery, page: state.page, pageSize: state.pageSize },
        signal,
      ),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rules = useQuery({
    queryKey: ["marketing", "gsc", "class-rules", siteId],
    queryFn: ({ signal }) => listClassRules(siteId, signal),
    staleTime: 5 * 60_000,
  });

  // Resolve current user once (for rules panel ownership partition).
  useQuery({
    queryKey: ["marketing", "gsc", "class-rules-user"],
    queryFn: async () => {
      const {
        data: { user },
      } = await supabase.auth.getUser();
      userIdRef.current = user?.id ?? null;
      return user?.id ?? "";
    },
    staleTime: Infinity,
  });

  const rows = review.data?.rows ?? [];
  const total = review.data?.total ?? 0;

  const invalidate = useCallback(() => {
    void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
  }, [queryClient]);

  const classify = useMutation({
    mutationFn: (input: {
      ruling: GscClassRuling;
      keywordIds: string[];
      notes: string | null;
      origin?: "manual" | "rule" | "import" | "ai";
      ruleId?: string | null;
      confirmed?: boolean;
    }) =>
      setGscKeywordClass(siteId, input.keywordIds, input.ruling, input.notes, {
        origin: input.origin,
        ruleId: input.ruleId,
        confirmed: input.confirmed,
      }),
    onSuccess: (resolved, input) => {
      const sources = new Set(resolved.map((r) => r.class_source));
      toast.success(
        input.ruling === "clear"
          ? `Cleared ${resolved.length} ruling${resolved.length === 1 ? "" : "s"}`
          : `Classified ${resolved.length} keyword${resolved.length === 1 ? "" : "s"} as ${input.ruling}`,
        {
          description:
            input.ruling === "clear"
              ? `Machine classification decides again (now: ${[...sources].join(", ")}).`
              : sources.has("site_value")
                ? "Provenance is now “Site value” — your ruling beats every machine signal."
                : `Server resolved provenance: ${[...sources].join(", ")}.`,
        },
      );
      setSelected(new Set());
      invalidate();
    },
    onError: (error) => {
      toast.error("Could not save the classification", {
        description: extractErrorMessage(error),
      });
    },
  });

  const rule = (ruling: GscClassRuling, keywordIds: string[], label: string) => {
    if (keywordIds.length === 0) return;
    if (ruling === "mismatch" || keywordIds.length > 1) {
      setNotes("");
      setDialog({ ruling, keywordIds, label });
      return;
    }
    classify.mutate({ ruling, keywordIds, notes: null });
  };

  // ── Rule preview + apply ─────────────────────────────────────────────────

  const startPreview = (source: KeywordClassRuleRow | ClassRuleDraft, ruleRow: KeywordClassRuleRow | null) => {
    const isRow = "pattern" in source && "id" in source;
    setPreview({
      pattern: (isRow ? (source as KeywordClassRuleRow).pattern : (source as ClassRuleDraft).pattern).toLowerCase(),
      matchKind: (isRow
        ? ((source as KeywordClassRuleRow).match_kind as ClassRuleDraft["matchKind"])
        : (source as ClassRuleDraft).matchKind),
      targetClass: (isRow
        ? ((source as KeywordClassRuleRow).target_class as ClassRuleDraft["targetClass"])
        : (source as ClassRuleDraft).targetClass),
      notes: (isRow ? ((source as KeywordClassRuleRow).notes ?? "") : (source as ClassRuleDraft).notes),
      rule: ruleRow,
      label: isRow ? (source as KeywordClassRuleRow).name : ((source as ClassRuleDraft).name.trim() || "Draft rule"),
    });
    setExcluded(new Set());
    setSelected(new Set());
    table.onStateChange({ ...table.state, page: 1 });
    setRulesOpen(false);
  };

  const applyPreview = async () => {
    if (!preview) return;
    setApplyBusy(true);
    try {
      const all = await getGscClassReviewAll(siteId, range, reviewQuery, 20000);
      const ids = all.rows
        .map((row) => row.keyword_id)
        .filter((id) => !excluded.has(id));
      if (ids.length === 0) {
        toast.error("Nothing to apply — every match is pruned.");
        return;
      }
      for (let i = 0; i < ids.length; i += 1000) {
        await setGscKeywordClass(
          siteId,
          ids.slice(i, i + 1000),
          preview.targetClass,
          preview.notes || null,
          { origin: "rule", ruleId: preview.rule?.id ?? null, confirmed: true },
        );
      }
      toast.success(
        `Applied ${preview.targetClass} to ${ids.length.toLocaleString()} keywords`,
        {
          description: excluded.size
            ? `${excluded.size} pruned match${excluded.size === 1 ? "" : "es"} left untouched.`
            : `Every “${preview.label}” match now carries your ruling.`,
        },
      );
      setPreview(null);
      setExcluded(new Set());
      invalidate();
    } catch (error) {
      toast.error("Rule apply failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setApplyBusy(false);
    }
  };

  // ── Auto-apply pass (once per site per session) ──────────────────────────
  const rulesData = rules.data;
  const rulesReady = rules.isSuccess;
  useEffect(() => {
    if (!rulesReady || autoApplyDone.has(siteId)) return;
    autoApplyDone.add(siteId);
    const autoRules = (rulesData ?? []).filter(
      (r) => r.auto_apply && !r.is_template,
    );
    if (autoRules.length === 0) return;
    void (async () => {
      let appliedTotal = 0;
      for (const autoRule of autoRules) {
        try {
          const matches = await getGscClassReviewAll(
            siteId,
            range,
            {
              trafficClasses: ["unclassified"],
              sources: null,
              search: "",
              sort: "impressions",
              sortDir: "desc",
              pattern: autoRule.pattern,
              matchKind: autoRule.match_kind as ClassRuleDraft["matchKind"],
              confirmed: null,
            },
            1000,
          );
          const ids = matches.rows.map((row) => row.keyword_id);
          if (ids.length === 0) continue;
          await setGscKeywordClass(
            siteId,
            ids,
            autoRule.target_class as GscClassRuling,
            autoRule.notes,
            { origin: "rule", ruleId: autoRule.id, confirmed: false },
          );
          appliedTotal += ids.length;
        } catch (error) {
          toast.error(`Auto-apply failed for “${autoRule.name}”`, {
            description: extractErrorMessage(error),
          });
        }
      }
      if (appliedTotal > 0) {
        toast.success(
          `Auto-applied ${appliedTotal.toLocaleString()} rulings from your rules`,
          {
            description:
              "They are flagged as unconfirmed — use “Review unconfirmed” to eyeball and confirm them.",
          },
        );
        invalidate();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- one pass per site per session by design
  }, [rulesReady, siteId]);

  // ── AI batch ─────────────────────────────────────────────────────────────

  const runAiClassify = async () => {
    setAiBusy(true);
    try {
      let ids: string[];
      if (selected.size > 0) {
        ids = [...selected];
      } else {
        const all = await getGscClassReviewAll(
          siteId,
          range,
          { ...reviewQuery, trafficClasses: ["unclassified"] },
          1000,
        );
        ids = all.rows
          .filter((row) => !row.intent_class)
          .map((row) => row.keyword_id);
      }
      if (ids.length === 0) {
        toast.info("Nothing for the AI to classify", {
          description:
            "Select keywords, or clear filters — every unclassified keyword in view already has an AI intent.",
        });
        return;
      }
      const result = await classifyKeywordsWithAi(dispatch, ids, (done, all) => {
        if (all > 200) {
          toast.message(`AI classifying… ${done}/${all}`, { id: "ai-classify" });
        }
      });
      toast.success(
        `AI classified ${result.updated.toLocaleString()} keywords`,
        {
          id: "ai-classify",
          description:
            "Results carry “AI intent” provenance — filter Why = AI intent to review, and override anything it got wrong. Your rulings always win.",
        },
      );
      setSelected(new Set());
      invalidate();
    } catch (error) {
      toast.error("AI classification failed", {
        description: extractErrorMessage(error),
      });
    } finally {
      setAiBusy(false);
    }
  };

  // ── Confirm unconfirmed ──────────────────────────────────────────────────

  const confirmSelected = async (ids: string[]) => {
    try {
      const count = await confirmGscKeywordClass(siteId, ids);
      toast.success(`Confirmed ${count} ruling${count === 1 ? "" : "s"}`);
      setSelected(new Set());
      invalidate();
    } catch (error) {
      toast.error("Confirm failed", { description: extractErrorMessage(error) });
    }
  };

  // ── Table ────────────────────────────────────────────────────────────────

  const pageIds = rows.map((row) => row.keyword_id);
  const allPageSelected =
    pageIds.length > 0 &&
    (preview
      ? pageIds.every((id) => !excluded.has(id))
      : pageIds.every((id) => selected.has(id)));

  const toggleRow = (id: string, checked: boolean) => {
    if (preview) {
      setExcluded((prev) => {
        const next = new Set(prev);
        if (checked) next.delete(id);
        else next.add(id);
        return next;
      });
    } else {
      setSelected((prev) => {
        const next = new Set(prev);
        if (checked) next.add(id);
        else next.delete(id);
        return next;
      });
    }
  };

  const columns: MatrxColumnDef<GscClassReviewRow>[] = [
    {
      id: "select",
      sortable: false,
      filter: false,
      width: 36,
      header: (
        <Checkbox
          checked={allPageSelected}
          aria-label="Select all keywords on this page"
          onCheckedChange={(checked) => {
            for (const id of pageIds) toggleRow(id, checked === true);
          }}
        />
      ),
      cell: (row) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={
              preview
                ? !excluded.has(row.keyword_id)
                : selected.has(row.keyword_id)
            }
            aria-label={`Select ${row.query}`}
            onCheckedChange={(checked) =>
              toggleRow(row.keyword_id, checked === true)
            }
          />
        </span>
      ),
    },
    {
      id: "query",
      accessorKey: "query",
      header: "Keyword",
      filter: "text",
      cell: (row) => (
        <div className="min-w-44">
          <p className="text-xs font-medium text-foreground">{row.query}</p>
          {row.notes ? (
            <p
              className="mt-0.5 max-w-72 truncate text-[10px] text-muted-foreground"
              title={row.notes}
            >
              {row.notes}
            </p>
          ) : null}
        </div>
      ),
    },
    {
      id: "traffic_class",
      accessorKey: "traffic_class",
      header: "Class",
      filter: "select",
      filterOptions: GSC_TRAFFIC_CLASSES.map((c) => ({
        value: c.key,
        label: c.label,
      })),
      cell: (row) => (
        <span onClick={(event) => event.stopPropagation()}>
          <ClassCell
            trafficClass={row.traffic_class}
            classSource={row.class_source}
            confirmed={row.ruling_confirmed ?? true}
            disabled={classify.isPending}
            onRule={(ruling) => rule(ruling, [row.keyword_id], row.query)}
          />
        </span>
      ),
    },
    {
      id: "class_source",
      accessorKey: "class_source",
      header: "Why",
      filter: "select",
      filterOptions: GSC_CLASS_SOURCES.map((s) => ({
        value: s.key,
        label: s.label,
      })),
      cell: (row) => <ClassSourceChip source={row.class_source} />,
    },
    {
      id: "impressions",
      accessorKey: "impressions",
      header: "Impressions (28d)",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs font-semibold tabular-nums">
          {formatCount(row.impressions)}
        </span>
      ),
    },
    {
      id: "clicks",
      accessorKey: "clicks",
      header: "Clicks (28d)",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums">{formatCount(row.clicks)}</span>
      ),
    },
    {
      id: "ctr",
      accessorKey: "ctr",
      header: "CTR",
      align: "right",
      filter: false,
      cell: (row) => (
        <span className="text-xs tabular-nums text-muted-foreground">
          {row.ctr === null || row.ctr === undefined
            ? "—"
            : `${(row.ctr * 100).toFixed(1)}%`}
        </span>
      ),
    },
    {
      id: "intent_class",
      accessorKey: "intent_class",
      header: "AI intent",
      sortable: false,
      filter: false,
      cell: (row) => (
        <span className="text-[11px] text-muted-foreground">
          {row.intent_class ? row.intent_class.replaceAll("_", " ") : "—"}
        </span>
      ),
    },
  ];

  const previewKept = preview ? total - excluded.size : 0;
  const unconfirmedShown =
    confirmedFilter?.kind === "boolean" && confirmedFilter.value === false;

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <ClassStatsBand
        siteId={siteId}
        range={range}
        activeClass={
          (selectValues(classFilter)?.length === 1
            ? (selectValues(classFilter)?.[0] as GscTrafficClass)
            : null) ?? null
        }
        onSelectClass={(cls) =>
          table.onStateChange({
            ...table.state,
            page: 1,
            columnFilters: {
              ...table.state.columnFilters,
              traffic_class: cls ? { kind: "select", value: cls } : undefined,
            },
          })
        }
        unconfirmedShown={unconfirmedShown}
        onToggleUnconfirmed={() =>
          table.onStateChange({
            ...table.state,
            page: 1,
            columnFilters: {
              ...table.state.columnFilters,
              ruling_confirmed: unconfirmedShown
                ? undefined
                : { kind: "boolean", value: false },
            },
          })
        }
      />

      {preview ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary bg-accent/60 px-3 py-2">
          <ListFilter className="h-3.5 w-3.5 text-primary" />
          <span className="text-xs">
            Previewing <span className="font-semibold">{preview.label}</span> —{" "}
            {formatCount(total)} match{total === 1 ? "" : "es"}
            {excluded.size > 0
              ? `, ${excluded.size} pruned (uncheck to prune more)`
              : " (uncheck rows to prune)"}
          </span>
          <span className="ml-auto flex items-center gap-1.5">
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              disabled={applyBusy || previewKept <= 0}
              onClick={() => void applyPreview()}
            >
              {applyBusy ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : (
                <Check className="h-3 w-3" />
              )}
              Apply {preview.targetClass} to {formatCount(Math.max(previewKept, 0))}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="ghost"
              className="h-7 gap-1 px-2 text-xs text-muted-foreground"
              onClick={() => {
                setPreview(null);
                setExcluded(new Set());
              }}
            >
              <X className="h-3 w-3" /> Cancel
            </Button>
          </span>
        </div>
      ) : null}

      {!preview && selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-accent/40 px-3 py-2">
          <span className="text-xs font-medium">{selected.size} selected</span>
          {GSC_TRAFFIC_CLASSES.filter((c) => c.key !== "unclassified").map(
            (c) => (
              <Button
                key={c.key}
                type="button"
                size="sm"
                variant="outline"
                className="h-7 px-2 text-xs"
                disabled={classify.isPending}
                onClick={() =>
                  rule(
                    c.key as GscClassRuling,
                    [...selected],
                    `${selected.size} keywords`,
                  )
                }
              >
                {c.label}
              </Button>
            ),
          )}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={classify.isPending}
            onClick={() =>
              rule("clear", [...selected], `${selected.size} keywords`)
            }
          >
            Clear rulings
          </Button>
          {unconfirmedShown ? (
            <Button
              type="button"
              size="sm"
              className="h-7 gap-1 px-2 text-xs"
              onClick={() => void confirmSelected([...selected])}
            >
              <Check className="h-3 w-3" /> Confirm selected
            </Button>
          ) : null}
          <Button
            type="button"
            size="sm"
            variant="ghost"
            className="h-7 px-2 text-xs text-muted-foreground"
            onClick={() => setSelected(new Set())}
          >
            Deselect
          </Button>
        </div>
      ) : null}

      <div className="flex min-h-0 flex-1 flex-col rounded-lg border border-border bg-card p-2">
        <div className="mb-1.5 flex shrink-0 flex-wrap items-center justify-between gap-1.5">
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Tags className="h-3.5 w-3.5 text-primary" />
            {formatCount(total)} GSC-active keywords · {range.start} →{" "}
            {range.end} · your ruling beats brand-match beats AI intent
          </p>
          <span className="flex items-center gap-1.5">
            {isSuperAdmin ? (
              <Button
                type="button"
                size="sm"
                variant="outline"
                className="h-7 gap-1.5 px-2 text-xs"
                disabled={aiBusy}
                title={
                  selected.size > 0
                    ? `Run the universal AI classifier on the ${selected.size} selected keywords`
                    : "Run the universal AI classifier on the filtered unclassified keywords (up to 1,000)"
                }
                onClick={() => void runAiClassify()}
              >
                {aiBusy ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5" />
                )}
                Classify with AI
              </Button>
            ) : null}
            <Button
              type="button"
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => setRulesOpen(true)}
            >
              <ListFilter className="h-3.5 w-3.5" /> Rules
              {(rules.data?.length ?? 0) > 0
                ? ` (${rules.data?.filter((r) => !r.is_template).length ?? 0})`
                : ""}
            </Button>
            <ImportExportMenu
              siteId={siteId}
              siteDomain={siteDomain}
              range={range}
              query={reviewQuery}
              onApplied={invalidate}
            />
          </span>
        </div>
        <MatrxDataTable<GscClassReviewRow>
          data={rows}
          columns={columns}
          getRowId={(row) => row.keyword_id}
          isLoading={review.isLoading}
          isFetching={review.isFetching}
          query={{
            mode: "controlled",
            state: table.state,
            totalItems: total,
            onStateChange: table.onStateChange,
          }}
          toolbar={{ searchPlaceholder: "Search keywords…" }}
          copy={{
            label: "Keyword classification",
            listLabel: "Keyword classification review",
            location: webLocation(`Keyword classification — ${siteDomain}`),
            rowKind: "web-gsc-keyword-classification",
            listKind: "web-gsc-keyword-classification-rows",
            rowDescription:
              "One GSC-active keyword with its traffic class, provenance, and 28-day volume.",
            listDescription:
              "The site's GSC-active keywords with class + provenance (site value / brand match / AI intent / unclassified) and 28-day clicks/impressions — the manual truth-editing queue for traffic classification.",
            humanRow: (row) =>
              humanLines([
                ["Keyword", row.query],
                ["Class", row.traffic_class],
                ["Why", row.class_source],
                ["Impressions (28d)", formatCount(row.impressions)],
                ["Clicks (28d)", formatCount(row.clicks)],
                ["AI intent", row.intent_class],
                ["Notes", row.notes],
              ]),
            rowAttributes: (row) => ({
              site_id: siteId,
              keyword_id: row.keyword_id,
              traffic_class: row.traffic_class ?? "",
              class_source: row.class_source ?? "",
            }),
            listAttributes: (visible) => ({
              site_id: siteId,
              domain: siteDomain,
              window_start: range.start,
              window_end: range.end,
              visible_rows: visible.length,
              total_rows: total,
            }),
          }}
          detail={{ enabled: false }}
          window={{ enabled: false }}
          pageSize={50}
          emptyState={{
            icon: <Scale className="h-8 w-8 text-muted-foreground" />,
            title: preview
              ? "No keywords match this pattern"
              : "No GSC-active keywords in this window",
            description: preview
              ? "Try a looser match kind or a shorter pattern."
              : "Connect Google Search Console and run a sync, or loosen the class/source filters.",
          }}
          className="min-h-0 flex-1"
        />
      </div>

      {/* Rules sheet */}
      <Sheet open={rulesOpen} onOpenChange={setRulesOpen}>
        <SheetContent side="right" className="flex w-full flex-col sm:max-w-md">
          <SheetHeader>
            <SheetTitle className="text-sm">Pattern rules</SheetTitle>
          </SheetHeader>
          <ClassRulesPanel
            rules={rules.data ?? []}
            loading={rules.isLoading}
            currentUserId={userIdRef.current}
            previewRuleId={preview?.rule?.id ?? null}
            previewMatchCount={preview ? total : null}
            selectionPruned={excluded.size > 0}
            onPreview={(selectedRule) => {
              if (!selectedRule) {
                setPreview(null);
                setExcluded(new Set());
                return;
              }
              startPreview(selectedRule, selectedRule);
            }}
            onPreviewDraft={(draft) => startPreview(draft, null)}
            onCreate={async (draft) => {
              const created = await createClassRule(draft, siteId, organizationId);
              void queryClient.invalidateQueries({
                queryKey: ["marketing", "gsc", "class-rules"],
              });
              return created;
            }}
            onUpdate={async (ruleId, draft) => {
              const updated = await updateClassRule(ruleId, draft, siteId, organizationId);
              void queryClient.invalidateQueries({
                queryKey: ["marketing", "gsc", "class-rules"],
              });
              return updated;
            }}
            onDelete={async (ruleId) => {
              await deleteClassRule(ruleId);
              void queryClient.invalidateQueries({
                queryKey: ["marketing", "gsc", "class-rules"],
              });
            }}
            onAdopt={async (template) => {
              const adopted = await adoptClassTemplate(template, siteId, organizationId);
              void queryClient.invalidateQueries({
                queryKey: ["marketing", "gsc", "class-rules"],
              });
              return adopted;
            }}
          />
        </SheetContent>
      </Sheet>

      {/* Notes dialog (bulk + mismatch) */}
      <Dialog
        open={dialog !== null}
        onOpenChange={(open) => {
          if (!open) setDialog(null);
        }}
      >
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>
              {dialog?.ruling === "clear"
                ? `Clear rulings on ${dialog.label}`
                : `Classify ${dialog?.label ?? ""} as ${dialog?.ruling ?? ""}`}
            </DialogTitle>
            <DialogDescription>
              {dialog?.ruling === "mismatch"
                ? "A mismatch ruling must carry its case — say why this traffic can never serve the business (e.g. a service that is not offered)."
                : "Optionally record the reasoning. Notes are stored on the site's keyword valuation and shown in the review table."}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            placeholder={
              dialog?.ruling === "mismatch"
                ? "Required — why is this a mismatch?"
                : "Optional notes"
            }
            rows={3}
          />
          <DialogFooter>
            <Button type="button" variant="outline" onClick={() => setDialog(null)}>
              Cancel
            </Button>
            <Button
              type="button"
              disabled={
                classify.isPending ||
                (dialog?.ruling === "mismatch" && notes.trim() === "")
              }
              onClick={() => {
                if (!dialog) return;
                classify.mutate({
                  ruling: dialog.ruling,
                  keywordIds: dialog.keywordIds,
                  notes: notes.trim() || null,
                });
                setDialog(null);
              }}
            >
              Apply
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
