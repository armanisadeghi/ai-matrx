"use client";

import React, { useState, useEffect, useCallback, useMemo } from "react";
import { extractErrorMessage } from "@/utils/errors";
import { compareTimestamps, parseTimestamp } from "@/utils/datetime";
import {
  RefreshCw,
  CheckCircle2,
  AlertCircle,
  Circle,
  ExternalLink,
  Plus,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  ChevronsUpDown,
  X,
  Copy,
  Check,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import ModelDetailSheet, { OpenDetailButton } from "../audit/ModelDetailSheet";
import AddProviderModelDialog from "./AddProviderModelDialog";
import {
  ProviderSyncPageCopyForAiButton,
  ProviderSyncProviderCopyForAiMenu,
  ProviderSyncRowCopyForAiButton,
} from "./ProviderSyncCopyForAi";
import {
  buildProviderSyncComparisons,
  countProviderSyncByStatus,
  type ProviderSyncComparison,
  type ProviderSyncComparisonStatus,
} from "../utils/providerSyncComparison";
import type { AiModel, AiProvider } from "../types";

// ─── Types ────────────────────────────────────────────────────────────────

type ProviderSummary = {
  id: string;
  name: string | null;
  has_cache: boolean;
  fetched_at: string | null;
  model_count: number;
  is_supported: boolean;
  provider_key: string | null;
};

type ComparisonStatus = ProviderSyncComparisonStatus;
type ModelComparison = ProviderSyncComparison;

type ComparisonSortKey =
  | "display_name"
  | "id"
  | "context"
  | "max_out"
  | "released"
  | "our_name"
  | "class"
  | "api_class"
  | "primary"
  | "deprecated"
  | "status";

type ComparisonSortDir = "asc" | "desc";

type Props = {
  localModels: AiModel[];
  providers: AiProvider[];
  onModelsChanged?: () => void;
};

// ─── Helpers ──────────────────────────────────────────────────────────────

const formatNum = (n?: number | null) =>
  n == null
    ? "—"
    : n >= 1_000_000
      ? `${(n / 1_000_000).toFixed(1)}M`
      : n.toLocaleString();

const formatDate = (d?: string | null) => {
  if (!d) return "—";
  try {
    return new Date(d).toLocaleDateString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
    });
  } catch {
    return d;
  }
};

function compareNullableNumbers(a?: number | null, b?: number | null): number {
  const aNull = a == null;
  const bNull = b == null;
  if (aNull && bNull) return 0;
  if (aNull) return 1;
  if (bNull) return -1;
  return a - b;
}

const STATUS_SORT_ORDER: Record<ComparisonStatus, number> = {
  matched: 0,
  missing_local: 1,
  excluded: 2,
  extra_local: 3,
};

function defaultSortDirForColumn(key: ComparisonSortKey): ComparisonSortDir {
  switch (key) {
    case "released":
    case "context":
    case "max_out":
    case "primary":
    case "deprecated":
      return "desc";
    default:
      return "asc";
  }
}

function compareComparisons(
  a: ModelComparison,
  b: ModelComparison,
  key: ComparisonSortKey,
  dir: ComparisonSortDir,
): number {
  const sign = dir === "asc" ? 1 : -1;
  const peA = a.providerEntry;
  const peB = b.providerEntry;
  const leA = a.localEntry;
  const leB = b.localEntry;

  let cmp = 0;
  switch (key) {
    case "display_name":
      cmp = a.display_name.localeCompare(b.display_name);
      break;
    case "id":
      cmp = a.id.localeCompare(b.id);
      break;
    case "context":
      cmp = compareNullableNumbers(
        peA?.max_input_tokens ?? leA?.context_window,
        peB?.max_input_tokens ?? leB?.context_window,
      );
      break;
    case "max_out":
      cmp = compareNullableNumbers(
        peA?.max_tokens ?? leA?.max_tokens,
        peB?.max_tokens ?? leB?.max_tokens,
      );
      break;
    case "released": {
      const dateA = peA?.created_at;
      const dateB = peB?.created_at;
      const hasA = parseTimestamp(dateA) != null;
      const hasB = parseTimestamp(dateB) != null;
      if (!hasA && !hasB) {
        cmp = 0;
      } else if (!hasA) {
        return 1;
      } else if (!hasB) {
        return -1;
      } else {
        cmp = compareTimestamps(dateA, dateB);
      }
      break;
    }
    case "our_name":
      cmp = (leA?.common_name ?? "").localeCompare(leB?.common_name ?? "");
      break;
    case "class":
      cmp = (leA?.model_class ?? "").localeCompare(leB?.model_class ?? "");
      break;
    case "api_class":
      cmp = (leA?.api_class ?? "").localeCompare(leB?.api_class ?? "");
      break;
    case "primary":
      cmp = Number(Boolean(leA?.is_primary)) - Number(Boolean(leB?.is_primary));
      break;
    case "deprecated":
      cmp =
        Number(Boolean(leA?.is_deprecated)) -
        Number(Boolean(leB?.is_deprecated));
      break;
    case "status":
      cmp = STATUS_SORT_ORDER[a.status] - STATUS_SORT_ORDER[b.status];
      break;
  }

  if (cmp !== 0) return cmp * sign;
  return a.id.localeCompare(b.id);
}

// ─── Status ───────────────────────────────────────────────────────────────

const STATUS_BG: Record<ComparisonStatus, string> = {
  matched: "bg-green-50/60 dark:bg-green-900/10",
  missing_local: "bg-amber-50/70 dark:bg-amber-900/15",
  excluded: "bg-muted/40 dark:bg-muted/20",
  extra_local: "bg-blue-50/50 dark:bg-blue-900/10",
};
const STATUS_BG_SEL: Record<ComparisonStatus, string> = {
  matched: "bg-green-100 dark:bg-green-900/30",
  missing_local: "bg-amber-100 dark:bg-amber-900/30",
  excluded: "bg-muted/60 dark:bg-muted/30",
  extra_local: "bg-blue-100 dark:bg-blue-900/30",
};
const STATUS_LEFT: Record<ComparisonStatus, string> = {
  matched: "border-l-green-400",
  missing_local: "border-l-amber-400",
  excluded: "border-l-muted-foreground/40",
  extra_local: "border-l-blue-400",
};

function StatusBadge({ status }: { status: ComparisonStatus }) {
  if (status === "matched")
    return (
      <Badge
        variant="outline"
        className="text-[10px] h-5 gap-1 bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-300 whitespace-nowrap"
      >
        <CheckCircle2 className="h-3 w-3" />
        Matched
      </Badge>
    );
  if (status === "missing_local")
    return (
      <Badge
        variant="outline"
        className="text-[10px] h-5 bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300 border-amber-300 whitespace-nowrap"
      >
        Not in DB
      </Badge>
    );
  if (status === "excluded")
    return (
      <Badge
        variant="outline"
        className="text-[10px] h-5 bg-muted/50 text-muted-foreground border-border whitespace-nowrap"
      >
        Excluded
      </Badge>
    );
  return (
    <Badge
      variant="outline"
      className="text-[10px] h-5 bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-300 whitespace-nowrap"
    >
      Extra / deprecated
    </Badge>
  );
}

// ─── Capability tree ──────────────────────────────────────────────────────

function CapNode({
  label,
  value,
  depth = 0,
}: {
  label: string;
  value: unknown;
  depth?: number;
}) {
  const [open, setOpen] = useState(depth < 2);
  if (value === null || value === undefined) return null;

  if (typeof value === "object" && !Array.isArray(value)) {
    const entries = Object.entries(value as Record<string, unknown>);
    const isSingleSupported =
      entries.length === 1 && entries[0][0] === "supported";
    if (isSingleSupported) {
      const sup = entries[0][1] as boolean;
      return (
        <div className="flex items-center gap-2 py-0.5">
          <span
            className="text-xs text-muted-foreground w-44 shrink-0 truncate"
            title={label}
          >
            {label}
          </span>
          <Badge
            variant="outline"
            className={`text-[10px] h-4 px-1 ${sup ? "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-300" : "bg-muted text-muted-foreground"}`}
          >
            {sup ? "yes" : "no"}
          </Badge>
        </div>
      );
    }
    return (
      <div className="py-0.5">
        <button
          onClick={() => setOpen((v) => !v)}
          className="flex items-center gap-1 text-xs text-foreground/80 hover:text-foreground font-medium"
        >
          {open ? (
            <ChevronDown className="h-3 w-3" />
          ) : (
            <ChevronRight className="h-3 w-3" />
          )}
          {label}
          <span className="text-[10px] text-muted-foreground font-normal ml-1">
            ({entries.length})
          </span>
        </button>
        {open && (
          <div className="ml-4 pl-2 border-l border-border mt-0.5">
            {entries.map(([k, v]) => (
              <CapNode key={k} label={k} value={v} depth={depth + 1} />
            ))}
          </div>
        )}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2 py-0.5">
      <span
        className="text-xs text-muted-foreground w-44 shrink-0 truncate"
        title={label}
      >
        {label}
      </span>
      <span className="text-xs font-mono">{String(value)}</span>
    </div>
  );
}

// ─── Copy button ──────────────────────────────────────────────────────────

function CopyBtn({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={() => {
        navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
      title="Copy"
    >
      {copied ? (
        <Check className="h-3.5 w-3.5 text-green-500" />
      ) : (
        <Copy className="h-3.5 w-3.5" />
      )}
    </button>
  );
}

// ─── Entry detail panel ───────────────────────────────────────────────────

function ProviderEntryDetail({
  comparison,
  onClose,
  onOpenModel,
  onAddMissing,
}: {
  comparison: ModelComparison;
  onClose: () => void;
  onOpenModel: (id: string) => void;
  onAddMissing: (c: ModelComparison) => void;
}) {
  const pe = comparison.providerEntry;
  const le = comparison.localEntry;
  const jsonStr = pe ? JSON.stringify(pe, null, 2) : null;

  return (
    <div className="flex flex-col h-full border-l bg-card overflow-hidden">
      {/* Header */}
      <div className="shrink-0 flex items-center justify-between px-3 py-2 border-b bg-muted/30">
        <div className="min-w-0">
          <p className="text-sm font-semibold truncate">
            {comparison.display_name}
          </p>
          <p className="text-[10px] font-mono text-muted-foreground truncate">
            {comparison.id}
          </p>
        </div>
        <div className="flex items-center gap-1.5 shrink-0 ml-2">
          <StatusBadge status={comparison.status} />
          {comparison.status === "matched" && le && (
            <OpenDetailButton onClick={() => onOpenModel(le.id)} />
          )}
          {comparison.status === "missing_local" && (
            <Button
              size="sm"
              variant="outline"
              className="h-6 px-2 text-[10px] gap-1 text-amber-700 border-amber-300 hover:bg-amber-50 dark:hover:bg-amber-900/20"
              onClick={() => onAddMissing(comparison)}
            >
              <Plus className="h-3 w-3" />
              Add to DB
            </Button>
          )}
          <button
            onClick={onClose}
            className="h-6 w-6 flex items-center justify-center rounded hover:bg-accent text-muted-foreground hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>

      <Tabs
        defaultValue="structured"
        className="flex-1 flex flex-col overflow-hidden min-h-0"
      >
        <div className="shrink-0 border-b px-3">
          <TabsList className="h-8 bg-transparent p-0 gap-0">
            {(["structured", "json", "our_db"] as const).map((t) => (
              <TabsTrigger
                key={t}
                value={t}
                className="h-8 rounded-none border-b-2 border-transparent data-[state=active]:border-primary data-[state=active]:bg-transparent text-xs px-3"
              >
                {t === "structured"
                  ? "Provider Data"
                  : t === "json"
                    ? "Raw JSON"
                    : "Our DB Record"}
              </TabsTrigger>
            ))}
          </TabsList>
        </div>

        <TabsContent
          value="structured"
          className="flex-1 m-0 overflow-auto min-h-0"
        >
          {pe ? (
            <div className="p-3 space-y-4">
              <section>
                <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                  Core Fields
                </p>
                <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                  {(
                    [
                      ["Display Name", pe.display_name ?? "—"],
                      ["Type", String(pe.type ?? "—")],
                      ["Context Window", formatNum(pe.max_input_tokens)],
                      ["Max Output Tokens", formatNum(pe.max_tokens)],
                      ["Released", formatDate(pe.created_at)],
                    ] as [string, string][]
                  ).map(([lbl, val]) => (
                    <div key={lbl}>
                      <p className="text-[10px] text-muted-foreground">{lbl}</p>
                      <p className="text-xs font-mono">{val}</p>
                    </div>
                  ))}
                </div>
              </section>

              {pe.capabilities && typeof pe.capabilities === "object" && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                    Capabilities
                  </p>
                  <div className="border rounded-md p-3 bg-muted/20">
                    {Object.entries(
                      pe.capabilities as Record<string, unknown>,
                    ).map(([k, v]) => (
                      <CapNode key={k} label={k} value={v} depth={0} />
                    ))}
                  </div>
                </section>
              )}

              {(() => {
                const known = new Set([
                  "id",
                  "display_name",
                  "created_at",
                  "type",
                  "max_input_tokens",
                  "max_tokens",
                  "capabilities",
                ]);
                const extra = Object.entries(pe).filter(([k]) => !known.has(k));
                if (!extra.length) return null;
                return (
                  <section>
                    <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-2">
                      Additional Fields
                    </p>
                    {extra.map(([k, v]) => (
                      <div key={k} className="flex items-start gap-3 py-0.5">
                        <span className="text-xs text-muted-foreground w-36 shrink-0">
                          {k}
                        </span>
                        <span className="text-xs font-mono break-all">
                          {typeof v === "object"
                            ? JSON.stringify(v, null, 2)
                            : String(v)}
                        </span>
                      </div>
                    ))}
                  </section>
                );
              })()}
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No provider data — this model is only in our DB
            </div>
          )}
        </TabsContent>

        <TabsContent value="json" className="flex-1 m-0 overflow-auto min-h-0">
          {jsonStr ? (
            <div className="relative h-full">
              <div className="absolute top-2 right-3 z-10">
                <CopyBtn text={jsonStr} />
              </div>
              <pre className="p-3 pt-8 text-[11px] font-mono text-foreground whitespace-pre-wrap break-all leading-relaxed">
                {jsonStr}
              </pre>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              No raw provider data
            </div>
          )}
        </TabsContent>

        <TabsContent
          value="our_db"
          className="flex-1 m-0 overflow-auto min-h-0"
        >
          {le ? (
            <div className="p-3 space-y-4">
              <div className="grid grid-cols-2 gap-x-4 gap-y-2">
                {(
                  [
                    ["name", le.name],
                    ["common_name", le.common_name ?? "—"],
                    ["model_class", le.model_class],
                    ["api_class", le.api_class ?? "—"],
                    ["provider", le.provider ?? "—"],
                    [
                      "context_window",
                      le.context_window?.toLocaleString() ?? "—",
                    ],
                    ["max_tokens", le.max_tokens?.toLocaleString() ?? "—"],
                    ["is_primary", String(le.is_primary ?? false)],
                    ["is_deprecated", String(le.is_deprecated ?? false)],
                    ["is_premium", String(le.is_premium ?? false)],
                  ] as [string, string][]
                ).map(([lbl, val]) => (
                  <div key={lbl}>
                    <p className="text-[10px] text-muted-foreground">{lbl}</p>
                    <p className="text-xs font-mono">{val}</p>
                  </div>
                ))}
              </div>
              {le.capabilities && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    capabilities
                  </p>
                  <div className="relative">
                    <div className="absolute top-2 right-2 z-10">
                      <CopyBtn
                        text={JSON.stringify(le.capabilities, null, 2)}
                      />
                    </div>
                    <pre className="p-2 pt-7 text-[11px] font-mono bg-muted/30 rounded border whitespace-pre-wrap break-all leading-relaxed">
                      {JSON.stringify(le.capabilities, null, 2)}
                    </pre>
                  </div>
                </section>
              )}
              {le.controls && (
                <section>
                  <p className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground mb-1">
                    controls
                  </p>
                  <div className="relative">
                    <div className="absolute top-2 right-2 z-10">
                      <CopyBtn text={JSON.stringify(le.controls, null, 2)} />
                    </div>
                    <pre className="p-2 pt-7 text-[11px] font-mono bg-muted/30 rounded border whitespace-pre-wrap break-all leading-relaxed">
                      {JSON.stringify(le.controls, null, 2)}
                    </pre>
                  </div>
                </section>
              )}
              <div className="flex items-center gap-2 pt-1">
                <OpenDetailButton onClick={() => onOpenModel(le.id)} />
                <span className="text-[10px] text-muted-foreground">
                  Open full editor
                </span>
              </div>
            </div>
          ) : (
            <div className="flex items-center justify-center h-32 text-sm text-muted-foreground">
              Not in our DB yet
            </div>
          )}
        </TabsContent>
      </Tabs>
    </div>
  );
}

// ─── Comparison table (real <table> for alignment) ────────────────────────

function SortableTH({
  sortKey,
  activeSortKey,
  activeSortDir,
  onSort,
  children,
  className = "",
}: {
  sortKey: ComparisonSortKey;
  activeSortKey: ComparisonSortKey;
  activeSortDir: ComparisonSortDir;
  onSort: (key: ComparisonSortKey) => void;
  children: React.ReactNode;
  className?: string;
}) {
  const isActive = activeSortKey === sortKey;
  return (
    <th
      className={`px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide whitespace-nowrap bg-muted/50 ${className}`}
    >
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 hover:text-foreground transition-colors ${
          isActive ? "text-foreground" : "text-muted-foreground"
        }`}
      >
        {children}
        {isActive ? (
          activeSortDir === "asc" ? (
            <ChevronUp className="h-3 w-3 shrink-0" />
          ) : (
            <ChevronDown className="h-3 w-3 shrink-0" />
          )
        ) : (
          <ChevronsUpDown className="h-3 w-3 shrink-0 opacity-40" />
        )}
      </button>
    </th>
  );
}

const STATIC_TH = ({
  children,
  className = "",
}: {
  children?: React.ReactNode;
  className?: string;
}) => (
  <th
    className={`px-2 py-1.5 text-left text-[10px] font-semibold uppercase tracking-wide text-muted-foreground whitespace-nowrap bg-muted/50 ${className}`}
  >
    {children}
  </th>
);

function ComparisonTable({
  comparisons,
  providerName,
  selectedId,
  onSelect,
  onOpenModel,
  onAddMissing,
}: {
  comparisons: ModelComparison[];
  providerName: string | null;
  selectedId: string | null;
  onSelect: (c: ModelComparison | null) => void;
  onOpenModel: (id: string) => void;
  onAddMissing: (c: ModelComparison) => void;
}) {
  const [sortKey, setSortKey] = useState<ComparisonSortKey>("released");
  const [sortDir, setSortDir] = useState<ComparisonSortDir>("desc");

  const toggleSort = (key: ComparisonSortKey) => {
    if (sortKey === key) {
      setSortDir((d) => (d === "asc" ? "desc" : "asc"));
      return;
    }
    setSortKey(key);
    setSortDir(defaultSortDirForColumn(key));
  };

  const sortedComparisons = useMemo(() => {
    const arr = [...comparisons];
    arr.sort((a, b) => compareComparisons(a, b, sortKey, sortDir));
    return arr;
  }, [comparisons, sortKey, sortDir]);

  if (comparisons.length === 0) {
    return (
      <div className="px-4 py-6 text-center text-xs text-muted-foreground border-t">
        No comparison data — sync this provider first.
      </div>
    );
  }

  return (
    <div className="border-t overflow-x-auto">
      <table className="w-full text-xs border-collapse">
        <thead>
          <tr className="border-b">
            <SortableTH
              sortKey="display_name"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
              className="pl-3"
            >
              Display Name
            </SortableTH>
            <SortableTH
              sortKey="id"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Model ID
            </SortableTH>
            <SortableTH
              sortKey="context"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Context
            </SortableTH>
            <SortableTH
              sortKey="max_out"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Max Out
            </SortableTH>
            <SortableTH
              sortKey="released"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Released
            </SortableTH>
            <SortableTH
              sortKey="our_name"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Our Name
            </SortableTH>
            <SortableTH
              sortKey="class"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Class
            </SortableTH>
            <SortableTH
              sortKey="api_class"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              API Class
            </SortableTH>
            <SortableTH
              sortKey="primary"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Primary
            </SortableTH>
            <SortableTH
              sortKey="deprecated"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Deprecated
            </SortableTH>
            <SortableTH
              sortKey="status"
              activeSortKey={sortKey}
              activeSortDir={sortDir}
              onSort={toggleSort}
            >
              Status
            </SortableTH>
            <STATIC_TH className="pr-3"></STATIC_TH>
          </tr>
        </thead>
        <tbody>
          {sortedComparisons.map((c) => {
            const isSelected = c.id === selectedId;
            const le = c.localEntry;
            const pe = c.providerEntry;
            const ctx = pe?.max_input_tokens ?? le?.context_window;
            const maxOut = pe?.max_tokens ?? le?.max_tokens;
            const released = pe?.created_at;

            const rowBg = isSelected
              ? STATUS_BG_SEL[c.status]
              : STATUS_BG[c.status];

            return (
              <tr
                key={c.id}
                onClick={() => onSelect(isSelected ? null : c)}
                className={`border-b last:border-b-0 cursor-pointer transition-colors border-l-2 ${STATUS_LEFT[c.status]} ${rowBg} hover:brightness-95 dark:hover:brightness-110`}
              >
                <td className="px-2 py-1.5 pl-3 font-medium whitespace-nowrap max-w-[160px]">
                  <span
                    className="truncate block max-w-[160px]"
                    title={c.display_name}
                  >
                    {c.display_name}
                  </span>
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap max-w-[200px]">
                  <span className="truncate block max-w-[200px]" title={c.id}>
                    {c.id}
                  </span>
                </td>
                <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                  {formatNum(ctx)}
                </td>
                <td className="px-2 py-1.5 tabular-nums whitespace-nowrap">
                  {formatNum(maxOut)}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap text-muted-foreground">
                  {formatDate(released)}
                </td>
                <td className="px-2 py-1.5 font-mono text-[10px] text-muted-foreground whitespace-nowrap max-w-[140px]">
                  <span
                    className="truncate block max-w-[140px]"
                    title={le?.common_name ?? ""}
                  >
                    {le?.common_name ?? "—"}
                  </span>
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {le?.model_class ?? "—"}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  {le?.api_class ?? "—"}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {le?.is_primary ? (
                    <CheckCircle2 className="h-3.5 w-3.5 text-green-500 mx-auto" />
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 text-center">
                  {le?.is_deprecated ? (
                    <span className="text-amber-500 font-medium">yes</span>
                  ) : (
                    <span className="text-muted-foreground">—</span>
                  )}
                </td>
                <td className="px-2 py-1.5 whitespace-nowrap">
                  <StatusBadge status={c.status} />
                </td>
                <td
                  className="px-2 py-1.5 pr-3"
                  onClick={(e) => e.stopPropagation()}
                >
                  <div className="flex items-center gap-1">
                    <ProviderSyncRowCopyForAiButton
                      comparison={c}
                      providerName={providerName}
                    />
                    {c.status === "matched" && le && (
                      <OpenDetailButton onClick={() => onOpenModel(le.id)} />
                    )}
                    {c.status === "missing_local" && (
                      <Button
                        size="sm"
                        variant="ghost"
                        className="h-5 px-1.5 text-[10px] gap-0.5 text-amber-600 hover:text-amber-700"
                        onClick={() => onAddMissing(c)}
                        title="Add this provider model to the database"
                      >
                        <Plus className="h-2.5 w-2.5" />
                        Add
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

// ─── Provider section ─────────────────────────────────────────────────────

function ProviderSection({
  summary,
  provider,
  localModels,
  onSync,
  syncing,
  onOpenModel,
  onAddMissing,
  onModelsChanged: _onModelsChanged,
}: {
  summary: ProviderSummary;
  provider: AiProvider | undefined;
  localModels: AiModel[];
  onSync: (s: ProviderSummary) => void;
  syncing: boolean;
  onOpenModel: (id: string) => void;
  onAddMissing: (c: ModelComparison, summary: ProviderSummary) => void;
  onModelsChanged?: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [selectedComparison, setSelectedComparison] =
    useState<ModelComparison | null>(null);

  const comparisons = React.useMemo<ModelComparison[]>(
    () => buildProviderSyncComparisons(summary, provider, localModels),
    [provider, localModels, summary],
  );

  const statusCounts = countProviderSyncByStatus(comparisons);
  const matched = statusCounts.matched;
  const missing = statusCounts.missing_local;
  const extra = statusCounts.extra_local;
  const excluded = statusCounts.excluded;

  const handleExpand = () => {
    if (expanded) setSelectedComparison(null);
    setExpanded((v) => !v);
  };

  return (
    <div className="border rounded-lg overflow-hidden">
      {/* Section header */}
      <div className="flex items-center gap-3 px-3 py-2 bg-card">
        <button
          onClick={() => summary.has_cache && handleExpand()}
          className={`shrink-0 text-muted-foreground ${summary.has_cache ? "hover:text-foreground cursor-pointer" : "cursor-default opacity-30"}`}
          disabled={!summary.has_cache}
        >
          {summary.has_cache ? (
            expanded ? (
              <ChevronDown className="h-4 w-4" />
            ) : (
              <ChevronRight className="h-4 w-4" />
            )
          ) : (
            <Circle className="h-4 w-4" />
          )}
        </button>

        {/* Provider name */}
        <div className="w-32 shrink-0">
          <span className="font-semibold text-sm">
            {summary.name ?? summary.id}
          </span>
          <div className="mt-0.5">
            {summary.is_supported ? (
              <Badge variant="outline" className="text-[9px] h-4 px-1">
                API sync
              </Badge>
            ) : (
              <Badge variant="secondary" className="text-[9px] h-4 px-1">
                Manual
              </Badge>
            )}
          </div>
        </div>

        {/* Counts */}
        <div className="flex-1 flex flex-wrap items-center gap-x-3 gap-y-0.5 min-w-0">
          {summary.has_cache ? (
            <>
              <span className="text-[11px] text-muted-foreground whitespace-nowrap">
                Synced{" "}
                {summary.fetched_at
                  ? new Date(summary.fetched_at).toLocaleString()
                  : "—"}
              </span>
              <span className="inline-flex items-center gap-0.5 text-[11px] font-medium text-green-700 dark:text-green-400 whitespace-nowrap">
                <CheckCircle2 className="h-3 w-3" />
                {matched} matched
              </span>
              {missing > 0 && (
                <span className="text-[11px] font-medium text-amber-600 dark:text-amber-400 whitespace-nowrap">
                  {missing} not in DB
                </span>
              )}
              {excluded > 0 && (
                <span className="text-[11px] font-medium text-muted-foreground whitespace-nowrap">
                  {excluded} excluded
                </span>
              )}
              {extra > 0 && (
                <span className="text-[11px] font-medium text-blue-600 dark:text-blue-400 whitespace-nowrap">
                  {extra} extra/deprecated
                </span>
              )}
            </>
          ) : (
            <span className="text-[11px] text-muted-foreground">
              No cache — sync to compare
            </span>
          )}
        </div>

        {/* Actions */}
        <div className="shrink-0 flex items-center gap-2">
          {summary.has_cache && (
            <ProviderSyncProviderCopyForAiMenu
              summary={summary}
              comparisons={comparisons}
            />
          )}
          {provider?.models_link && (
            <a
              href={provider.models_link}
              target="_blank"
              rel="noopener noreferrer"
              className="text-muted-foreground hover:text-foreground"
              title="Official models page"
            >
              <ExternalLink className="h-3.5 w-3.5" />
            </a>
          )}
          {summary.is_supported && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 px-2.5 text-xs gap-1.5"
              onClick={() => onSync(summary)}
              disabled={syncing}
            >
              <RefreshCw
                className={`h-3.5 w-3.5 ${syncing ? "animate-spin" : ""}`}
              />
              {syncing ? "Syncing…" : "Sync Now"}
            </Button>
          )}
        </div>
      </div>

      {/* Comparison area: table left, detail panel right */}
      {expanded && (
        <div className="border-t flex divide-x" style={{ minHeight: "200px" }}>
          <div
            className={
              selectedComparison
                ? "w-1/2 overflow-auto"
                : "w-full overflow-auto"
            }
          >
            <ComparisonTable
              comparisons={comparisons}
              providerName={summary.name}
              selectedId={selectedComparison?.id ?? null}
              onSelect={setSelectedComparison}
              onOpenModel={onOpenModel}
              onAddMissing={(c) => onAddMissing(c, summary)}
            />
          </div>
          {selectedComparison && (
            <div
              className="w-1/2 overflow-hidden flex flex-col"
              style={{ minHeight: "200px" }}
            >
              <ProviderEntryDetail
                comparison={selectedComparison}
                onClose={() => setSelectedComparison(null)}
                onOpenModel={onOpenModel}
                onAddMissing={(c) => onAddMissing(c, summary)}
              />
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ─── Dashboard root ────────────────────────────────────────────────────────

export default function ProviderSyncDashboard({
  localModels,
  providers,
  onModelsChanged,
}: Props) {
  const [summaries, setSummaries] = useState<ProviderSummary[]>([]);
  const [syncingId, setSyncingId] = useState<string | null>(null);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [syncSuccess, setSyncSuccess] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sheetModelId, setSheetModelId] = useState<string | null>(null);
  const [addTarget, setAddTarget] = useState<{
    comparison: ModelComparison;
    summary: ProviderSummary;
  } | null>(null);

  const loadSummaries = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch("/api/ai-models/provider-sync");
      if (!res.ok) throw new Error(await res.text());
      const json = (await res.json()) as { providers: ProviderSummary[] };
      setSummaries(json.providers);
    } catch (err) {
      console.error("[ProviderSyncDashboard] load error", err);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadSummaries();
  }, [loadSummaries]);

  const handleSync = async (summary: ProviderSummary) => {
    if (!summary.provider_key) return;
    setSyncingId(summary.id);
    setSyncError(null);
    setSyncSuccess(null);
    try {
      const res = await fetch("/api/ai-models/provider-sync", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          provider_id: summary.id,
          provider_key: summary.provider_key,
        }),
      });
      const json = (await res.json()) as {
        success?: boolean;
        error?: string;
        model_count?: number;
      };
      if (!res.ok || json.error) {
        setSyncError(json.error ?? `Sync failed (${res.status})`);
      } else {
        setSyncSuccess(
          `Synced ${json.model_count ?? 0} models from ${summary.name}`,
        );
        await loadSummaries();
        onModelsChanged?.();
      }
    } catch (err) {
      setSyncError(extractErrorMessage(err));
    } finally {
      setSyncingId(null);
    }
  };

  const providerMap = new Map(providers.map((p) => [p.id, p]));
  const pageExports = useMemo(
    () =>
      summaries.map((summary) => ({
        summary,
        comparisons: buildProviderSyncComparisons(
          summary,
          providerMap.get(summary.id),
          localModels,
        ),
      })),
    [summaries, providers, localModels],
  );
  const totalProviderModels = summaries.reduce(
    (acc, s) => acc + s.model_count,
    0,
  );
  const syncedCount = summaries.filter((s) => s.has_cache).length;
  const supportedCount = summaries.filter((s) => s.is_supported).length;

  return (
    <div className="flex flex-col h-full min-h-0 overflow-hidden">
      {/* ── Compact toolbar ── */}
      <div className="shrink-0 flex items-center gap-4 px-4 py-2 border-b bg-card">
        {/* Stats */}
        {!loading && (
          <div className="flex items-center gap-4">
            {[
              { value: summaries.length, label: "Providers" },
              { value: supportedCount, label: "API sync" },
              { value: syncedCount, label: "Synced" },
              { value: totalProviderModels, label: "Cached" },
              { value: localModels.length, label: "In DB" },
            ].map(({ value, label }) => (
              <div key={label} className="flex items-baseline gap-1">
                <span className="text-sm font-bold tabular-nums">{value}</span>
                <span className="text-[10px] text-muted-foreground">
                  {label}
                </span>
              </div>
            ))}
          </div>
        )}

        {/* Spacer */}
        <div className="flex-1" />

        {/* Legend */}
        <div className="flex items-center gap-3 text-[11px] text-muted-foreground">
          {[
            { color: "bg-green-400", label: "Matched" },
            { color: "bg-amber-400", label: "Not in DB" },
            { color: "bg-muted-foreground/50", label: "Excluded" },
            { color: "bg-blue-400", label: "Extra/deprecated" },
          ].map(({ color, label }) => (
            <span key={label} className="inline-flex items-center gap-1.5">
              <span className={`h-2 w-2 rounded-sm ${color}`} />
              {label}
            </span>
          ))}
        </div>

        {/* Refresh + page copy */}
        <ProviderSyncPageCopyForAiButton
          exports={pageExports}
          disabled={loading}
        />
        <Button
          variant="ghost"
          size="sm"
          className="h-7 gap-1.5 text-xs"
          onClick={loadSummaries}
          disabled={loading}
        >
          <RefreshCw
            className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`}
          />
          Refresh
        </Button>
      </div>

      {/* Notifications */}
      {(syncError || syncSuccess) && (
        <div
          className={`shrink-0 flex items-center gap-2 px-4 py-1.5 text-sm border-b ${
            syncError
              ? "bg-destructive/10 text-destructive"
              : "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
          }`}
        >
          {syncError ? (
            <AlertCircle className="h-4 w-4 shrink-0" />
          ) : (
            <CheckCircle2 className="h-4 w-4 shrink-0" />
          )}
          <span className="flex-1 text-xs">{syncError ?? syncSuccess}</span>
          <button
            onClick={() => {
              setSyncError(null);
              setSyncSuccess(null);
            }}
            className="text-[10px] underline"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Provider list */}
      <ScrollArea className="flex-1 min-h-0">
        <div className="p-3 space-y-2">
          {loading ? (
            Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-10 w-full rounded-lg" />
            ))
          ) : summaries.length === 0 ? (
            <div className="text-center py-16 text-sm text-muted-foreground">
              No providers found.
            </div>
          ) : (
            summaries.map((summary) => (
              <ProviderSection
                key={summary.id}
                summary={summary}
                provider={providerMap.get(summary.id)}
                localModels={localModels}
                onSync={handleSync}
                syncing={syncingId === summary.id}
                onOpenModel={setSheetModelId}
                onAddMissing={(comparison, s) =>
                  setAddTarget({ comparison, summary: s })
                }
                onModelsChanged={onModelsChanged}
              />
            ))
          )}
        </div>
      </ScrollArea>

      <ModelDetailSheet
        modelId={sheetModelId}
        allModels={localModels}
        onClose={() => setSheetModelId(null)}
        onSaved={() => {
          onModelsChanged?.();
          setSheetModelId(null);
        }}
      />

      <AddProviderModelDialog
        open={!!addTarget}
        onOpenChange={(o) => {
          if (!o) setAddTarget(null);
        }}
        providerEntry={addTarget?.comparison.providerEntry ?? null}
        providerId={addTarget?.summary.id ?? ""}
        providerName={addTarget?.summary.name ?? null}
        provider={addTarget ? providerMap.get(addTarget.summary.id) : undefined}
        localModels={localModels}
        onCreated={(created, openEditor) => {
          setSyncSuccess(
            `Added "${created.common_name ?? created.name}" to database`,
          );
          onModelsChanged?.();
          if (openEditor) setSheetModelId(created.id);
        }}
      />
    </div>
  );
}
