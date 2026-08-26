"use client";

import React, { useMemo } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Skeleton } from "@/components/ui/skeleton";
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
  MoveHorizontal,
} from "lucide-react";
import type { AiModel, AiProvider } from "../types";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { aiModelSummary, AI_MODELS_LOCATION } from "../format";
import {
  DEFAULT_AI_MODEL_FILTERS,
  isDeprecatedFilterNonDefault,
  type TabState,
  type AiModelFilters,
} from "../hooks/useTabUrlState";
import AiModelFilterBar from "./AiModelFilterBar";
import { cn } from "@/lib/utils";
import { MOBILE_TABLE_FROZEN_SECOND } from "@/components/official/mobile-table/mobileTable";
import { parseCapabilities } from "../capabilities/parse";
import { isContentType, type ContentType } from "../capabilities/types";
import { priceFieldLabel } from "../usageBasis";
import { applyAiModelFilters, sortAiModels } from "../utils/filterUtils";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { aiProviderHref } from "../doors";

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

function ModalityBadges({ values }: { values: ContentType[] }) {
  return (
    <div className="flex items-center gap-1 whitespace-nowrap">
      {values.map((value) => (
        <Badge
          key={value}
          variant="outline"
          className="h-5 px-1.5 text-[10px] capitalize"
        >
          {value}
        </Badge>
      ))}
    </div>
  );
}

function formatPrice(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toPrecision(2)}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

function PriceCell({
  item,
  field,
}: {
  item: AiModel;
  field: "input_price" | "output_price";
}) {
  const value = item.preferred_pricing?.[field];
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }
  const unit = priceFieldLabel(item.preferred_pricing?.usage_basis, field);
  return (
    <span
      className="block text-right text-xs tabular-nums"
      title={`${formatPrice(value)} · ${unit}`}
    >
      <span className="font-medium">{formatPrice(value)}</span>
      <span className="ml-1 text-[10px] text-muted-foreground">
        {unit.replace("$ / ", "/")}
      </span>
    </span>
  );
}

// ─── Column definitions ───────────────────────────────────────────────────────

interface ColDef {
  key: string;
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
    render: (item) => (
      <AiModelRef
        modelId={item.id}
        name={item.common_name || item.name}
        showId
        showIcon={false}
      />
    ),
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
    key: "maker",
    header: "Provider",
    width: "w-[120px] min-w-[100px]",
    sortable: true,
    filterType: "provider",
    render: (item) => (
      <Badge
        variant="outline"
        className={`text-xs ${providerColor(item.maker)}`}
      >
        {item.maker ?? "—"}
      </Badge>
    ),
  },
  {
    key: "provider_id",
    header: "Provider FK",
    width: "w-[120px] min-w-[100px]",
    sortable: true,
    render: (item, providerMap) => (
      <MatrxUuidCell
        value={item.provider_id}
        label={
          item.provider_id
            ? (providerMap[item.provider_id] ?? "AI model provider")
            : "AI model provider"
        }
        href={item.provider_id ? aiProviderHref(item.provider_id) : null}
      />
    ),
  },
  {
    key: "input_capability",
    header: "Input",
    width: "w-[150px] min-w-[130px]",
    sortable: false,
    filterType: "input_capability",
    render: (item) => (
      <ModalityBadges
        values={
          parseCapabilities(item.capabilities, {
            modelId: item.id,
            modelName: item.name,
          }).input
        }
      />
    ),
  },
  {
    key: "output_capability",
    header: "Output",
    width: "w-[140px] min-w-[120px]",
    sortable: false,
    filterType: "output_capability",
    render: (item) => (
      <ModalityBadges
        values={
          parseCapabilities(item.capabilities, {
            modelId: item.id,
            modelName: item.name,
          }).output
        }
      />
    ),
  },
  {
    key: "input_price",
    header: "Input Price",
    width: "w-[130px] min-w-[120px]",
    sortable: true,
    className: "text-right",
    render: (item) => <PriceCell item={item} field="input_price" />,
  },
  {
    key: "output_price",
    header: "Output Price",
    width: "w-[130px] min-w-[120px]",
    sortable: true,
    className: "text-right",
    render: (item) => <PriceCell item={item} field="output_price" />,
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
  // NOTE: no controls/constraints columns — those legacy model_definition
  // columns were DROPPED (ai_034); resolved rules live on ai.model_config.
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
  // Pricing remains read-only here; editing still lives only on ai.offering.
];

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
      <div className="flex items-center gap-0.5 opacity-100 transition-opacity xl:opacity-0 xl:group-hover:opacity-100">
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 max-lg:h-10 max-lg:w-10"
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
          className="h-6 w-6 max-lg:h-10 max-lg:w-10"
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
          className="h-6 w-6 max-lg:h-10 max-lg:w-10"
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
                provider: item.maker ?? item.provider_id ?? "",
              },
            })}
          />
        </span>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 text-destructive hover:bg-destructive/10 hover:text-destructive max-lg:h-10 max-lg:w-10"
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
  | "input_capability"
  | "output_capability"
  | "is_deprecated"
  | "is_primary"
  | "is_premium"
  | "context_window"
  | "max_tokens";

interface FilterOptions {
  providers: string[];
  inputCapabilities: ContentType[];
  outputCapabilities: ContentType[];
}

function isFilterActive(
  filterType: FilterType,
  filters: AiModelFilters,
): boolean {
  switch (filterType) {
    case "provider":
      return !!filters.provider;
    case "input_capability":
      return !!filters.input_capability;
    case "output_capability":
      return !!filters.output_capability;
    case "is_deprecated":
      return isDeprecatedFilterNonDefault(filters);
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
      case "input_capability":
        return (
          <SelectFilterContent
            label="Input"
            value={filters.input_capability}
            options={filterOptions.inputCapabilities.map((value) => ({
              value,
              label: value,
            }))}
            onChange={(value) => {
              if (isContentType(value)) {
                onUpdateFilters({ input_capability: value });
              }
            }}
            onClear={() => onUpdateFilters({ input_capability: undefined })}
          />
        );
      case "output_capability":
        return (
          <SelectFilterContent
            label="Output"
            value={filters.output_capability}
            options={filterOptions.outputCapabilities.map((value) => ({
              value,
              label: value,
            }))}
            onChange={(value) => {
              if (isContentType(value)) {
                onUpdateFilters({ output_capability: value });
              }
            }}
            onClear={() => onUpdateFilters({ output_capability: undefined })}
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
            key={`context-${filters.context_window_min ?? ""}-${filters.context_window_max ?? ""}`}
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
            key={`tokens-${filters.max_tokens_min ?? ""}-${filters.max_tokens_max ?? ""}`}
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

  const filterOptions = useMemo<FilterOptions>(() => {
    const capabilities = models.map((model) =>
      parseCapabilities(model.capabilities, {
        modelId: model.id,
        modelName: model.name,
      }),
    );
    return {
      providers: [
        ...new Set(
          models
            .map((model) => model.maker)
            .filter((maker): maker is string => Boolean(maker)),
        ),
      ].sort(),
      inputCapabilities: [
        ...new Set(capabilities.flatMap((c) => c.input)),
      ].sort(),
      outputCapabilities: [
        ...new Set(capabilities.flatMap((c) => c.output)),
      ].sort(),
    };
  }, [models]);

  const filteredModels = useMemo(
    () => applyAiModelFilters(models, q, filters),
    [models, q, filters],
  );

  const sortedModels = useMemo(
    () => sortAiModels(filteredModels, sort, dir),
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
    onUpdateTabState({
      q: "",
      filters: { ...DEFAULT_AI_MODEL_FILTERS },
      page: 1,
    });
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

      <div className="flex shrink-0 items-center gap-1.5 border-b bg-muted/30 px-2 py-1 text-xs text-muted-foreground xl:hidden">
        <MoveHorizontal className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
        <span>
          Swipe horizontally for model details; name and actions stay visible.
        </span>
      </div>

      {/* Scrollable table — single scroll container, thead is sticky within it */}
      <div className="relative min-h-0 flex-1 overflow-auto">
        <table
          className={cn(
            "table overflow-visible caption-bottom text-xs border-collapse",
            MOBILE_TABLE_FROZEN_SECOND,
          )}
        >
          <thead className="sticky top-0 z-10 bg-card border-b border-border">
            <tr className="h-8">
              {COLUMNS.map((col) => (
                <th
                  key={col.key}
                  className={`${col.width} ${col.className ?? ""} px-2 py-1.5 text-xs font-semibold text-left align-middle text-muted-foreground whitespace-nowrap ${
                    col.key === "common_name"
                      ? "max-xl:sticky max-xl:left-0 max-xl:z-30 max-xl:bg-card max-xl:shadow-[2px_0_0_hsl(var(--border))]"
                      : ""
                  } ${
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
              <th className="w-[210px] min-w-[210px] px-2 py-1.5 text-xs font-semibold text-right align-middle text-muted-foreground pr-3 max-xl:sticky max-xl:right-0 max-xl:z-30 max-xl:bg-card max-xl:shadow-[-2px_0_0_hsl(var(--border))]">
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
                      className={`py-1 px-2 align-middle ${col.className ?? ""} ${
                        col.key === "common_name"
                          ? "max-xl:sticky max-xl:left-0 max-xl:z-20 max-xl:bg-card max-xl:shadow-[2px_0_0_hsl(var(--border))]"
                          : ""
                      }`}
                    >
                      {col.render(item, providerMap)}
                    </td>
                  ))}
                  <td className="min-w-[210px] py-1 px-2 align-middle text-right max-xl:sticky max-xl:right-0 max-xl:z-20 max-xl:bg-card max-xl:shadow-[-2px_0_0_hsl(var(--border))]">
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
