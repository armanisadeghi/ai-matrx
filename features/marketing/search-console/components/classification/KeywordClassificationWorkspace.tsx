"use client";

/**
 * Keyword classification — the dedicated manual truth-editing surface for
 * the GSC traffic-class system. Classification drives the Traffic quality /
 * Shifts / Juice / class-aware Dig views on /marketing/search-console, so
 * this table shows every GSC-active keyword for the site WITH its volume
 * (reviewing "crt tv" matters because it has 209k impressions), its class,
 * and its provenance — and lets a human rule on it, singly or in bulk.
 *
 * The class→column mapping lives server-side ONLY (`gsc_set_keyword_class`
 * beside the ONE resolver, `migrations/seo_keyword_classification_ui.sql`).
 * This surface never writes seo.site_keyword_value columns directly and
 * never derives a class client-side. Provenance is always visible; the
 * post-write chip state comes from the SERVER's resolved rows, not client
 * assumption. The AI interview/wizard is a separate program (aidream
 * `content-ir-agent-slots` handoff) — this is the manual surface it will
 * sit beside.
 */

import { useMemo, useState } from "react";
import { useMutation, useQuery, useQueryClient, keepPreviousData } from "@tanstack/react-query";
import { Scale, Tags } from "lucide-react";
import { toast } from "@/lib/toast";
import { MatrxDataTable } from "@/components/official/matrx-data-table/MatrxDataTable";
import type { MatrxColumnDef } from "@/components/official/matrx-data-table/types";
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
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/styles/themes/utils";
import { extractErrorMessage } from "@/utils/errors";
import { useMarketingSite } from "@/features/marketing/components/site/MarketingSiteLayoutClient";
import { useMarketingTableState } from "@/features/marketing/data/query-state";
import { humanLines, webLocation } from "@/features/marketing/lib/copy-payloads";
import { ClassChip } from "@/features/marketing/search-console/components/insights/ClassInsights";
import {
  getGscClassReview,
  setGscKeywordClass,
  type GscClassRuling,
} from "@/features/marketing/search-console/data-classification";
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

const RULINGS: readonly {
  key: Exclude<GscClassRuling, "clear">;
  label: string;
}[] = [
  { key: "money", label: "Money" },
  { key: "educational", label: "Educational" },
  { key: "brand", label: "Brand" },
  { key: "mismatch", label: "Mismatch" },
];

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

export function KeywordClassificationWorkspace() {
  const { site } = useMarketingSite();
  const queryClient = useQueryClient();
  const range = useMemo(reviewRange, []);
  const table = useMarketingTableState({
    defaultSort: { id: "impressions", direction: "desc" },
    defaultPageSize: 50,
  });
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  const [dialog, setDialog] = useState<{
    ruling: GscClassRuling;
    keywordIds: string[];
    label: string;
  } | null>(null);
  const [notes, setNotes] = useState("");

  const state = table.queryState;
  const classFilter = state.columnFilters.traffic_class;
  const sourceFilter = state.columnFilters.class_source;
  const sortId =
    state.sort && SORTABLE.has(state.sort.id) ? state.sort.id : "impressions";
  const review = useQuery({
    queryKey: [
      "marketing",
      "gsc",
      "class-review",
      site.id,
      range.start,
      range.end,
      state,
    ],
    queryFn: ({ signal }) =>
      getGscClassReview(
        site.id,
        range,
        {
          trafficClasses:
            classFilter?.kind === "select"
              ? ((classFilter.values?.length
                  ? classFilter.values
                  : classFilter.value
                    ? [classFilter.value]
                    : null) as GscTrafficClass[] | null)
              : null,
          sources:
            sourceFilter?.kind === "select"
              ? ((sourceFilter.values?.length
                  ? sourceFilter.values
                  : sourceFilter.value
                    ? [sourceFilter.value]
                    : null) as GscClassSource[] | null)
              : null,
          search: state.search,
          sort: sortId as "impressions" | "clicks" | "ctr" | "query",
          sortDir: state.sort?.direction === "asc" ? "asc" : "desc",
          page: state.page,
          pageSize: state.pageSize,
        },
        signal,
      ),
    staleTime: 60_000,
    placeholderData: keepPreviousData,
  });

  const rows = review.data?.rows ?? [];
  const total = review.data?.total ?? 0;

  const classify = useMutation({
    mutationFn: (input: {
      ruling: GscClassRuling;
      keywordIds: string[];
      notes: string | null;
    }) => setGscKeywordClass(site.id, input.keywordIds, input.ruling, input.notes),
    onSuccess: (resolved, input) => {
      const sources = new Set(resolved.map((r) => r.class_source));
      toast.success(
        input.ruling === "clear"
          ? `Cleared the override on ${resolved.length} keyword${resolved.length === 1 ? "" : "s"}`
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
      // Every class-aware read (summary, movers, shifts, juice, dig) is stale now.
      void queryClient.invalidateQueries({ queryKey: ["marketing", "gsc"] });
    },
    onError: (error) => {
      toast.error("Could not save the classification", {
        description: extractErrorMessage(error),
      });
    },
  });

  const apply = (ruling: GscClassRuling, keywordIds: string[], label: string) => {
    if (keywordIds.length === 0) return;
    if (ruling === "mismatch") {
      // A mismatch ruling must carry its case — notes are required.
      setNotes("");
      setDialog({ ruling, keywordIds, label });
      return;
    }
    if (keywordIds.length > 1) {
      // Bulk gets the shared-notes dialog for every ruling (notes optional).
      setNotes("");
      setDialog({ ruling, keywordIds, label });
      return;
    }
    classify.mutate({ ruling, keywordIds, notes: null });
  };

  const pageIds = rows.map((row) => row.keyword_id);
  const allPageSelected =
    pageIds.length > 0 && pageIds.every((id) => selected.has(id));

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
            setSelected((prev) => {
              const next = new Set(prev);
              for (const id of pageIds) {
                if (checked) next.add(id);
                else next.delete(id);
              }
              return next;
            });
          }}
        />
      ),
      cell: (row) => (
        <span onClick={(event) => event.stopPropagation()}>
          <Checkbox
            checked={selected.has(row.keyword_id)}
            aria-label={`Select ${row.query}`}
            onCheckedChange={(checked) => {
              setSelected((prev) => {
                const next = new Set(prev);
                if (checked) next.add(row.keyword_id);
                else next.delete(row.keyword_id);
                return next;
              });
            }}
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
      cell: (row) => <ClassChip trafficClass={row.traffic_class} />,
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
    {
      id: "ruling",
      header: "Set class",
      sortable: false,
      filter: false,
      cell: (row) => (
        <div
          className="flex items-center gap-0.5"
          onClick={(event) => event.stopPropagation()}
        >
          {RULINGS.map((ruling) => (
            <button
              key={ruling.key}
              type="button"
              disabled={classify.isPending}
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] transition-colors",
                row.traffic_class === ruling.key &&
                  row.class_source === "site_value"
                  ? "border-primary bg-accent font-semibold text-foreground"
                  : "border-border text-muted-foreground hover:bg-accent hover:text-foreground",
              )}
              title={`Classify “${row.query}” as ${ruling.label.toLowerCase()}`}
              onClick={() => apply(ruling.key, [row.keyword_id], row.query)}
            >
              {ruling.label}
            </button>
          ))}
          {/* Any site-value ruling is clearable — including legacy semantic-column
              rulings written before the explicit traffic_class column existed. */}
          {row.class_source === "site_value" ? (
            <button
              type="button"
              disabled={classify.isPending}
              className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-destructive"
              title="Remove the override — machine classification decides again"
              onClick={() => apply("clear", [row.keyword_id], row.query)}
            >
              Clear
            </button>
          ) : null}
        </div>
      ),
    },
  ];

  return (
    <div className="flex min-h-0 flex-1 flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-border bg-card p-3">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-sm font-semibold">
            <Tags className="h-4 w-4 text-primary" />
            Keyword classification
          </h2>
          <p className="mt-0.5 max-w-3xl text-[11px] text-muted-foreground">
            The truth layer behind Traffic quality, Shifts, Juice, and
            class-aware digs. Volume window {range.start} → {range.end}. Your
            ruling beats brand-match beats AI intent; the “Why” column always
            shows which one decided. Mismatch rulings require a note — a
            ruling must carry its case.
          </p>
        </div>
        <div className="rounded-md border border-border bg-muted/30 px-3 py-1.5 text-right">
          <p className="text-[10px] uppercase tracking-wide text-muted-foreground">
            GSC-active keywords
          </p>
          <p className="text-lg font-semibold tabular-nums">
            {formatCount(total)}
          </p>
        </div>
      </div>

      {selected.size > 0 ? (
        <div className="flex flex-wrap items-center gap-2 rounded-md border border-primary/40 bg-accent/40 px-3 py-2">
          <span className="text-xs font-medium">
            {selected.size} selected
          </span>
          {RULINGS.map((ruling) => (
            <Button
              key={ruling.key}
              type="button"
              size="sm"
              variant="outline"
              className="h-7 px-2 text-xs"
              disabled={classify.isPending}
              onClick={() =>
                apply(ruling.key, [...selected], `${selected.size} keywords`)
              }
            >
              {ruling.label}
            </Button>
          ))}
          <Button
            type="button"
            size="sm"
            variant="outline"
            className="h-7 px-2 text-xs text-muted-foreground"
            disabled={classify.isPending}
            onClick={() =>
              apply("clear", [...selected], `${selected.size} keywords`)
            }
          >
            Clear overrides
          </Button>
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

      <div className="min-h-[30rem] flex-1 rounded-lg border border-border bg-card p-2">
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
            location: webLocation(`Keyword classification — ${site.domain}`),
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
              site_id: site.id,
              keyword_id: row.keyword_id,
              traffic_class: row.traffic_class ?? "",
              class_source: row.class_source ?? "",
            }),
            listAttributes: (visible) => ({
              site_id: site.id,
              domain: site.domain,
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
            title: "No GSC-active keywords in this window",
            description:
              "Connect Google Search Console and run a sync, or loosen the class/source filters.",
          }}
          className="h-full"
        />
      </div>

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
                ? `Clear overrides on ${dialog.label}`
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
            <Button
              type="button"
              variant="outline"
              onClick={() => setDialog(null)}
            >
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
