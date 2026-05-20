"use client";

import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@/components/ui/tooltip";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import GenericTablePagination from "@/components/generic-table/GenericTablePagination";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  Eye,
  Pencil,
  Trash2,
  Copy,
  BrainCircuit,
  ArrowUp,
  ArrowDown,
  ArrowUpDown,
  ListFilter,
} from "lucide-react";
import type { AiModel, AiProvider } from "../types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { aiModelSummary, AI_MODELS_LOCATION } from "../format";
import type { TabState, AiModelFilters } from "../hooks/useTabUrlState";
import AiModelFilterBar from "./AiModelFilterBar";

// ─── Provider Colors ──────────────────────────────────────────────────────────

const PROVIDER_COLORS: Record<string, string> = {
  anthropic:
    "bg-orange-50 dark:bg-orange-900/20 text-orange-700 dark:text-orange-300 border-orange-200 dark:border-orange-800",
  openai:
    "bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300 border-green-200 dark:border-green-800",
  google:
    "bg-blue-50 dark:bg-blue-900/20 text-blue-700 dark:text-blue-300 border-blue-200 dark:border-blue-800",
  meta: "bg-indigo-50 dark:bg-indigo-900/20 text-indigo-700 dark:text-indigo-300 border-indigo-200 dark:border-indigo-800",
  mistral:
    "bg-purple-50 dark:bg-purple-900/20 text-purple-700 dark:text-purple-300 border-purple-200 dark:border-purple-800",
  mixtral:
    "bg-violet-50 dark:bg-violet-900/20 text-violet-700 dark:text-violet-300 border-violet-200 dark:border-violet-800",
  xai: "bg-zinc-50 dark:bg-zinc-900/20 text-zinc-700 dark:text-zinc-300 border-zinc-200 dark:border-zinc-800",
  groq: "bg-teal-50 dark:bg-teal-900/20 text-teal-700 dark:text-teal-300 border-teal-200 dark:border-teal-800",
  "ai matrx":
    "bg-rose-50 dark:bg-rose-900/20 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800",
  "black forest":
    "bg-slate-50 dark:bg-slate-900/20 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-800",
  deepseek:
    "bg-cyan-50 dark:bg-cyan-900/20 text-cyan-700 dark:text-cyan-300 border-cyan-200 dark:border-cyan-800",
  microsoft:
    "bg-sky-50 dark:bg-sky-900/20 text-sky-700 dark:text-sky-300 border-sky-200 dark:border-sky-800",
  qwen: "bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-300 border-yellow-200 dark:border-yellow-800",
  together:
    "bg-lime-50 dark:bg-lime-900/20 text-lime-700 dark:text-lime-300 border-lime-200 dark:border-lime-800",
  wan: "bg-neutral-50 dark:bg-neutral-900/20 text-neutral-700 dark:text-neutral-300 border-neutral-200 dark:border-neutral-800",
  cerebras_chat:
    "bg-fuchsia-50 dark:bg-fuchsia-900/20 text-fuchsia-700 dark:text-fuchsia-300 border-fuchsia-200 dark:border-fuchsia-800",
};

function providerColor(name: string | null): string {
  const key = (name ?? "").toLowerCase();
  return PROVIDER_COLORS[key] ?? "bg-muted text-muted-foreground border-border";
}

// ─── Cell Helpers ─────────────────────────────────────────────────────────────

function formatNumber(n: number | null): string {
  if (n === null || n === undefined) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function BoolBadge({
  value,
  trueLabel,
  trueClass,
}: {
  value: boolean | null;
  trueLabel: string;
  trueClass: string;
}) {
  if (!value) return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <Badge variant="outline" className={`text-xs ${trueClass}`}>
      {trueLabel}
    </Badge>
  );
}

function JsonSummaryBadge({ data, label }: { data: unknown; label?: string }) {
  if (data === null || data === undefined)
    return <span className="text-muted-foreground text-xs">—</span>;
  if (Array.isArray(data)) {
    return (
      <Badge variant="outline" className="text-xs font-mono">
        [{data.length}] {label}
      </Badge>
    );
  }
  if (typeof data === "object") {
    const keys = Object.keys(data as object);
    return (
      <Badge variant="outline" className="text-xs font-mono">
        {keys.length} {label ?? "keys"}
      </Badge>
    );
  }
  return <span className="text-xs font-mono">{String(data)}</span>;
}

function EndpointsList({ data }: { data: unknown }) {
  if (!Array.isArray(data) || data.length === 0)
    return <span className="text-muted-foreground text-xs">—</span>;
  return (
    <div className="flex flex-wrap gap-1">
      {(data as string[]).slice(0, 2).map((ep) => (
        <Badge
          key={ep}
          variant="outline"
          className="text-xs font-mono px-1 py-0"
        >
          {ep}
        </Badge>
      ))}
      {data.length > 2 && (
        <Badge variant="outline" className="text-xs">
          +{data.length - 2}
        </Badge>
      )}
    </div>
  );
}

function UuidCell({ value }: { value: string }) {
  const [copied, setCopied] = React.useState(false);
  const copy = (e: React.MouseEvent) => {
    e.stopPropagation();
    navigator.clipboard.writeText(value);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };
  return (
    <TooltipProvider delayDuration={300}>
      <Tooltip>
        <TooltipTrigger asChild>
          <span className="flex items-center gap-1 text-xs font-mono text-muted-foreground group cursor-default">
            {value.slice(0, 8)}…
            <button
              onClick={copy}
              className="opacity-0 group-hover:opacity-100 transition-opacity rounded hover:text-foreground"
              title="Copy full ID"
            >
              {copied ? (
                <span className="text-green-500 text-xs">✓</span>
              ) : (
                <Copy className="h-3 w-3" />
              )}
            </button>
          </span>
        </TooltipTrigger>
        <TooltipContent side="bottom">
          <p className="font-mono text-xs">{value}</p>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

const SORT_FIELDS = [
  "id",
  "common_name",
  "name",
  "provider",
  "model_class",
  "api_class",
  "model_provider",
  "context_window",
  "max_tokens",
  "is_deprecated",
  "is_primary",
  "is_premium",
];

interface ColDef {
  key: keyof AiModel;
  header: string;
  width: string;
  sortable: boolean;
  filterType?: FilterType;
  className?: string;
  render: (
    item: AiModel,
    providerMap: Record<string, string>,
  ) => React.ReactNode;
}

const COLUMNS: ColDef[] = [
  {
    key: "id",
    header: "ID",
    width: "w-[120px] min-w-[120px]",
    sortable: true,
    render: (item) => <UuidCell value={item.id} />,
  },
  {
    key: "common_name",
    header: "Display Name",
    width: "w-[180px] min-w-[140px]",
    sortable: true,
    render: (item) => (
      <span
        className="text-xs font-medium truncate block max-w-[170px]"
        title={item.common_name ?? item.name}
      >
        {item.common_name || item.name}
      </span>
    ),
  },
  {
    key: "name",
    header: "Model Name",
    width: "w-[200px] min-w-[160px]",
    sortable: true,
    render: (item) => (
      <span
        className="text-xs font-mono text-muted-foreground truncate block max-w-[190px]"
        title={item.name}
      >
        {item.name}
      </span>
    ),
  },
  {
    key: "provider",
    header: "Provider",
    width: "w-[120px] min-w-[100px]",
    sortable: true,
    filterType: "provider",
    render: (item) => (
      <Badge
        variant="outline"
        className={`text-xs ${providerColor(item.provider)}`}
      >
        {item.provider ?? "—"}
      </Badge>
    ),
  },
  {
    key: "model_class",
    header: "Model Class",
    width: "w-[180px] min-w-[140px]",
    sortable: true,
    filterType: "model_class",
    render: (item) => (
      <span
        className="text-xs font-mono text-muted-foreground truncate block max-w-[170px]"
        title={item.model_class}
      >
        {item.model_class}
      </span>
    ),
  },
  {
    key: "api_class",
    header: "API Class",
    width: "w-[160px] min-w-[120px]",
    sortable: true,
    filterType: "api_class",
    render: (item) => (
      <span
        className="text-xs font-mono text-muted-foreground truncate block max-w-[150px]"
        title={item.api_class ?? ""}
      >
        {item.api_class ?? "—"}
      </span>
    ),
  },
  {
    key: "model_provider",
    header: "Provider FK",
    width: "w-[120px] min-w-[100px]",
    sortable: true,
    render: (item, providerMap) => (
      <span className="text-xs text-muted-foreground font-mono">
        {item.model_provider
          ? (providerMap[item.model_provider] ??
            item.model_provider.slice(0, 8) + "…")
          : "—"}
      </span>
    ),
  },
  {
    key: "context_window",
    header: "Context",
    width: "w-[80px] min-w-[70px]",
    sortable: true,
    filterType: "context_window",
    className: "text-right",
    render: (item) => (
      <span className="text-xs tabular-nums">
        {formatNumber(item.context_window)}
      </span>
    ),
  },
  {
    key: "max_tokens",
    header: "Max Tokens",
    width: "w-[90px] min-w-[80px]",
    sortable: true,
    filterType: "max_tokens",
    className: "text-right",
    render: (item) => (
      <span className="text-xs tabular-nums">
        {formatNumber(item.max_tokens)}
      </span>
    ),
  },
  {
    key: "endpoints",
    header: "Endpoints",
    width: "w-[180px] min-w-[140px]",
    sortable: false,
    render: (item) => <EndpointsList data={item.endpoints} />,
  },
  {
    key: "capabilities",
    header: "Capabilities",
    width: "w-[100px] min-w-[90px]",
    sortable: false,
    render: (item) => (
      <JsonSummaryBadge data={item.capabilities} label="caps" />
    ),
  },
  {
    key: "controls",
    header: "Controls",
    width: "w-[90px] min-w-[80px]",
    sortable: false,
    render: (item) => <JsonSummaryBadge data={item.controls} label="ctrl" />,
  },
  {
    key: "constraints",
    header: "Constraints",
    width: "w-[100px] min-w-[80px]",
    sortable: false,
    render: (item) => (
      <JsonSummaryBadge data={item.constraints} label="rules" />
    ),
  },
  {
    key: "is_deprecated",
    header: "Deprecated",
    width: "w-[90px] min-w-[80px]",
    sortable: true,
    filterType: "is_deprecated",
    render: (item) => (
      <BoolBadge
        value={item.is_deprecated}
        trueLabel="Deprecated"
        trueClass="bg-red-50 dark:bg-red-900/20 text-red-700 dark:text-red-300"
      />
    ),
  },
  {
    key: "is_primary",
    header: "Primary",
    width: "w-[75px] min-w-[70px]",
    sortable: true,
    filterType: "is_primary",
    render: (item) => (
      <BoolBadge
        value={item.is_primary}
        trueLabel="Primary"
        trueClass="bg-green-50 dark:bg-green-900/20 text-green-700 dark:text-green-300"
      />
    ),
  },
  {
    key: "is_premium",
    header: "Premium",
    width: "w-[75px] min-w-[70px]",
    sortable: true,
    filterType: "is_premium",
    render: (item) => (
      <BoolBadge
        value={item.is_premium}
        trueLabel="Premium"
        trueClass="bg-amber-50 dark:bg-amber-900/20 text-amber-700 dark:text-amber-300"
      />
    ),
  },
  {
    key: "pricing",
    header: "Pricing",
    width: "w-[130px] min-w-[110px]",
    sortable: false,
    render: (item) => {
      if (!item.pricing || item.pricing.length === 0) {
        return <span className="text-xs text-muted-foreground/40">—</span>;
      }
      const tier = item.pricing[item.pricing.length - 1];
      const fmt = (v: number | null) =>
        v == null ? "—" : `$${v.toFixed(v < 0.1 ? 3 : 2)}`;
      return (
        <div className="text-xs font-mono leading-tight">
          <span className="text-foreground">{fmt(tier.input_price)}</span>
          <span className="text-muted-foreground mx-0.5">/</span>
          <span className="text-foreground">{fmt(tier.output_price)}</span>
          {item.pricing.length > 1 && (
            <span className="ml-1 text-muted-foreground/60">
              ({item.pricing.length}T)
            </span>
          )}
        </div>
      );
    },
  },
];

// ─── Filtering & Sorting helpers ─────────────────────────────────────────────

function applyFilters(
  models: AiModel[],
  q: string,
  filters: AiModelFilters,
): AiModel[] {
  let result = models;

  if (q) {
    const lq = q.toLowerCase();
    result = result.filter(
      (m) =>
        m.id.toLowerCase().includes(lq) ||
        (m.name ?? "").toLowerCase().includes(lq) ||
        (m.common_name ?? "").toLowerCase().includes(lq) ||
        (m.provider ?? "").toLowerCase().includes(lq) ||
        (m.model_class ?? "").toLowerCase().includes(lq) ||
        (m.api_class ?? "").toLowerCase().includes(lq),
    );
  }

  if (filters.provider) {
    result = result.filter((m) => m.provider === filters.provider);
  }
  if (filters.is_deprecated !== undefined) {
    result = result.filter(
      (m) => (m.is_deprecated ?? false) === filters.is_deprecated,
    );
  }
  if (filters.is_primary !== undefined) {
    result = result.filter(
      (m) => (m.is_primary ?? false) === filters.is_primary,
    );
  }
  if (filters.is_premium !== undefined) {
    result = result.filter(
      (m) => (m.is_premium ?? false) === filters.is_premium,
    );
  }
  if (filters.api_class) {
    result = result.filter((m) => m.api_class === filters.api_class);
  }
  if (filters.model_class) {
    result = result.filter((m) => m.model_class === filters.model_class);
  }
  if (filters.context_window_min !== undefined) {
    result = result.filter(
      (m) => (m.context_window ?? 0) >= filters.context_window_min!,
    );
  }
  if (filters.context_window_max !== undefined) {
    result = result.filter(
      (m) => (m.context_window ?? Infinity) <= filters.context_window_max!,
    );
  }
  if (filters.max_tokens_min !== undefined) {
    result = result.filter(
      (m) => (m.max_tokens ?? 0) >= filters.max_tokens_min!,
    );
  }
  if (filters.max_tokens_max !== undefined) {
    result = result.filter(
      (m) => (m.max_tokens ?? Infinity) <= filters.max_tokens_max!,
    );
  }

  return result;
}

function applySort(
  models: AiModel[],
  sort: string,
  dir: "asc" | "desc",
): AiModel[] {
  return [...models].sort((a, b) => {
    const aVal = String(a[sort as keyof AiModel] ?? "");
    const bVal = String(b[sort as keyof AiModel] ?? "");
    const cmp = aVal.localeCompare(bVal, undefined, { numeric: true });
    return dir === "asc" ? cmp : -cmp;
  });
}

// ─── Row Actions ─────────────────────────────────────────────────────────────

interface RowActionsProps {
  item: AiModel;
  onView: (item: AiModel) => void;
  onEdit: (item: AiModel) => void;
  onDuplicate: (item: AiModel) => void;
  onDelete: (item: AiModel) => void;
}

function RowActions({
  item,
  onView,
  onEdit,
  onDuplicate,
  onDelete,
}: RowActionsProps) {
  const [pendingDelete, setPendingDelete] = React.useState(false);

  return (
    <>
      <div className="flex items-center gap-0.5 opacity-0 group-hover:opacity-100 transition-opacity">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="View"
          onClick={(e) => {
            e.stopPropagation();
            onView(item);
          }}
        >
          <Eye className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Edit"
          onClick={(e) => {
            e.stopPropagation();
            onEdit(item);
          }}
        >
          <Pencil className="h-3.5 w-3.5" />
        </Button>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6"
          title="Duplicate"
          onClick={(e) => {
            e.stopPropagation();
            onDuplicate(item);
          }}
        >
          <Copy className="h-3.5 w-3.5" />
        </Button>
        <span onClick={(e) => e.stopPropagation()} className="contents">
          <CopyButtons
            size="icon"
            label={item.common_name || item.name}
            human={() => aiModelSummary(item)}
            agent={() => ({
              kind: "ai-model",
              location: AI_MODELS_LOCATION,
              description: "A single AI model registry row.",
              data: item,
              summary: aiModelSummary(item),
              attributes: {
                id: item.id,
                provider: item.model_provider ?? item.provider ?? "",
              },
            })}
          />
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:text-destructive hover:bg-destructive/10"
          title="Delete"
          onClick={(e) => {
            e.stopPropagation();
            setPendingDelete(true);
          }}
        >
          <Trash2 className="h-3.5 w-3.5" />
        </Button>
      </div>

      <AlertDialog open={pendingDelete} onOpenChange={setPendingDelete}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              Delete &quot;{item.common_name || item.name}&quot;?
            </AlertDialogTitle>
            <AlertDialogDescription>
              This will permanently delete the model &quot;
              {item.common_name || item.name}&quot; ({item.name}). Any prompts
              or builtins using this model will lose their reference. This
              cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={() => {
                setPendingDelete(false);
                onDelete(item);
              }}
            >
              Delete Model
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}

// ─── Sort Icon ────────────────────────────────────────────────────────────────

function SortIcon({
  field,
  sortBy,
  dir,
}: {
  field: string;
  sortBy: string;
  dir: "asc" | "desc";
}) {
  if (field !== sortBy) return <ArrowUpDown className="h-3 w-3 opacity-30" />;
  return dir === "asc" ? (
    <ArrowUp className="h-3 w-3 text-primary" />
  ) : (
    <ArrowDown className="h-3 w-3 text-primary" />
  );
}

// ─── Column Filter ────────────────────────────────────────────────────────────

type FilterType =
  | "provider"
  | "model_class"
  | "api_class"
  | "is_deprecated"
  | "is_primary"
  | "is_premium"
  | "context_window"
  | "max_tokens";

interface FilterOptions {
  providers: string[];
  modelClasses: string[];
  apiClasses: string[];
}

function isFilterActive(
  filterType: FilterType,
  filters: AiModelFilters,
): boolean {
  switch (filterType) {
    case "provider":
      return !!filters.provider;
    case "model_class":
      return !!filters.model_class;
    case "api_class":
      return !!filters.api_class;
    case "is_deprecated":
      return filters.is_deprecated !== undefined;
    case "is_primary":
      return filters.is_primary !== undefined;
    case "is_premium":
      return filters.is_premium !== undefined;
    case "context_window":
      return (
        filters.context_window_min !== undefined ||
        filters.context_window_max !== undefined
      );
    case "max_tokens":
      return (
        filters.max_tokens_min !== undefined ||
        filters.max_tokens_max !== undefined
      );
  }
}

function SelectFilterContent({
  label,
  value,
  options,
  onChange,
  onClear,
}: {
  label: string;
  value: string | undefined;
  options: { value: string; label: string }[];
  onChange: (v: string) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[160px]">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Filter: {label}
      </p>
      <Select
        value={value ?? "__all__"}
        onValueChange={(v) => (v === "__all__" ? onClear() : onChange(v))}
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          {options.map((o) => (
            <SelectItem key={o.value} value={o.value}>
              {o.label}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {value !== undefined && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={onClear}
        >
          Clear filter
        </Button>
      )}
    </div>
  );
}

function BoolFilterContent({
  label,
  value,
  trueLabel,
  falseLabel,
  onChange,
  onClear,
}: {
  label: string;
  value: boolean | undefined;
  trueLabel: string;
  falseLabel: string;
  onChange: (v: boolean) => void;
  onClear: () => void;
}) {
  return (
    <div className="flex flex-col gap-2 w-[150px]">
      <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
        Filter: {label}
      </p>
      <Select
        value={value === true ? "true" : value === false ? "false" : "__all__"}
        onValueChange={(v) =>
          v === "__all__" ? onClear() : onChange(v === "true")
        }
      >
        <SelectTrigger className="h-7 text-xs">
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value="__all__">All</SelectItem>
          <SelectItem value="true">{trueLabel}</SelectItem>
          <SelectItem value="false">{falseLabel}</SelectItem>
        </SelectContent>
      </Select>
      {value !== undefined && (
        <Button
          variant="ghost"
          size="sm"
          className="h-6 text-xs text-muted-foreground"
          onClick={onClear}
        >
          Clear filter
        </Button>
      )}
    </div>
  );
}

function RangeFilterContent({
  label,
  minKey,
  maxKey,
  minValue,
  maxValue,
  onUpdateFilters,
}: {
  label: string;
  minKey: "context_window_min" | "max_tokens_min";
  maxKey: "context_window_max" | "max_tokens_max";
  minValue: number | undefined;
  maxValue: number | undefined;
  onUpdateFilters: (patch: Partial<AiModelFilters>) => void;
}) {
  const [min, setMin] = React.useState(
    minValue !== undefined ? String(minValue) : "",
  );
  const [max, setMax] = React.useState(
    maxValue !== undefined ? String(maxValue) : "",
  );

  React.useEffect(() => {
    setMin(minValue !== undefined ? String(minValue) : "");
  }, [minValue]);
  React.useEffect(() => {
    setMax(maxValue !== undefined ? String(maxValue) : "");
  }, [maxValue]);

  const commitMin = (raw: string) => {
    if (raw === "") {
      onUpdateFilters({ [minKey]: undefined });
      return;
    }
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) onUpdateFilters({ [minKey]: n });
  };
  const commitMax = (raw: string) => {
    if (raw === "") {
      onUpdateFilters({ [maxKey]: undefined });
      return;
    }
    const n = parseInt(raw.replace(/[^0-9]/g, ""), 10);
    if (!isNaN(n)) onUpdateFilters({ [maxKey]: n });
  };

  const hasFilter = minValue !== undefined || maxValue !== undefined;

  return (
    <div className="flex flex-col gap-2 w-[190px]">
      <div className="flex items-center justify-between">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wide">
          Filter: {label}
        </p>
        {hasFilter && (
          <button
            type="button"
            className="text-xs text-muted-foreground hover:text-foreground"
            onClick={() => {
              setMin("");
              setMax("");
              onUpdateFilters({ [minKey]: undefined, [maxKey]: undefined });
            }}
          >
            clear
          </button>
        )}
      </div>
      <div className="flex items-center gap-1.5">
        <Input
          value={min}
          onChange={(e) => setMin(e.target.value)}
          onBlur={(e) => commitMin(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="min"
          className="h-7 text-xs w-[80px] font-mono"
        />
        <span className="text-xs text-muted-foreground">–</span>
        <Input
          value={max}
          onChange={(e) => setMax(e.target.value)}
          onBlur={(e) => commitMax(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") e.currentTarget.blur();
          }}
          placeholder="max"
          className="h-7 text-xs w-[80px] font-mono"
        />
      </div>
    </div>
  );
}

function ColumnHeaderFilter({
  filterType,
  filters,
  onUpdateFilters,
  filterOptions,
}: {
  filterType: FilterType;
  filters: AiModelFilters;
  onUpdateFilters: (patch: Partial<AiModelFilters>) => void;
  filterOptions: FilterOptions;
}) {
  const active = isFilterActive(filterType, filters);

  const renderContent = () => {
    switch (filterType) {
      case "provider":
        return (
          <SelectFilterContent
            label="Provider"
            value={filters.provider}
            options={filterOptions.providers.map((p) => ({
              value: p,
              label: p,
            }))}
            onChange={(v) => onUpdateFilters({ provider: v })}
            onClear={() => onUpdateFilters({ provider: undefined })}
          />
        );
      case "model_class":
        return (
          <SelectFilterContent
            label="Model Class"
            value={filters.model_class}
            options={filterOptions.modelClasses.map((c) => ({
              value: c,
              label: c,
            }))}
            onChange={(v) => onUpdateFilters({ model_class: v })}
            onClear={() => onUpdateFilters({ model_class: undefined })}
          />
        );
      case "api_class":
        return (
          <SelectFilterContent
            label="API Class"
            value={filters.api_class}
            options={filterOptions.apiClasses.map((c) => ({
              value: c,
              label: c,
            }))}
            onChange={(v) => onUpdateFilters({ api_class: v })}
            onClear={() => onUpdateFilters({ api_class: undefined })}
          />
        );
      case "is_deprecated":
        return (
          <BoolFilterContent
            label="Deprecated"
            value={filters.is_deprecated}
            trueLabel="Deprecated"
            falseLabel="Active"
            onChange={(v) => onUpdateFilters({ is_deprecated: v })}
            onClear={() => onUpdateFilters({ is_deprecated: undefined })}
          />
        );
      case "is_primary":
        return (
          <BoolFilterContent
            label="Primary"
            value={filters.is_primary}
            trueLabel="Primary only"
            falseLabel="Non-primary"
            onChange={(v) => onUpdateFilters({ is_primary: v })}
            onClear={() => onUpdateFilters({ is_primary: undefined })}
          />
        );
      case "is_premium":
        return (
          <BoolFilterContent
            label="Premium"
            value={filters.is_premium}
            trueLabel="Premium only"
            falseLabel="Non-premium"
            onChange={(v) => onUpdateFilters({ is_premium: v })}
            onClear={() => onUpdateFilters({ is_premium: undefined })}
          />
        );
      case "context_window":
        return (
          <RangeFilterContent
            label="Context Window"
            minKey="context_window_min"
            maxKey="context_window_max"
            minValue={filters.context_window_min}
            maxValue={filters.context_window_max}
            onUpdateFilters={onUpdateFilters}
          />
        );
      case "max_tokens":
        return (
          <RangeFilterContent
            label="Max Tokens"
            minKey="max_tokens_min"
            maxKey="max_tokens_max"
            minValue={filters.max_tokens_min}
            maxValue={filters.max_tokens_max}
            onUpdateFilters={onUpdateFilters}
          />
        );
    }
  };

  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={(e) => e.stopPropagation()}
          title={`Filter by ${filterType.replace(/_/g, " ")}`}
          className={`rounded p-0.5 transition-colors ${
            active
              ? "text-primary hover:text-primary/80"
              : "text-muted-foreground/40 hover:text-muted-foreground"
          }`}
        >
          <ListFilter
            className={`h-3 w-3 ${active ? "fill-primary/20" : ""}`}
          />
        </button>
      </PopoverTrigger>
      <PopoverContent
        align="start"
        side="bottom"
        className="w-auto p-3"
        onClick={(e) => e.stopPropagation()}
      >
        {renderContent()}
      </PopoverContent>
    </Popover>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

export interface AiModelTableProps {
  models: AiModel[];
  providers: AiProvider[];
  isLoading: boolean;
  selectedId: string | null;
  tabState: TabState;
  onUpdateTabState: (patch: Partial<Omit<TabState, "id">>) => void;
  onSelect: (model: AiModel) => void;
  onEdit: (model: AiModel) => void;
  onDelete: (model: AiModel) => void;
  onDuplicate: (model: AiModel) => void;
  onCreate: () => void;
  onRefresh: () => void;
}

export default function AiModelTable({
  models,
  providers,
  isLoading,
  selectedId,
  tabState,
  onUpdateTabState,
  onSelect,
  onEdit,
  onDelete,
  onDuplicate,
  onCreate,
  onRefresh,
}: AiModelTableProps) {
  const { q, sort, dir, page, perPage, filters } = tabState;

  const providerMap = useMemo(
    () => Object.fromEntries(providers.map((p) => [p.id, p.name ?? p.id])),
    [providers],
  );

  const filterOptions = useMemo<FilterOptions>(
    () => ({
      providers: [
        ...new Set(models.map((m) => m.provider).filter(Boolean)),
      ].sort() as string[],
      modelClasses: [
        ...new Set(models.map((m) => m.model_class).filter(Boolean)),
      ].sort() as string[],
      apiClasses: [
        ...new Set(models.map((m) => m.api_class).filter(Boolean)),
      ].sort() as string[],
    }),
    [models],
  );

  const filteredModels = useMemo(
    () => applyFilters(models, q, filters),
    [models, q, filters],
  );

  const sortedModels = useMemo(
    () => applySort(filteredModels, sort, dir),
    [filteredModels, sort, dir],
  );

  const paginatedModels = useMemo(() => {
    const start = (page - 1) * perPage;
    return sortedModels.slice(start, start + perPage);
  }, [sortedModels, page, perPage]);

  const handleSortClick = (field: string) => {
    if (field === sort) {
      onUpdateTabState({ dir: dir === "asc" ? "desc" : "asc", page: 1 });
    } else {
      onUpdateTabState({ sort: field, dir: "asc", page: 1 });
    }
  };

  const handleUpdateQ = (newQ: string) => {
    onUpdateTabState({ q: newQ, page: 1 });
  };

  const handleUpdateFilters = (patch: Partial<AiModelFilters>) => {
    onUpdateTabState({ filters: { ...filters, ...patch }, page: 1 });
  };

  const handleClearAll = () => {
    onUpdateTabState({ q: "", filters: {}, page: 1 });
  };

  return (
    <div className="flex flex-col h-full min-h-0">
      {/* Combined title + filters + actions — single sticky row */}
      <AiModelFilterBar
        tabState={tabState}
        totalCount={models.length}
        filteredCount={filteredModels.length}
        models={models}
        onUpdateQ={handleUpdateQ}
        onUpdateFilters={handleUpdateFilters}
        onClearAll={handleClearAll}
        onCreate={onCreate}
        onRefresh={onRefresh}
      />

      {/* Scrollable table — single scroll container, thead is sticky within it */}
      <div className="flex-1 overflow-auto min-h-0">
        <table className="w-full caption-bottom text-xs border-collapse">
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="h-8">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`${col.width} ${col.className ?? ""} px-2 py-1.5 text-xs font-semibold text-left align-middle text-muted-foreground whitespace-nowrap ${
                    col.sortable
                      ? "cursor-pointer select-none hover:text-primary"
                      : ""
                  }`}
                  onClick={() => col.sortable && handleSortClick(col.key)}
                >
                  <span className="flex items-center gap-0.5">
                    {col.header}
                    {col.sortable && (
                      <SortIcon field={col.key} sortBy={sort} dir={dir} />
                    )}
                    {col.filterType && (
                      <ColumnHeaderFilter
                        filterType={col.filterType}
                        filters={filters}
                        onUpdateFilters={handleUpdateFilters}
                        filterOptions={filterOptions}
                      />
                    )}
                  </span>
                </th>
              ))}
              <th className="w-[120px] min-w-[120px] px-2 py-1.5 text-xs font-semibold text-right align-middle text-muted-foreground pr-3">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="[&_tr:last-child]:border-0">
            {isLoading ? (
              Array.from({ length: 8 }).map((_, i) => (
                <tr key={i} className="h-9 border-b border-border">
                  {COLUMNS.map((col) => (
                    <td key={col.key} className="px-2 py-1.5">
                      <Skeleton className="h-4 w-full" />
                    </td>
                  ))}
                  <td className="px-2 py-1.5">
                    <Skeleton className="h-4 w-20" />
                  </td>
                </tr>
              ))
            ) : paginatedModels.length === 0 ? (
              <tr>
                <td
                  colSpan={COLUMNS.length + 1}
                  className="h-32 text-center p-2"
                >
                  <div className="flex flex-col items-center gap-2 text-muted-foreground">
                    <BrainCircuit className="h-10 w-10 opacity-30" />
                    <p className="text-sm">No AI models found</p>
                    {(q || Object.keys(filters).length > 0) && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={handleClearAll}
                      >
                        Clear filters
                      </Button>
                    )}
                  </div>
                </td>
              </tr>
            ) : (
              paginatedModels.map((item, idx) => (
                <tr
                  key={item.id}
                  className={`group h-9 border-b border-border cursor-pointer transition-colors ${
                    selectedId === item.id
                      ? "bg-primary/10 hover:bg-primary/15"
                      : idx % 2 === 0
                        ? "hover:bg-muted/50"
                        : "bg-muted/20 hover:bg-muted/50"
                  }`}
                  onClick={() => onSelect(item)}
                >
                  {COLUMNS.map((col) => (
                    <td
                      key={col.key}
                      className={`py-1 px-2 align-middle ${col.className ?? ""}`}
                    >
                      {col.render(item, providerMap)}
                    </td>
                  ))}
                  <td className="py-1 px-2 align-middle text-right">
                    <RowActions
                      item={item}
                      onView={onSelect}
                      onEdit={onEdit}
                      onDuplicate={onDuplicate}
                      onDelete={onDelete}
                    />
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Pinned pagination footer */}
      <div className="flex-shrink-0 border-t bg-card p-0">
        <GenericTablePagination
          totalItems={filteredModels.length}
          itemsPerPage={perPage}
          currentPage={page}
          onPageChange={(p) => onUpdateTabState({ page: p })}
          onItemsPerPageChange={(n) =>
            onUpdateTabState({ perPage: n, page: 1 })
          }
          compact
          layoutType="flex"
          containerClassName="border-t-0 pt-0"
        />
      </div>
    </div>
  );
}
