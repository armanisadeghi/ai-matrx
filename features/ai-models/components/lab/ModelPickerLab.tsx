"use client";

/**
 * ModelPickerLab — TEMPORARY rich model picker for data validation.
 *
 * A quick, deliberately-utilitarian picker that surfaces the full model data
 * we can show (types, capabilities, service, pricing, flags) so we can confirm
 * the DATA is sound before running a ui-bakeoff on the final design. NOT the
 * canonical picker — SmartModelSelect remains that until the bakeoff winner
 * replaces it. Two variants:
 *   - "user"  → routable public models, points-based pricing.
 *   - "admin" → full catalog incl. deprecated, raw pricing + service internals.
 *
 * Self-contained data via useModelCatalog (not the registry slice) so it can be
 * added/removed from the builder without touching canonical state.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Braces,
  Brain,
  Check,
  ChevronsUpDown,
  Eye,
  FileText,
  Globe,
  Image as ImageIcon,
  Mic,
  Search,
  Sparkles,
  Star,
  Video,
  Wrench,
  Zap,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { cn } from "@/lib/utils";
import {
  useModelCatalog,
  type CatalogModel,
  type ModelCatalogVariant,
} from "@/features/ai-models/hooks/useModelCatalog";
import type {
  ContentType,
  FeatureKey,
} from "@/features/ai-models/capabilities/types";

type SortKey = "name" | "maker" | "context" | "price";

interface ModelPickerLabProps {
  value: string | null | undefined;
  onValueChange: (modelId: string) => void;
  variant: ModelCatalogVariant;
  className?: string;
}

const CONTENT_ICON: Record<ContentType, typeof FileText> = {
  text: FileText,
  image: ImageIcon,
  audio: Mic,
  video: Video,
  document: FileText,
};

const FEATURE_META: Partial<
  Record<FeatureKey, { icon: typeof Wrench; label: string }>
> = {
  thinking: { icon: Brain, label: "Reasoning" },
  function_calling: { icon: Wrench, label: "Tools" },
  vision: { icon: Eye, label: "Vision" },
  structured_output: { icon: Braces, label: "Structured" },
  web_search: { icon: Globe, label: "Web search" },
};

function formatContext(n: number | null): string {
  if (!n) return "—";
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(n % 1_000_000 ? 1 : 0)}M`;
  if (n >= 1_000) return `${Math.round(n / 1_000)}K`;
  return String(n);
}

function CapabilityRow({ model }: { model: CatalogModel }) {
  const { input, output, features } = model.capabilities;
  const featureChips = features
    .map((f) => FEATURE_META[f])
    .filter((m): m is { icon: typeof Wrench; label: string } => Boolean(m));

  return (
    <div className="flex flex-wrap items-center gap-1">
      {/* input → output content types */}
      <span className="flex items-center gap-0.5 text-muted-foreground">
        {input.map((c) => {
          const Icon = CONTENT_ICON[c];
          return <Icon key={`in-${c}`} className="h-3 w-3" aria-label={`input ${c}`} />;
        })}
        <span className="mx-0.5 text-[10px]">→</span>
        {output.map((c) => {
          const Icon = CONTENT_ICON[c];
          return <Icon key={`out-${c}`} className="h-3 w-3" aria-label={`output ${c}`} />;
        })}
      </span>
      {model.capabilities.interaction === "realtime" && (
        <Badge variant="secondary" className="h-4 gap-0.5 px-1 text-[10px]">
          <Zap className="h-2.5 w-2.5" /> realtime
        </Badge>
      )}
      {featureChips.map(({ icon: Icon, label }) => (
        <Badge
          key={label}
          variant="outline"
          className="h-4 gap-0.5 px-1 text-[10px] font-normal"
        >
          <Icon className="h-2.5 w-2.5" />
          {label}
        </Badge>
      ))}
    </div>
  );
}

function ModelRow({
  model,
  selected,
  variant,
  onSelect,
}: {
  model: CatalogModel;
  selected: boolean;
  variant: ModelCatalogVariant;
  onSelect: () => void;
}) {
  const price =
    variant === "user"
      ? model.pointsInput != null || model.pointsOutput != null
        ? `${model.pointsInput ?? "—"} / ${model.pointsOutput ?? "—"} pts·M`
        : null
      : [model.admin?.vendor, model.admin?.wireFormat]
          .filter(Boolean)
          .join(" · ") || null;

  return (
    <button
      type="button"
      onClick={onSelect}
      className={cn(
        "flex w-full items-start gap-2 rounded-md px-2 py-1.5 text-left transition-colors",
        "hover:bg-accent",
        selected && "bg-accent",
      )}
    >
      <Check
        className={cn(
          "mt-0.5 h-3.5 w-3.5 shrink-0",
          selected ? "text-primary" : "text-transparent",
        )}
      />
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-1.5">
          <span className="truncate text-xs font-medium text-foreground">
            {model.commonName || model.name}
          </span>
          {model.isPrimary && (
            <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
          )}
          {model.isPremium && (
            <Sparkles className="h-3 w-3 shrink-0 text-violet-500" />
          )}
          {model.isDeprecated && (
            <Badge
              variant="destructive"
              className="h-4 gap-0.5 px-1 text-[10px]"
            >
              <AlertTriangle className="h-2.5 w-2.5" /> deprecated
            </Badge>
          )}
        </div>
        <div className="mt-0.5 flex items-center gap-1.5 text-[11px] text-muted-foreground">
          {model.maker && <span className="truncate">{model.maker}</span>}
          {model.modelClass && (
            <span className="truncate font-mono text-[10px] opacity-70">
              {model.modelClass}
            </span>
          )}
        </div>
        <div className="mt-1">
          <CapabilityRow model={model} />
        </div>
      </div>
      <div className="shrink-0 text-right text-[11px] text-muted-foreground">
        <div>{formatContext(model.contextWindow)} ctx</div>
        {price && <div className="mt-0.5 tabular-nums">{price}</div>}
        {variant === "admin" && model.serviceName && (
          <div className="mt-0.5 truncate opacity-70">{model.serviceName}</div>
        )}
      </div>
    </button>
  );
}

export function ModelPickerLab({
  value,
  onValueChange,
  variant,
  className,
}: ModelPickerLabProps) {
  const { models, isLoading, error } = useModelCatalog(variant);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [sort, setSort] = useState<SortKey>("name");

  const selected = models.find((m) => m.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = q
      ? models.filter((m) =>
          [m.name, m.commonName, m.maker, m.modelClass, m.id]
            .filter(Boolean)
            .some((f) => f!.toLowerCase().includes(q)),
        )
      : models;
    const sorted = [...rows];
    sorted.sort((a, b) => {
      switch (sort) {
        case "maker":
          return (a.maker ?? "").localeCompare(b.maker ?? "");
        case "context":
          return (b.contextWindow ?? 0) - (a.contextWindow ?? 0);
        case "price":
          return (a.pointsInput ?? Infinity) - (b.pointsInput ?? Infinity);
        default:
          return (a.commonName ?? a.name).localeCompare(b.commonName ?? b.name);
      }
    });
    return sorted;
  }, [models, query, sort]);

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "maker", label: "Maker" },
    { key: "context", label: "Context" },
    ...(variant === "user"
      ? [{ key: "price" as const, label: "Price" }]
      : []),
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          role="combobox"
          aria-expanded={open}
          className={cn("h-7 justify-between gap-2 text-xs", className)}
        >
          <span className="flex min-w-0 items-center gap-1.5">
            {selected ? (
              <>
                <span className="truncate">
                  {selected.commonName || selected.name}
                </span>
                {selected.maker && (
                  <span className="truncate text-muted-foreground">
                    {selected.maker}
                  </span>
                )}
              </>
            ) : (
              <span className="text-muted-foreground">
                {isLoading ? "Loading models…" : "Select a model…"}
              </span>
            )}
          </span>
          <ChevronsUpDown className="h-3.5 w-3.5 shrink-0 opacity-50" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-[420px] p-0">
        <div className="flex items-center gap-2 border-b border-border p-2">
          <div className="relative flex-1">
            <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search models…"
              className="h-7 pl-7 text-xs"
              autoFocus
            />
          </div>
          <div className="flex items-center gap-0.5">
            {sortOptions.map((o) => (
              <button
                key={o.key}
                type="button"
                onClick={() => setSort(o.key)}
                className={cn(
                  "rounded px-1.5 py-1 text-[11px] transition-colors",
                  sort === o.key
                    ? "bg-accent text-foreground"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {o.label}
              </button>
            ))}
          </div>
        </div>

        <div className="max-h-[420px] overflow-y-auto p-1">
          {error ? (
            <div className="flex items-start gap-2 p-3 text-xs text-destructive">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <div className="font-medium">Failed to load {variant} catalog</div>
                <div className="mt-0.5 font-mono text-[11px] opacity-80">
                  {error}
                </div>
                {variant === "admin" && (
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    If this is a permission error, `ai.model_admin` may not be
                    granted to your role.
                  </div>
                )}
              </div>
            </div>
          ) : isLoading ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              Loading catalog…
            </div>
          ) : filtered.length === 0 ? (
            <div className="p-4 text-center text-xs text-muted-foreground">
              No models match “{query}”.
            </div>
          ) : (
            <>
              <div className="px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
                {filtered.length} model{filtered.length === 1 ? "" : "s"}
              </div>
              {filtered.map((m) => (
                <ModelRow
                  key={m.id}
                  model={m}
                  variant={variant}
                  selected={m.id === value}
                  onSelect={() => {
                    onValueChange(m.id);
                    setOpen(false);
                  }}
                />
              ))}
            </>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
