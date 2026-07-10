"use client";

/**
 * ModelListDropdown — model picker built on the AgentListDropdown concept.
 *
 * Desktop: a fixed two-column popover — a tabular list on the left, a detail
 * card on the right that swaps to filter/sort panels. The footprint NEVER
 * resizes, so hovering a row (→ detail) or opening a filter panel doesn't shift
 * anything. Mobile: a bottom drawer with detail / filter sub-views.
 *
 * Rows are dense and tabular (Maker · Name · Speed · Usage). Full capability
 * data (modalities, every feature bucket incl. "Other", interaction,
 * multilingual, pricing) lives in the always-present detail card — nothing is
 * ever hidden. The count sits at the BOTTOM, not in prime real estate.
 *
 * Filters (input/output modalities, features, interaction, language) are
 * seeded from props and adjustable. `inputModalities` is REQUIRED — a caller
 * must declare what the model has to accept; there is no default.
 *
 * TEMPORARY: the data comes from messy transitional views (see useModelCatalog)
 * and maker/speed/pricing are derived stopgaps. Replaced by the ui-bakeoff
 * winner. Favorites is the next step (needs a userPreferences shape change).
 */

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Languages,
  MousePointerClick,
  Search,
  SlidersHorizontal,
  Star,
  Type,
  Image as ImageIcon,
  AudioLines,
  Video,
  Boxes,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectFavoriteModelIds } from "@/lib/redux/preferences/userPreferenceSelectors";
import {
  Popover,
  PopoverTrigger,
  PopoverContent,
} from "@/components/ui/popover";
import { useDialogContainer } from "@/components/ui/dialog";
import {
  Drawer,
  DrawerTrigger,
  DrawerContent,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Input } from "@/components/ui/input";
import {
  useModelCatalog,
  INPUT_MODALITIES,
  OUTPUT_MODALITIES,
  type CatalogModel,
  type Modality,
  type ModelCatalogVariant,
  type Interaction,
} from "@/features/ai-models/hooks/useModelCatalog";
import {
  FEATURE_BUCKETS,
  FEATURE_BUCKET_ORDER,
  type FeatureBucket,
} from "@/features/ai-models/capabilities/feature-map";
import {
  priceTier,
  type PriceTier,
} from "@/features/ai-models/lab/modelDisplay";

const PANEL_HEIGHT = 440;
const LIST_MAX_HEIGHT = "min(440px, 70dvh)";

type SortKey = "name" | "maker" | "context" | "price";
type RightPanel = "detail" | "filters" | null;

const MODALITY_ICON: Record<Modality, typeof Type> = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  entities: Boxes,
};

const INTERACTION_LABEL: Record<Interaction, string> = {
  turn: "Standard",
  single: "Single-shot",
  extraction: "Extraction",
  realtime: "Realtime",
};

interface ModelListDropdownProps {
  value: string | null | undefined;
  onValueChange: (modelId: string) => void;
  variant: ModelCatalogVariant;
  /** REQUIRED — input modalities the model must accept (seeds the filter). */
  inputModalities: Modality[];
  /** Optional — output modalities the model must produce (seeds the filter). */
  outputModalities?: Modality[];
  className?: string;
}

// ── Small presentational bits ────────────────────────────────────────────────

function SpeedDots({ value }: { value: number | null }) {
  // No speed data yet — render an honest, empty 5-dot scale.
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={value == null ? "Speed rating coming soon" : `Speed ${value}/5`}
    >
      {[0, 1, 2, 3, 4].map((i) => (
        <span
          key={i}
          className={cn(
            "h-1.5 w-1.5 rounded-full",
            value != null && i < value
              ? "bg-foreground/70"
              : "bg-muted-foreground/25",
          )}
        />
      ))}
    </span>
  );
}

function UsageTier({ tier }: { tier: PriceTier | null }) {
  if (!tier)
    return <span className="text-[11px] text-muted-foreground/50">—</span>;
  const plus = tier.endsWith("+");
  const dollars = tier.replace("+", "");
  return (
    <span className="font-mono text-[11px] tabular-nums text-foreground/80">
      {dollars}
      {plus && <span className="text-amber-500">+</span>}
    </span>
  );
}

function ModalityIcons({ list }: { list: Modality[] }) {
  if (list.length === 0)
    return <span className="text-[11px] text-muted-foreground/50">—</span>;
  return (
    <span className="inline-flex items-center gap-1">
      {list.map((m) => {
        const Icon = MODALITY_ICON[m];
        return (
          <span
            key={m}
            className="inline-flex items-center gap-0.5 text-xs text-foreground/70"
            title={m}
          >
            <Icon className="h-3 w-3" />
            <span className="capitalize">{m}</span>
          </span>
        );
      })}
    </span>
  );
}

// ── Detail card (right column / mobile sub-view) ─────────────────────────────

function ModelDetailCard({
  model,
  tier,
  variant,
  onSelect,
}: {
  model: CatalogModel;
  tier: PriceTier | null;
  variant: ModelCatalogVariant;
  onSelect: () => void;
}) {
  return (
    <div className="flex h-full flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
      <div className="flex items-start justify-between gap-2">
        <div className="min-w-0">
          <div className="truncate text-sm font-semibold text-foreground">
            {model.name}
          </div>
          {model.maker && (
            <div className="text-xs text-muted-foreground">{model.maker}</div>
          )}
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          {model.isPrimary && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
              Default
            </span>
          )}
          {model.isPremium && (
            <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium text-foreground/70">
              Premium
            </span>
          )}
          {model.isDeprecated && (
            <span className="rounded bg-destructive/15 px-1.5 py-0.5 text-[10px] font-medium text-destructive">
              Deprecated
            </span>
          )}
        </div>
      </div>

      {model.description && (
        <p className="mt-2 line-clamp-3 text-xs text-muted-foreground">
          {model.description}
        </p>
      )}

      <dl className="mt-3 space-y-2 text-xs">
        <div>
          <dt className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Input
          </dt>
          <dd>
            <ModalityIcons list={model.input} />
          </dd>
        </div>
        <div>
          <dt className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Output
          </dt>
          <dd>
            <ModalityIcons list={model.output} />
          </dd>
        </div>

        {model.features.buckets.length > 0 && (
          <div>
            <dt className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Features
            </dt>
            <dd className="flex flex-wrap gap-1">
              {model.features.buckets.map((b) => (
                <span
                  key={b}
                  className="rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground/80"
                  title={FEATURE_BUCKETS[b].description}
                >
                  {FEATURE_BUCKETS[b].label}
                </span>
              ))}
            </dd>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Context
            </dt>
            <dd className="tabular-nums text-foreground/80">
              {model.contextWindow?.toLocaleString() ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Max output
            </dt>
            <dd className="tabular-nums text-foreground/80">
              {model.maxTokens?.toLocaleString() ?? "—"}
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Usage
            </dt>
            <dd>
              <UsageTier tier={tier} />
            </dd>
          </div>
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Interaction
            </dt>
            <dd className="text-foreground/80">
              {INTERACTION_LABEL[model.interaction]}
            </dd>
          </div>
        </div>

        {model.multilingual && (
          <div className="flex items-center gap-1 text-foreground/80">
            <Languages className="h-3.5 w-3.5" />
            <span>Multilingual</span>
          </div>
        )}

        {variant === "admin" && model.admin && (
          <div className="mt-1 space-y-1 rounded bg-muted/40 p-2 text-[11px]">
            <div className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Admin
            </div>
            {model.admin.vendor && <div>Vendor: {model.admin.vendor}</div>}
            {model.admin.wireFormat && (
              <div>Wire format: {model.admin.wireFormat}</div>
            )}
            {(model.admin.serviceDisplayName ||
              model.admin.serviceInternalName) && (
              <div>
                Service:{" "}
                {model.admin.serviceDisplayName ||
                  model.admin.serviceInternalName}
              </div>
            )}
          </div>
        )}

        {/* Never hide data: the complete raw feature set, always. */}
        {model.features.raw.length > 0 && (
          <div>
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              All capability flags
            </dt>
            <dd className="font-mono text-[10px] leading-relaxed text-muted-foreground/80">
              {model.features.raw.join(", ")}
            </dd>
          </div>
        )}
      </dl>
      </div>
      {/* Fixed footer — the Select button never moves. */}
      <div className="shrink-0 border-t border-border p-3">
        <button
          type="button"
          onClick={onSelect}
          className="w-full rounded-md bg-primary py-1.5 text-xs font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          Select model
        </button>
      </div>
    </div>
  );
}

// ── Filters panel (right column / mobile sub-view) ───────────────────────────

interface Filters {
  input: Set<Modality>;
  output: Set<Modality>;
  features: Set<FeatureBucket>;
  interaction: Interaction | "any";
  multilingualOnly: boolean;
  sort: SortKey;
}

function ChipToggle({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "rounded-md border px-2 py-0.5 text-[11px] transition-colors",
        active
          ? "border-primary bg-primary/10 text-foreground"
          : "border-border text-muted-foreground hover:text-foreground",
      )}
    >
      {children}
    </button>
  );
}

function FiltersPanel({
  filters,
  setFilters,
  variant,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  variant: ModelCatalogVariant;
}) {
  const toggleModality = (kind: "input" | "output", m: Modality) =>
    setFilters((f) => {
      const next = new Set(f[kind]);
      if (next.has(m)) next.delete(m);
      else next.add(m);
      return { ...f, [kind]: next };
    });
  const toggleFeature = (b: FeatureBucket) =>
    setFilters((f) => {
      const next = new Set(f.features);
      if (next.has(b)) next.delete(b);
      else next.add(b);
      return { ...f, features: next };
    });

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "maker", label: "Maker" },
    { key: "context", label: "Context" },
    ...(variant === "user"
      ? [{ key: "price" as const, label: "Usage" }]
      : []),
  ];

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs">
      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Sort by
        </div>
        <div className="flex flex-wrap gap-1">
          {sortOptions.map((o) => (
            <ChipToggle
              key={o.key}
              active={filters.sort === o.key}
              onClick={() => setFilters((f) => ({ ...f, sort: o.key }))}
            >
              {o.label}
            </ChipToggle>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Input
        </div>
        <div className="flex flex-wrap gap-1">
          <ChipToggle
            active={filters.input.size === 0}
            onClick={() => setFilters((f) => ({ ...f, input: new Set() }))}
          >
            Any
          </ChipToggle>
          {INPUT_MODALITIES.map((m) => (
            <ChipToggle
              key={m}
              active={filters.input.has(m)}
              onClick={() => toggleModality("input", m)}
            >
              <span className="capitalize">{m}</span>
            </ChipToggle>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Output
        </div>
        <div className="flex flex-wrap gap-1">
          <ChipToggle
            active={filters.output.size === 0}
            onClick={() => setFilters((f) => ({ ...f, output: new Set() }))}
          >
            Any
          </ChipToggle>
          {OUTPUT_MODALITIES.map((m) => (
            <ChipToggle
              key={m}
              active={filters.output.has(m)}
              onClick={() => toggleModality("output", m)}
            >
              <span className="capitalize">{m}</span>
            </ChipToggle>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Features
        </div>
        <div className="flex flex-wrap gap-1">
          {FEATURE_BUCKET_ORDER.map((b) => (
            <ChipToggle
              key={b}
              active={filters.features.has(b)}
              onClick={() => toggleFeature(b)}
            >
              {FEATURE_BUCKETS[b].label}
            </ChipToggle>
          ))}
        </div>
      </div>

      <div>
        <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
          Interaction
        </div>
        <div className="flex flex-wrap gap-1">
          {(["any", "turn", "single", "extraction", "realtime"] as const).map(
            (i) => (
              <ChipToggle
                key={i}
                active={filters.interaction === i}
                onClick={() =>
                  setFilters((f) => ({ ...f, interaction: i }))
                }
              >
                {i === "any" ? "Any" : INTERACTION_LABEL[i]}
              </ChipToggle>
            ),
          )}
        </div>
      </div>

      <ChipToggle
        active={filters.multilingualOnly}
        onClick={() =>
          setFilters((f) => ({ ...f, multilingualOnly: !f.multilingualOnly }))
        }
      >
        <span className="inline-flex items-center gap-1">
          <Languages className="h-3 w-3" /> Multilingual only
        </span>
      </ChipToggle>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function ModelRow({
  model,
  tier,
  selected,
  isFavorite,
  onSelect,
  onHover,
  onToggleFavorite,
}: {
  model: CatalogModel;
  tier: PriceTier | null;
  selected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onHover?: () => void;
  onToggleFavorite: () => void;
}) {
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onSelect}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onSelect();
        }
      }}
      onMouseEnter={onHover}
      className={cn(
        "grid w-full cursor-pointer grid-cols-[auto_minmax(0,72px)_minmax(0,1fr)_auto_auto] items-center gap-2 rounded px-2 py-1 transition-colors",
        "hover:bg-muted/60 focus:bg-muted/60 focus:outline-none",
        selected && "bg-muted",
      )}
    >
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          onToggleFavorite();
        }}
        title={isFavorite ? "Remove favorite" : "Add favorite"}
        aria-label={isFavorite ? "Remove favorite" : "Add favorite"}
        className={cn(
          "flex h-4 w-4 items-center justify-center rounded transition-colors",
          isFavorite
            ? "text-amber-400"
            : "text-muted-foreground/30 hover:text-muted-foreground",
        )}
      >
        <Star className={cn("h-3 w-3", isFavorite && "fill-amber-400")} />
      </button>
      <span
        className="truncate text-[11px] text-muted-foreground"
        title={model.maker ?? undefined}
      >
        {model.maker ?? "—"}
      </span>
      <span className="flex min-w-0 items-center gap-1.5">
        <span className="truncate text-xs font-medium text-foreground">
          {model.name}
        </span>
        {model.isDeprecated && (
          <span className="shrink-0 rounded bg-destructive/15 px-1 text-[9px] text-destructive">
            dep
          </span>
        )}
      </span>
      <SpeedDots value={null} />
      <span className="w-10 text-right">
        <UsageTier tier={tier} />
      </span>
    </div>
  );
}

// ── Main ─────────────────────────────────────────────────────────────────────

export function ModelListDropdown({
  value,
  onValueChange,
  variant,
  inputModalities,
  outputModalities,
  className,
}: ModelListDropdownProps) {
  const isMobile = useIsMobile();
  const dialogContainer = useDialogContainer();
  const dispatch = useAppDispatch();
  const favoriteIds = useAppSelector(selectFavoriteModelIds);
  const { models, isLoading, error } = useModelCatalog(variant);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<"all" | "favorites">("all");
  const [rightPanel, setRightPanel] = useState<RightPanel>(null);
  const [hovered, setHovered] = useState<CatalogModel | null>(null);
  const [mobileDetail, setMobileDetail] = useState<CatalogModel | null>(null);
  const [mobileFilters, setMobileFilters] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  const [filters, setFilters] = useState<Filters>(() => ({
    input: new Set(inputModalities),
    output: new Set(outputModalities ?? []),
    features: new Set<FeatureBucket>(),
    interaction: "any",
    multilingualOnly: false,
    sort: "name",
  }));

  const favoriteSet = useMemo(() => new Set(favoriteIds), [favoriteIds]);

  const toggleFavorite = (id: string) => {
    const next = favoriteSet.has(id)
      ? favoriteIds.filter((f) => f !== id)
      : [...favoriteIds, id];
    dispatch(
      setPreference({
        module: "aiModels",
        preference: "favoriteModels",
        value: next,
      }),
    );
  };

  const selected = models.find((m) => m.id === value) ?? null;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const rows = models.filter((m) => {
      if (tab === "favorites" && !favoriteSet.has(m.id)) return false;
      if (q && ![m.name, m.maker].some((f) => f?.toLowerCase().includes(q)))
        return false;
      for (const m2 of filters.input) if (!m.input.includes(m2)) return false;
      for (const m2 of filters.output) if (!m.output.includes(m2)) return false;
      for (const b of filters.features)
        if (!m.features.buckets.includes(b)) return false;
      if (filters.interaction !== "any" && m.interaction !== filters.interaction)
        return false;
      if (filters.multilingualOnly && !m.multilingual) return false;
      return true;
    });
    const cmp = (a: CatalogModel, b: CatalogModel) => {
      switch (filters.sort) {
        case "maker":
          return (a.maker ?? "").localeCompare(b.maker ?? "");
        case "context":
          return (b.contextWindow ?? 0) - (a.contextWindow ?? 0);
        case "price":
          return (a.outputCost ?? Infinity) - (b.outputCost ?? Infinity);
        default:
          return a.name.localeCompare(b.name);
      }
    };
    const sorted = [...rows].sort(cmp);
    // On the All tab, favorites float to the top (still sorted among themselves).
    if (tab === "all") {
      const favs = sorted.filter((m) => favoriteSet.has(m.id));
      const rest = sorted.filter((m) => !favoriteSet.has(m.id));
      return [...favs, ...rest];
    }
    return sorted;
  }, [models, query, filters, tab, favoriteSet]);

  const activeFilterCount =
    filters.input.size +
    filters.output.size +
    filters.features.size +
    (filters.interaction !== "any" ? 1 : 0) +
    (filters.multilingualOnly ? 1 : 0);

  const handleOpen = (next: boolean) => {
    setOpen(next);
    if (next) {
      setTimeout(() => inputRef.current?.focus(), 50);
    } else {
      setRightPanel(null);
      setHovered(null);
      setMobileDetail(null);
      setMobileFilters(false);
      setQuery("");
    }
  };

  const handleSelect = (id: string) => {
    onValueChange(id);
    handleOpen(false);
  };

  const trigger = (
    <button
      type="button"
      className={cn(
        "inline-flex h-7 items-center gap-1.5 rounded-md border border-border bg-background px-2.5 text-xs font-medium text-foreground/80 transition-colors hover:bg-muted/50 hover:text-foreground",
        className,
      )}
    >
      <span className="flex min-w-0 items-center gap-1.5">
        {selected ? (
          <>
            {selected.maker && (
              <span className="truncate text-muted-foreground">
                {selected.maker}
              </span>
            )}
            <span className="truncate">{selected.name}</span>
          </>
        ) : (
          <span className="text-muted-foreground">
            {isLoading ? "Loading models…" : "Select a model…"}
          </span>
        )}
      </span>
      {activeFilterCount > 0 && (
        <span className="flex h-4 items-center justify-center rounded bg-primary px-1 text-[10px] text-primary-foreground">
          {activeFilterCount}
        </span>
      )}
      <ChevronDown className="h-3 w-3 text-muted-foreground/60" />
    </button>
  );

  const listPanel = (
    <div className="flex h-full flex-col">
      {/* Search + filter button */}
      <div className="flex items-center gap-1.5 border-b border-border p-2">
        <div className="relative flex-1">
          <Search className="absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground" />
          <Input
            ref={inputRef}
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search models…"
            className="h-7 pl-7 text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() =>
            isMobile
              ? setMobileFilters(true)
              : setRightPanel(rightPanel === "filters" ? null : "filters")
          }
          className={cn(
            "inline-flex h-7 items-center gap-1 rounded-md border px-2 text-[11px] transition-colors",
            rightPanel === "filters"
              ? "border-primary bg-primary/10 text-foreground"
              : "border-border text-muted-foreground hover:text-foreground",
          )}
        >
          <SlidersHorizontal className="h-3.5 w-3.5" />
          Filters
          {activeFilterCount > 0 && (
            <span className="text-primary">{activeFilterCount}</span>
          )}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 border-b border-border px-2 py-1">
        {(["all", "favorites"] as const).map((t) => (
          <button
            key={t}
            type="button"
            onClick={() => setTab(t)}
            className={cn(
              "inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] transition-colors",
              tab === t
                ? "bg-accent text-foreground"
                : "text-muted-foreground hover:text-foreground",
            )}
          >
            {t === "favorites" && (
              <Star
                className={cn(
                  "h-3 w-3",
                  tab === t && "fill-amber-400 text-amber-400",
                )}
              />
            )}
            {t === "all" ? "All" : "Favorites"}
            {t === "favorites" && favoriteSet.size > 0 && (
              <span className="text-muted-foreground">{favoriteSet.size}</span>
            )}
          </button>
        ))}
      </div>

      {/* Column header */}
      <div className="grid grid-cols-[auto_minmax(0,72px)_minmax(0,1fr)_auto_auto] gap-2 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="w-4" />
        <span>Maker</span>
        <span>Name</span>
        <span>Speed</span>
        <span className="w-10 text-right">Usage</span>
      </div>

      {/* Rows */}
      <div className="min-h-0 flex-1 overflow-y-auto p-1">
        {error ? (
          <div className="p-3 text-xs text-destructive">
            <div className="font-medium">Failed to load {variant} catalog</div>
            <div className="mt-0.5 font-mono text-[11px] opacity-80">{error}</div>
            {variant === "admin" && (
              <div className="mt-1 text-[11px] text-muted-foreground">
                If this is a 42501, `ai.model_admin` isn&apos;t granted to your role.
              </div>
            )}
          </div>
        ) : isLoading ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            Loading catalog…
          </div>
        ) : filtered.length === 0 ? (
          <div className="p-4 text-center text-xs text-muted-foreground">
            No models match your filters.
          </div>
        ) : (
          filtered.map((m) => (
            <ModelRow
              key={m.id}
              model={m}
              tier={priceTier(m.outputCost)}
              selected={m.id === value}
              isFavorite={favoriteSet.has(m.id)}
              onToggleFavorite={() => toggleFavorite(m.id)}
              onSelect={() =>
                isMobile ? setMobileDetail(m) : handleSelect(m.id)
              }
              onHover={
                isMobile
                  ? undefined
                  : () => {
                      setHovered(m);
                      if (rightPanel !== "filters") setRightPanel("detail");
                    }
              }
            />
          ))
        )}
      </div>

      {/* Count — at the BOTTOM, not prime real estate */}
      <div className="border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
        {filtered.length} of {models.length} model
        {models.length === 1 ? "" : "s"}
      </div>
    </div>
  );

  // ── Mobile ──
  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={handleOpen}>
        <DrawerTrigger asChild>{trigger}</DrawerTrigger>
        <DrawerContent className="h-[85dvh]">
          <DrawerTitle className="sr-only">Select model</DrawerTitle>
          <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
            {mobileDetail ? (
              <>
                <button
                  onClick={() => setMobileDetail(null)}
                  className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2.5 text-sm font-medium text-primary"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" /> Back
                </button>
                <div className="min-h-0 flex-1 overflow-y-auto">
                  <ModelDetailCard
                    model={mobileDetail}
                    tier={priceTier(mobileDetail.outputCost)}
                    variant={variant}
                    onSelect={() => handleSelect(mobileDetail.id)}
                  />
                </div>
              </>
            ) : mobileFilters ? (
              <>
                <button
                  onClick={() => setMobileFilters(false)}
                  className="flex shrink-0 items-center gap-1.5 border-b border-border px-3 py-2.5 text-sm font-medium text-primary"
                >
                  <ChevronRight className="h-4 w-4 rotate-180" /> Back
                </button>
                <div className="min-h-0 flex-1">
                  <FiltersPanel
                    filters={filters}
                    setFilters={setFilters}
                    variant={variant}
                  />
                </div>
              </>
            ) : (
              listPanel
            )}
          </div>
        </DrawerContent>
      </Drawer>
    );
  }

  // ── Desktop ──
  return (
    <Popover open={open} onOpenChange={handleOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={12}
        sticky="always"
        container={dialogContainer ?? undefined}
        className="w-[720px] overflow-hidden p-0"
        style={{ height: PANEL_HEIGHT, maxHeight: LIST_MAX_HEIGHT }}
      >
        <div className="flex h-full">
          <div className="flex w-[400px] shrink-0 flex-col border-r border-border">
            {listPanel}
          </div>
          <div
            className="flex w-[320px] shrink-0 flex-col overflow-hidden"
            style={{ height: PANEL_HEIGHT }}
          >
            {rightPanel === "filters" ? (
              <FiltersPanel
                filters={filters}
                setFilters={setFilters}
                variant={variant}
              />
            ) : rightPanel === "detail" && hovered ? (
              <div
                key={hovered.id}
                className="h-full animate-in fade-in-0 duration-300"
              >
                <ModelDetailCard
                  model={hovered}
                  tier={priceTier(hovered.outputCost)}
                  variant={variant}
                  onSelect={() => handleSelect(hovered.id)}
                />
              </div>
            ) : (
              <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                <MousePointerClick className="h-6 w-6 text-muted-foreground/40" />
                <p className="text-xs leading-relaxed text-muted-foreground/70">
                  Hover a model to preview its details, or click to select.
                </p>
              </div>
            )}
          </div>
        </div>
      </PopoverContent>
    </Popover>
  );
}
