"use client";

/**
 * ModelListDropdown — THE canonical model picker (formerly the "lab" picker).
 *
 * Desktop: a fixed-footprint popover — a tabular list on the left, a detail
 * card on the right that swaps to filter/sort panels. The footprint NEVER
 * resizes while open, so hovering a row (→ detail) or opening a filter panel
 * doesn't shift anything. Mobile: a bottom drawer with detail / filter
 * sub-views.
 *
 * Rows are dense and tabular (Maker · Name · Speed · Points · Usage) —
 * POINTS are the platform's user currency (points_per_million output shown in
 * the row; in · out in the detail card, labeled plainly). Full capability
 * data (modalities, every feature bucket incl. "Other", interaction,
 * multilingual, pricing) lives in the always-present detail card — nothing is
 * ever hidden. Modality/capability chips render straight from the stored
 * `capabilities` JSON (via useModelCatalog.parseCaps) — never hardcoded — so
 * data fixes flow through untouched. The count sits at the BOTTOM.
 *
 * Variants (internal — no prop): "user" is the default for everyone. Super
 * admins (selectIsSuperAdmin) get an "Admin" toggle in the bottom bar that
 * switches the picker into the admin variant IN PLACE — total transparency:
 * the popover widens with a third "Offerings" column showing, per offering,
 * the REAL provider_model_id / vendor / api / translator / transport /
 * $ pricing / priority / availability as explicit labeled rows, and every
 * displayed dimension (deprecated, vendor, api, availability, premium, maker,
 * service) is filterable and sortable. The DB enforces the same gate: the
 * admin catalog is only reachable via the `admin_model_catalog()` RPC
 * (42501 for non-admins).
 *
 * Filters (input/output modalities, features, interaction, language) are
 * seeded from props and adjustable. `inputModalities` is REQUIRED — a caller
 * must declare what the model has to accept; there is no default.
 */

import { useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  Languages,
  MousePointerClick,
  Search,
  Shield,
  SlidersHorizontal,
  Star,
  Type,
  Image as ImageIcon,
  AudioLines,
  Video,
  Boxes,
  FileText,
  Layers,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { useIsMobile } from "@/hooks/use-mobile";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { setPreference } from "@/lib/redux/preferences/userPreferencesSlice";
import { selectFavoriteModelIds } from "@/lib/redux/preferences/userPreferenceSelectors";
import { selectIsSuperAdmin } from "@/lib/redux/selectors/userSelectors";
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
  type AdminOffering,
  type CatalogModel,
  type CatalogTier,
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
  costRatingTier,
  speedRatingLabel,
  type PriceTier,
} from "@/features/ai-models/format";
import {
  SERVICE_LABEL,
  SERVICE_LABEL_PLURAL,
  serviceCountLabel,
} from "@/features/ai-models/constants/service-label";

const PANEL_HEIGHT = 440;
const LIST_MAX_HEIGHT = "min(440px, 70dvh)";
// Fixed column widths — the popover width is their sum per variant.
const LIST_WIDTH = 448; // widened for the Points column (the user currency)
const DETAIL_WIDTH = 360; // widened so modality/capability rows never wrap
const ADMIN_PANEL_WIDTH = 400; // admin-only third column (offerings)

type SortKey =
  | "name"
  | "maker"
  | "service"
  | "context"
  | "price"
  | "vendor"
  | "api"
  | "deprecated"
  | "availability"
  | "premium";

/** Sorts that only exist in the admin variant (reset on leaving admin). */
const ADMIN_ONLY_SORTS: ReadonlySet<SortKey> = new Set([
  "vendor",
  "api",
  "deprecated",
  "availability",
  "premium",
]);

type RightPanel = "detail" | "filters" | null;
type TriState = "any" | "yes" | "no";

const MODALITY_ICON: Record<Modality, typeof Type> = {
  text: Type,
  image: ImageIcon,
  audio: AudioLines,
  video: Video,
  document: FileText,
  entities: Boxes,
  embedding: Layers,
};

const INTERACTION_LABEL: Record<Interaction, string> = {
  turn: "Standard",
  single: "Single-shot",
  extraction: "Extraction",
  realtime: "Realtime",
  embedding: "Embedding",
};

interface ModelListDropdownProps {
  value: string | null | undefined;
  onValueChange: (modelId: string) => void;
  /** REQUIRED — input modalities the model must accept (seeds the filter). */
  inputModalities: Modality[];
  /** Optional — output modalities the model must produce (seeds the filter). */
  outputModalities?: Modality[];
  /**
   * Currently pinned `ai.offering` uuid (agent settings `offering_id`).
   * Only meaningful together with `onOfferingPinChange`. null/undefined =
   * "Auto (preferred)" — the server picks the preferred offering.
   */
  pinnedOfferingId?: string | null;
  /**
   * Enables the Service-chip pinning UI in the detail card. Called with the
   * offering uuid to pin, or `undefined` to clear the pin (back to Auto).
   * Selecting a model whose offerings don't include the current pin clears it.
   */
  onOfferingPinChange?: (offeringId: string | undefined) => void;
  className?: string;
}

// ── Small presentational bits ────────────────────────────────────────────────

function SpeedDots({ value }: { value: number | null }) {
  // Curated speed_rating: 1-5 dots; 6 renders as the "5+" band.
  const label = speedRatingLabel(value);
  return (
    <span
      className="inline-flex items-center gap-0.5"
      title={label == null ? "No speed rating yet" : `Speed ${label}/5`}
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
      {value != null && value >= 6 && (
        <span className="text-[9px] leading-none text-amber-500">+</span>
      )}
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
  // Chips render straight from stored capabilities — and NEVER wrap.
  return (
    <span className="inline-flex flex-nowrap items-center gap-1 whitespace-nowrap">
      {list.map((m) => {
        const Icon = MODALITY_ICON[m];
        return (
          <span
            key={m}
            className="inline-flex shrink-0 items-center gap-0.5 text-xs text-foreground/70"
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

// ── Admin offerings section (explicit, labeled, nothing hidden) ─────────────

/** One explicit "Label: value" row — never an inline abbreviation. */
function AdminRow({
  label,
  value,
  mono,
}: {
  label: string;
  value: string | null;
  mono?: boolean;
}) {
  return (
    <div className="flex items-baseline gap-2 whitespace-nowrap">
      <span className="w-[76px] shrink-0 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </span>
      <span
        className={cn(
          "min-w-0 truncate text-[11px] text-foreground/90",
          mono && "font-mono",
        )}
        title={value ?? undefined}
      >
        {value ?? "—"}
      </span>
    </div>
  );
}

function fmtUsd(n: number | null): string {
  return n == null ? "—" : `$${n}`;
}

/** Points (the user currency) — full number, e.g. "1,050". */
function fmtPoints(n: number | null): string {
  return n == null ? "—" : n.toLocaleString();
}

/** Points for the dense list row — compact, e.g. "150K". */
function fmtPointsCompact(n: number | null): string {
  return n == null
    ? "—"
    : new Intl.NumberFormat(undefined, {
        notation: "compact",
        maximumFractionDigits: 1,
      }).format(n);
}

function AdminOfferingBlock({
  offering,
  index,
  total,
}: {
  offering: AdminOffering;
  index: number;
  total: number;
}) {
  const unit = offering.usageBasis ? `/ ${offering.usageBasis}` : "/ 1M tokens";
  return (
    <div className="rounded-md border border-border p-2">
      <div className="mb-1.5 flex items-center justify-between gap-2">
        <span className="truncate text-[11px] font-semibold text-foreground">
          Offering {index + 1} of {total}
          {index === 0 ? " — preferred" : ""}
        </span>
        <span
          className={cn(
            "shrink-0 rounded px-1.5 py-0.5 text-[9px] font-medium",
            offering.isAvailable
              ? "bg-primary/10 text-foreground/80"
              : "bg-destructive/15 text-destructive",
          )}
        >
          {offering.isAvailable ? "Available" : "Unavailable"}
        </span>
      </div>
      <div className="space-y-0.5">
        <AdminRow label="Model" value={offering.providerModelId} mono />
        <AdminRow label="Vendor" value={offering.vendor} mono />
        <AdminRow label="API" value={offering.apiName} mono />
        <AdminRow label="Translator" value={offering.translatorKey} mono />
        <AdminRow label="Transport" value={offering.transport} mono />
        <AdminRow
          label="Endpoint"
          value={
            offering.endpointDisplayName || offering.endpointInternalName
              ? `${offering.endpointDisplayName ?? "—"} (${offering.endpointInternalName ?? "—"})`
              : null
          }
        />
        <AdminRow label="Priority" value={String(offering.priority)} mono />
        {/* Points — the user currency — shown ALONGSIDE the real $ pricing. */}
        <AdminRow
          label="Points in"
          value={
            offering.pointsInput == null
              ? null
              : `${fmtPoints(offering.pointsInput)} / 1M`
          }
          mono
        />
        <AdminRow
          label="Points out"
          value={
            offering.pointsOutput == null
              ? null
              : `${fmtPoints(offering.pointsOutput)} / 1M`
          }
          mono
        />
        {offering.pointsCachedInput != null && (
          <AdminRow
            label="Points cached"
            value={`${fmtPoints(offering.pointsCachedInput)} / 1M`}
            mono
          />
        )}
        {offering.pricing.length === 0 ? (
          <AdminRow label="Pricing" value="— (no pricing rows)" />
        ) : (
          offering.pricing.map((band, i) => (
            <div key={i} className="space-y-0.5">
              {band.maxTokens != null && (
                <AdminRow
                  label={`Band ${i + 1}`}
                  value={`≤ ${band.maxTokens.toLocaleString()} tokens`}
                />
              )}
              <AdminRow
                label="Input $"
                value={`${fmtUsd(band.inputPrice)} ${unit}`}
                mono
              />
              <AdminRow
                label="Output $"
                value={`${fmtUsd(band.outputPrice)} ${unit}`}
                mono
              />
              <AdminRow
                label="Cached $"
                value={`${fmtUsd(band.cachedInputPrice)} ${unit}`}
                mono
              />
            </div>
          ))
        )}
        {/* null usage_basis = standard $/1M-token billing (usageBasis SSOT).
            The loud MISSING case is media-specific and lives in the pricing
            editor/validator — here we just state the raw facts. */}
        <AdminRow
          label="Billing"
          value={
            offering.usageBasis
              ? `Usage basis: ${offering.usageBasis}`
              : offering.tokenBilled
                ? "Token-billed (provider-reported tokens)"
                : "Standard $ / 1M tokens"
          }
        />
        <AdminRow label="Offering" value={offering.offeringId} mono />
      </div>
    </div>
  );
}

/**
 * Total-transparency panel (admin variant only): EVERY offering of the model
 * with real vendor / api / provider_model_id / $ pricing / priority /
 * availability, as explicit labeled rows. Desktop: the popover's third
 * column. Mobile: appended below the detail card.
 */
function AdminOfferingsSection({ model }: { model: CatalogModel }) {
  const offerings = model.admin?.offerings ?? [];
  return (
    <div className="flex h-full flex-col">
      <div className="shrink-0 border-b border-border px-3 py-2 text-[10px] uppercase tracking-wide text-muted-foreground">
        Offerings — real vendor / wire data ({offerings.length})
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto p-2">
        {offerings.length === 0 ? (
          <div className="rounded-md border border-destructive/40 bg-destructive/10 p-2 text-[11px] text-destructive">
            No offerings — this model is not callable (a model without an
            `ai.offering` row cannot be routed).
          </div>
        ) : (
          offerings.map((o, i) => (
            <AdminOfferingBlock
              key={o.offeringId}
              offering={o}
              index={i}
              total={offerings.length}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ── Detail card (right column / mobile sub-view) ─────────────────────────────

// Service-chip styling — the selected style is the exact "default tier"
// highlight this card always used; unselected matches the plain tier chip.
const SERVICE_CHIP_SELECTED =
  "rounded border border-primary/40 bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-foreground";
const SERVICE_CHIP_UNSELECTED =
  "rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground/80";

function ModelDetailCard({
  model,
  tier,
  variant,
  onSelect,
  isCurrentModel,
  pinnedOfferingId,
  onPinOffering,
  includeAdminSection,
}: {
  model: CatalogModel;
  tier: PriceTier | null;
  variant: ModelCatalogVariant;
  onSelect: () => void;
  /** Whether this card shows the currently-selected model. */
  isCurrentModel?: boolean;
  /** Pinned ai.offering uuid (offering_id) — only shown as selected on the current model. */
  pinnedOfferingId?: string | null;
  /** When provided, Service chips become pin toggles (undefined = Auto). */
  onPinOffering?: (
    model: CatalogModel,
    offeringId: string | undefined,
  ) => void;
  /** Mobile only: append the admin offerings section inside the card scroll. */
  includeAdminSection?: boolean;
}) {
  // A pin only renders as selected on the model it belongs to.
  const pinnedHere = (t: CatalogTier) =>
    !!isCurrentModel && !!pinnedOfferingId && t.offeringId === pinnedOfferingId;
  const anyPinnedHere = model.tiers.some(pinnedHere);
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
                  className="whitespace-nowrap rounded border border-border px-1.5 py-0.5 text-[10px] text-foreground/80"
                  title={FEATURE_BUCKETS[b].description}
                >
                  {FEATURE_BUCKETS[b].label}
                </span>
              ))}
            </dd>
          </div>
        )}

        <div className="grid grid-cols-2 gap-2">
          {/* POINTS — the platform's user currency, front and center. */}
          <div className="col-span-2">
            <dt className="text-[10px] uppercase tracking-wide text-muted-foreground">
              Points / 1M tokens
            </dt>
            <dd
              className="whitespace-nowrap text-sm font-semibold tabular-nums text-foreground"
              title="Points per 1 million tokens — what usage actually costs you"
            >
              {model.pointsInput == null && model.pointsOutput == null
                ? "—"
                : `${fmtPoints(model.pointsInput)} in · ${fmtPoints(model.pointsOutput)} out`}
            </dd>
          </div>
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
              Speed
            </dt>
            <dd>
              <SpeedDots value={model.speedRating} />
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

        {/* Services — the endpoint's PUBLIC Matrx brand only (Matrx
            Fast / Matrx Lightning / ...). Never a vendor name (the admin
            variant's Offerings column carries the real vendor). When
            `onPinOffering` is provided the chips are pin toggles: clicking a
            Service pins the call to that exact offering (persisted as
            settings.offering_id); "Auto" (the default) lets the server pick
            the preferred offering by priority. Clicking the pinned chip
            unpins (back to Auto). Otherwise the chips are display-only and
            the first (preferred) tier is highlighted. */}
        {model.tiers.length > 0 && model.tiers[0].servedVia && (
          <div>
            <dt className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              {model.tiers.length === 1 ? SERVICE_LABEL : SERVICE_LABEL_PLURAL}
            </dt>
            <dd className="flex flex-wrap gap-1">
              {onPinOffering ? (
                <>
                  <button
                    type="button"
                    onClick={() => onPinOffering(model, undefined)}
                    title="Auto — the server picks the preferred Service for each call"
                    className={cn(
                      "transition-colors",
                      !anyPinnedHere
                        ? SERVICE_CHIP_SELECTED
                        : cn(
                            SERVICE_CHIP_UNSELECTED,
                            "hover:bg-muted/60 hover:text-foreground",
                          ),
                    )}
                  >
                    Auto
                  </button>
                  {model.tiers.map((t) => {
                    const pinned = pinnedHere(t);
                    return (
                      <button
                        key={t.offeringId}
                        type="button"
                        onClick={() =>
                          onPinOffering(model, pinned ? undefined : t.offeringId)
                        }
                        title={
                          pinned
                            ? "Pinned — every call uses this Service. Click to return to Auto."
                            : `Pin every call to ${t.servedVia}`
                        }
                        className={cn(
                          "transition-colors",
                          pinned
                            ? SERVICE_CHIP_SELECTED
                            : cn(
                                SERVICE_CHIP_UNSELECTED,
                                "hover:bg-muted/60 hover:text-foreground",
                              ),
                        )}
                      >
                        {t.servedVia}
                      </button>
                    );
                  })}
                </>
              ) : (
                model.tiers.map((t, i) => (
                  <span
                    key={t.offeringId}
                    className={
                      i === 0
                        ? SERVICE_CHIP_SELECTED
                        : SERVICE_CHIP_UNSELECTED
                    }
                    title={
                      i === 0
                        ? "Default serving tier"
                        : "Also available on this tier"
                    }
                  >
                    {t.servedVia}
                  </span>
                ))
              )}
            </dd>
          </div>
        )}

        {model.multilingual && (
          <div className="flex items-center gap-1 text-foreground/80">
            <Languages className="h-3.5 w-3.5" />
            <span>Multilingual</span>
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

      {/* Mobile: the admin offerings section lives inside the card scroll. */}
      {includeAdminSection && variant === "admin" && (
        <div className="mt-3 rounded-md border border-border">
          <AdminOfferingsSection model={model} />
        </div>
      )}
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
  /** Model makers (brand: OpenAI / Google / Anthropic …). Empty = any. */
  makers: Set<string>;
  /** Branded serving names (`served_via`: Matrx Fast / Lightning / …). Empty = any. */
  services: Set<string>;
  interaction: Interaction | "any";
  multilingualOnly: boolean;
  sort: SortKey;
  // ── Admin-only dimensions (always "any"/empty in the user variant) ──
  /** Real serving vendors (ai.endpoint.vendor). Empty = any. */
  vendors: Set<string>;
  /** Real api names (ai.api.name). Empty = any. */
  apis: Set<string>;
  /** yes = deprecated only, no = active only. */
  deprecated: TriState;
  /** yes = has an available offering, no = none available. */
  availability: TriState;
  /** yes = premium only, no = standard only. */
  premium: TriState;
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

function TriStateChips({
  value,
  onChange,
  yesLabel,
  noLabel,
}: {
  value: TriState;
  onChange: (next: TriState) => void;
  yesLabel: string;
  noLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-1">
      {(
        [
          ["any", "Any"],
          ["yes", yesLabel],
          ["no", noLabel],
        ] as const
      ).map(([key, label]) => (
        <ChipToggle
          key={key}
          active={value === key}
          onClick={() => onChange(key)}
        >
          {label}
        </ChipToggle>
      ))}
    </div>
  );
}

function FilterSection({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="mb-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        {label}
      </div>
      {children}
    </div>
  );
}

function FiltersPanel({
  filters,
  setFilters,
  variant,
  makerOptions,
  serviceOptions,
  vendorOptions,
  apiOptions,
}: {
  filters: Filters;
  setFilters: React.Dispatch<React.SetStateAction<Filters>>;
  variant: ModelCatalogVariant;
  /** Distinct makers present in the catalog (sorted). */
  makerOptions: string[];
  /** Distinct branded serving names present in the catalog (sorted). */
  serviceOptions: string[];
  /** Admin: distinct real vendors present in the catalog (sorted). */
  vendorOptions: string[];
  /** Admin: distinct real api names present in the catalog (sorted). */
  apiOptions: string[];
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
  const toggleSetValue = (
    kind: "makers" | "services" | "vendors" | "apis",
    value: string,
  ) =>
    setFilters((f) => {
      const next = new Set(f[kind]);
      if (next.has(value)) next.delete(value);
      else next.add(value);
      return { ...f, [kind]: next };
    });

  const sortOptions: { key: SortKey; label: string }[] = [
    { key: "name", label: "Name" },
    { key: "maker", label: "Maker" },
    { key: "service", label: SERVICE_LABEL },
    { key: "context", label: "Context" },
    { key: "price", label: variant === "admin" ? "Price ($/M out)" : "Usage" },
    ...(variant === "admin"
      ? ([
          { key: "vendor", label: "Vendor" },
          { key: "api", label: "API" },
          { key: "deprecated", label: "Deprecated" },
          { key: "availability", label: "Availability" },
          { key: "premium", label: "Premium" },
        ] as { key: SortKey; label: string }[])
      : []),
  ];

  const setChip = (kind: "makers" | "services" | "vendors" | "apis") => (
    <div className="flex flex-wrap gap-1">
      <ChipToggle
        active={filters[kind].size === 0}
        onClick={() => setFilters((f) => ({ ...f, [kind]: new Set() }))}
      >
        Any
      </ChipToggle>
      {(kind === "makers"
        ? makerOptions
        : kind === "services"
          ? serviceOptions
          : kind === "vendors"
            ? vendorOptions
            : apiOptions
      ).map((v) => (
        <ChipToggle
          key={v}
          active={filters[kind].has(v)}
          onClick={() => toggleSetValue(kind, v)}
        >
          {v}
        </ChipToggle>
      ))}
    </div>
  );

  return (
    <div className="flex h-full flex-col gap-3 overflow-y-auto p-3 text-xs">
      <FilterSection label="Sort by">
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
      </FilterSection>

      {/* Modality filters at the TOP of the filter area (owner spec). */}
      <FilterSection label="Input">
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
      </FilterSection>

      <FilterSection label="Output">
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
      </FilterSection>

      <FilterSection label="Features">
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
      </FilterSection>

      <FilterSection label="Interaction">
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
      </FilterSection>

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

      {/* Admin-only dimensions — everything displayed is filterable. */}
      {variant === "admin" && (
        <>
          <FilterSection label="Deprecated">
            <TriStateChips
              value={filters.deprecated}
              onChange={(v) => setFilters((f) => ({ ...f, deprecated: v }))}
              yesLabel="Deprecated only"
              noLabel="Active only"
            />
          </FilterSection>

          <FilterSection label="Availability">
            <TriStateChips
              value={filters.availability}
              onChange={(v) => setFilters((f) => ({ ...f, availability: v }))}
              yesLabel="Available"
              noLabel="Unavailable"
            />
          </FilterSection>

          <FilterSection label="Premium">
            <TriStateChips
              value={filters.premium}
              onChange={(v) => setFilters((f) => ({ ...f, premium: v }))}
              yesLabel="Premium only"
              noLabel="Standard only"
            />
          </FilterSection>

          {/* Real serving vendors — ADMIN eyes only. */}
          <FilterSection label="Vendor">{setChip("vendors")}</FilterSection>

          {/* Real wire APIs — ADMIN eyes only. */}
          <FilterSection label="API">{setChip("apis")}</FilterSection>
        </>
      )}

      {/* Maker + Service at the BOTTOM of the filter area (owner spec). */}
      <FilterSection label="Maker">{setChip("makers")}</FilterSection>

      {/* Branded serving names ONLY (served_via) — never a real vendor. */}
      <FilterSection label={SERVICE_LABEL}>{setChip("services")}</FilterSection>
    </div>
  );
}

// ── Row ──────────────────────────────────────────────────────────────────────

function ModelRow({
  model,
  tier,
  variant,
  selected,
  isFavorite,
  onSelect,
  onHover,
  onToggleFavorite,
}: {
  model: CatalogModel;
  tier: PriceTier | null;
  variant: ModelCatalogVariant;
  selected: boolean;
  isFavorite: boolean;
  onSelect: () => void;
  onHover?: () => void;
  onToggleFavorite: () => void;
}) {
  const unavailable =
    variant === "admin" &&
    !(model.admin?.offerings ?? []).some((o) => o.isAvailable);
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
        "grid w-full cursor-pointer grid-cols-[auto_minmax(0,72px)_minmax(0,1fr)_auto_auto_auto] items-center gap-2 rounded px-2 py-1 transition-colors",
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
        {unavailable && (
          <span
            className="shrink-0 rounded bg-destructive/15 px-1 text-[9px] text-destructive"
            title="No available offerings — not callable"
          >
            off
          </span>
        )}
        {/* Availability: how many branded Services offer this model. */}
        {model.tiers.length > 1 && (
          <span
            className="shrink-0 rounded border border-primary/40 bg-primary/10 px-1 text-[9px] font-medium text-foreground/80"
            title={model.tiers.map((t) => t.servedVia).join(" · ")}
          >
            {serviceCountLabel(model.tiers.length)}
          </span>
        )}
      </span>
      <SpeedDots value={model.speedRating} />
      {/* Points — the user currency (per 1M output tokens). */}
      <span
        className="w-11 whitespace-nowrap text-right font-mono text-[11px] tabular-nums text-foreground/80"
        title={
          model.pointsOutput == null
            ? "No points pricing yet"
            : `${fmtPoints(model.pointsInput)} in · ${fmtPoints(model.pointsOutput)} out points / 1M tokens`
        }
      >
        {fmtPointsCompact(model.pointsOutput)}
      </span>
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
  inputModalities,
  outputModalities,
  pinnedOfferingId,
  onOfferingPinChange,
  className,
}: ModelListDropdownProps) {
  const isMobile = useIsMobile();
  const dialogContainer = useDialogContainer();
  const dispatch = useAppDispatch();
  const favoriteIds = useAppSelector(selectFavoriteModelIds);
  // The admin variant is super-admin only. The toggle is invisible to
  // everyone else, and the DB enforces the same gate (admin_model_catalog
  // raises 42501 for non-admins) — the UI gate is convenience, not security.
  const isSuperAdmin = useAppSelector(selectIsSuperAdmin);
  const [adminMode, setAdminMode] = useState(false);
  const variant: ModelCatalogVariant =
    adminMode && isSuperAdmin ? "admin" : "user";
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
    makers: new Set<string>(),
    services: new Set<string>(),
    interaction: "any",
    multilingualOnly: false,
    sort: "name",
    vendors: new Set<string>(),
    apis: new Set<string>(),
    deprecated: "any",
    availability: "any",
    premium: "any",
  }));

  /**
   * Switch user ⇄ admin in place. Leaving admin clears every admin-only
   * dimension (they'd otherwise filter/sort invisibly with no UI to undo).
   */
  const setVariantMode = (nextAdmin: boolean) => {
    setAdminMode(nextAdmin);
    setHovered(null);
    if (!nextAdmin) {
      setFilters((f) => ({
        ...f,
        vendors: new Set<string>(),
        apis: new Set<string>(),
        deprecated: "any",
        availability: "any",
        premium: "any",
        sort: ADMIN_ONLY_SORTS.has(f.sort) ? "name" : f.sort,
      }));
    }
  };

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

  // Distinct maker / Service / vendor / API option lists from the catalog.
  const makerOptions = useMemo(
    () =>
      [...new Set(models.map((m) => m.maker).filter((v): v is string => !!v))].sort(
        (a, b) => a.localeCompare(b),
      ),
    [models],
  );
  const serviceOptions = useMemo(
    () =>
      [
        ...new Set(
          models.flatMap((m) => m.tiers.map((t) => t.servedVia)).filter(Boolean),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [models],
  );
  const vendorOptions = useMemo(
    () =>
      [
        ...new Set(
          models
            .flatMap((m) => (m.admin?.offerings ?? []).map((o) => o.vendor))
            .filter((v): v is string => !!v),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [models],
  );
  const apiOptions = useMemo(
    () =>
      [
        ...new Set(
          models
            .flatMap((m) => (m.admin?.offerings ?? []).map((o) => o.apiName))
            .filter((v): v is string => !!v),
        ),
      ].sort((a, b) => a.localeCompare(b)),
    [models],
  );

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const hasAvailable = (m: CatalogModel) =>
      (m.admin?.offerings ?? []).some((o) => o.isAvailable);
    const rows = models.filter((m) => {
      if (tab === "favorites" && !favoriteSet.has(m.id)) return false;
      // Search matches name, maker, branded Service names — and, in the
      // admin variant, real vendor / api / provider_model_id too.
      const haystack = [
        m.name,
        m.maker,
        ...m.tiers.map((t) => t.servedVia),
        ...(variant === "admin"
          ? (m.admin?.offerings ?? []).flatMap((o) => [
              o.vendor,
              o.apiName,
              o.providerModelId,
            ])
          : []),
      ];
      if (q && !haystack.some((f) => f?.toLowerCase().includes(q)))
        return false;
      if (filters.makers.size > 0 && (!m.maker || !filters.makers.has(m.maker)))
        return false;
      if (
        filters.services.size > 0 &&
        !m.tiers.some((t) => filters.services.has(t.servedVia))
      )
        return false;
      if (
        filters.vendors.size > 0 &&
        !(m.admin?.offerings ?? []).some(
          (o) => o.vendor != null && filters.vendors.has(o.vendor),
        )
      )
        return false;
      if (
        filters.apis.size > 0 &&
        !(m.admin?.offerings ?? []).some(
          (o) => o.apiName != null && filters.apis.has(o.apiName),
        )
      )
        return false;
      if (filters.deprecated !== "any") {
        if ((filters.deprecated === "yes") !== m.isDeprecated) return false;
      }
      if (filters.availability !== "any") {
        if ((filters.availability === "yes") !== hasAvailable(m)) return false;
      }
      if (filters.premium !== "any") {
        if ((filters.premium === "yes") !== m.isPremium) return false;
      }
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
        case "service":
          // Preferred (first) Service brand; models on more Services first
          // within the same brand.
          return (
            (a.tiers[0]?.servedVia ?? "￿").localeCompare(
              b.tiers[0]?.servedVia ?? "￿",
            ) || b.tiers.length - a.tiers.length
          );
        case "context":
          return (b.contextWindow ?? 0) - (a.contextWindow ?? 0);
        case "price": {
          // User: curated cost rating. Admin: real $ output price (first
          // pricing band of the preferred offering). Nulls last.
          const price = (m: CatalogModel) =>
            (variant === "admin" ? m.outputCost : m.costRating) ?? Infinity;
          return price(a) - price(b) || a.name.localeCompare(b.name);
        }
        case "vendor":
          return (
            (a.admin?.offerings[0]?.vendor ?? "￿").localeCompare(
              b.admin?.offerings[0]?.vendor ?? "￿",
            ) || a.name.localeCompare(b.name)
          );
        case "api":
          return (
            (a.admin?.offerings[0]?.apiName ?? "￿").localeCompare(
              b.admin?.offerings[0]?.apiName ?? "￿",
            ) || a.name.localeCompare(b.name)
          );
        case "deprecated":
          return (
            Number(a.isDeprecated) - Number(b.isDeprecated) ||
            a.name.localeCompare(b.name)
          );
        case "availability": {
          const avail = (m: CatalogModel) =>
            (m.admin?.offerings ?? []).filter((o) => o.isAvailable).length;
          return avail(b) - avail(a) || a.name.localeCompare(b.name);
        }
        case "premium":
          return (
            Number(b.isPremium) - Number(a.isPremium) ||
            a.name.localeCompare(b.name)
          );
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
  }, [models, query, filters, tab, favoriteSet, variant]);

  const activeFilterCount =
    filters.input.size +
    filters.output.size +
    filters.features.size +
    filters.makers.size +
    filters.services.size +
    filters.vendors.size +
    filters.apis.size +
    (filters.deprecated !== "any" ? 1 : 0) +
    (filters.availability !== "any" ? 1 : 0) +
    (filters.premium !== "any" ? 1 : 0) +
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
    // A pinned offering belongs to exactly one model — selecting a model whose
    // offerings don't include the pin clears it (back to Auto), loudly.
    if (onOfferingPinChange && pinnedOfferingId) {
      const next = models.find((m) => m.id === id);
      const pinStillValid =
        next?.tiers.some((t) => t.offeringId === pinnedOfferingId) ?? false;
      if (!pinStillValid) {
        console.warn(
          `[ModelListDropdown] Cleared pinned Service offering ${pinnedOfferingId} — it does not belong to the newly selected model ${id}; routing returns to Auto (preferred).`,
        );
        onOfferingPinChange(undefined);
      }
    }
    onValueChange(id);
    handleOpen(false);
  };

  /**
   * Pin/unpin a Service offering from the detail card. Pinning an offering of
   * a model that isn't currently selected also selects that model — the pin is
   * the exact call (model × endpoint × api), so the two always move together.
   * `undefined` clears the pin (Auto). The popover/drawer stays open so the
   * toggle state is visible.
   */
  const handlePinOffering = (
    model: CatalogModel,
    offeringId: string | undefined,
  ) => {
    if (!onOfferingPinChange) return;
    if (model.id !== value) onValueChange(model.id);
    onOfferingPinChange(offeringId);
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
      <div className="grid grid-cols-[auto_minmax(0,72px)_minmax(0,1fr)_auto_auto_auto] gap-2 border-b border-border px-2 py-1 text-[10px] uppercase tracking-wide text-muted-foreground">
        <span className="w-4" />
        <span>Maker</span>
        <span>Name</span>
        <span>Speed</span>
        <span
          className="w-11 text-right"
          title="Points per 1M output tokens — the usage currency"
        >
          Points
        </span>
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
                If this is a 42501, the admin_model_catalog RPC rejected your
                role (super admin required).
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
              tier={costRatingTier(m.costRating)}
              variant={variant}
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

      {/* Count — at the BOTTOM, not prime real estate. Super admins also get
          the in-place admin-variant toggle here. */}
      <div className="flex items-center justify-between gap-2 border-t border-border px-2 py-1 text-[10px] text-muted-foreground">
        <span>
          {filtered.length} of {models.length} model
          {models.length === 1 ? "" : "s"}
        </span>
        {isSuperAdmin && (
          <button
            type="button"
            onClick={() => setVariantMode(variant !== "admin")}
            title={
              variant === "admin"
                ? "Admin view — real vendor/api/$ data. Click to return to the user view."
                : "Switch to the admin view (real vendor/api/$ data)"
            }
            className={cn(
              "inline-flex items-center gap-1 rounded px-1.5 py-0.5 transition-colors",
              variant === "admin"
                ? "bg-primary/10 text-foreground"
                : "hover:text-foreground",
            )}
          >
            <Shield className="h-3 w-3" />
            Admin
          </button>
        )}
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
                    tier={costRatingTier(mobileDetail.costRating)}
                    variant={variant}
                    onSelect={() => handleSelect(mobileDetail.id)}
                    isCurrentModel={mobileDetail.id === value}
                    pinnedOfferingId={pinnedOfferingId}
                    onPinOffering={
                      onOfferingPinChange ? handlePinOffering : undefined
                    }
                    includeAdminSection
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
                    makerOptions={makerOptions}
                    serviceOptions={serviceOptions}
                    vendorOptions={vendorOptions}
                    apiOptions={apiOptions}
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
  const popoverWidth =
    LIST_WIDTH + DETAIL_WIDTH + (variant === "admin" ? ADMIN_PANEL_WIDTH : 0);
  const adminPanelModel = hovered ?? selected;
  return (
    <Popover open={open} onOpenChange={handleOpen} modal={false}>
      <PopoverTrigger asChild>{trigger}</PopoverTrigger>
      <PopoverContent
        align="start"
        sideOffset={4}
        collisionPadding={12}
        sticky="always"
        container={dialogContainer ?? undefined}
        className="overflow-hidden p-0"
        style={{
          width: popoverWidth,
          maxWidth: "calc(100vw - 24px)",
          height: PANEL_HEIGHT,
          maxHeight: LIST_MAX_HEIGHT,
        }}
      >
        <div className="flex h-full">
          <div
            className="flex shrink-0 flex-col border-r border-border"
            style={{ width: LIST_WIDTH }}
          >
            {listPanel}
          </div>
          <div
            className="flex shrink-0 flex-col overflow-hidden"
            style={{ width: DETAIL_WIDTH, height: PANEL_HEIGHT }}
          >
            {rightPanel === "filters" ? (
              <FiltersPanel
                filters={filters}
                setFilters={setFilters}
                variant={variant}
                makerOptions={makerOptions}
                serviceOptions={serviceOptions}
                vendorOptions={vendorOptions}
                apiOptions={apiOptions}
              />
            ) : rightPanel === "detail" && hovered ? (
              <div
                key={hovered.id}
                className="h-full animate-in fade-in-0 duration-300"
              >
                <ModelDetailCard
                  model={hovered}
                  tier={costRatingTier(hovered.costRating)}
                  variant={variant}
                  onSelect={() => handleSelect(hovered.id)}
                  isCurrentModel={hovered.id === value}
                  pinnedOfferingId={pinnedOfferingId}
                  onPinOffering={
                    onOfferingPinChange ? handlePinOffering : undefined
                  }
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
          {/* Admin extension column — the LARGE total-transparency section. */}
          {variant === "admin" && (
            <div
              className="flex shrink-0 flex-col overflow-hidden border-l border-border"
              style={{ width: ADMIN_PANEL_WIDTH, height: PANEL_HEIGHT }}
            >
              {adminPanelModel ? (
                <AdminOfferingsSection model={adminPanelModel} />
              ) : (
                <div className="flex flex-1 flex-col items-center justify-center gap-2 px-6 text-center">
                  <Shield className="h-6 w-6 text-muted-foreground/40" />
                  <p className="text-xs leading-relaxed text-muted-foreground/70">
                    Hover a model to see every offering&apos;s real vendor,
                    api, provider model id and $ pricing.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
