"use client";

/**
 * Print pricing calculator — the P10 calculator's first living surface.
 *
 * Capability AND experience parity with Lulu's own pricing page, in OUR
 * design system: a reactive constraint graph fed entirely from
 * `GET /lulu/catalog` (nothing about the product matrix is hardcoded here),
 * invalid options disabled live with an inline reason, a book preview drawn
 * to the chosen trim, and a debounced `POST /lulu/price` once every field is
 * set. Their layout and information hierarchy; our tokens, our components,
 * none of their branding or assets.
 *
 * Brief: common-docs/projects/npm-package-extraction/LULU-INTEGRATION-BRIEF.md
 * § "The calculator surface — UX spec".
 *
 * Production placement comes later with the course-creator surfaces; this is
 * the (dev) demo that proves the surface against the real server.
 */

import { useEffect, useState } from "react";
import {
  BookOpen,
  Check,
  Info,
  Layers,
  MapPin,
  Palette,
  RefreshCcw,
  Ruler,
  Sparkle,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectLabel,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/utils/cn";
import {
  EMPTY_SELECTION,
  availabilityFor,
  pageWindowFor,
  pruneInvalidSelections,
  resolveCombination,
  selectionPatch,
} from "./catalog";
import {
  fetchCatalog,
  fetchPrice,
  fetchShippingOptions,
  toFetchState,
} from "./lulu-api";
import {
  decorateBinding,
  decorateColor,
  decorateCoverFinish,
  decoratePaper,
  colorLabel,
  paperLabel,
  trimName,
  trimSizeClass,
  trimSizeLine,
} from "./labels";
import { BookPreview } from "./BookPreview";
import { BulkTierTable, MobilePriceBar, PricePanel } from "./PricePanel";
import {
  AwaitingCredentialsCard,
  ConfiguratorSkeleton,
  UpstreamErrorCard,
} from "./LuluStateCards";
import { OptionGrid, type OptionGridEntry } from "./OptionGrid";
import type {
  BulkTier,
  LuluBindingGroup,
  LuluCatalog,
  LuluDimension,
  LuluFetchState,
  LuluOption,
  LuluPriceResult,
  LuluSelection,
  LuluShippingOption,
  LuluTrimOption,
} from "./types";

// ---------------------------------------------------------------------------
// Demo destinations — a cost calculation needs a real deliverable address.
// These are sample ship-to points for the demo only; the production surface
// takes the buyer's own address.
// ---------------------------------------------------------------------------

interface Destination {
  id: string;
  label: string;
  countryCode: string;
  city: string;
  postcode: string;
  street1: string;
  stateCode: string | null;
}

const DESTINATIONS: Destination[] = [
  {
    id: "us",
    label: "United States — Los Angeles, CA",
    countryCode: "US",
    city: "Los Angeles",
    postcode: "90001",
    street1: "1 Sample Street",
    stateCode: "CA",
  },
  {
    id: "ca",
    label: "Canada — Toronto, ON",
    countryCode: "CA",
    city: "Toronto",
    postcode: "M5H 2N2",
    street1: "1 Sample Street",
    stateCode: "ON",
  },
  {
    id: "gb",
    label: "United Kingdom — London",
    countryCode: "GB",
    city: "London",
    postcode: "EC1A 1BB",
    street1: "1 Sample Street",
    stateCode: null,
  },
  {
    id: "au",
    label: "Australia — Sydney, NSW",
    countryCode: "AU",
    city: "Sydney",
    postcode: "2000",
    street1: "1 Sample Street",
    stateCode: "NSW",
  },
  {
    id: "de",
    label: "Germany — Berlin",
    countryCode: "DE",
    city: "Berlin",
    postcode: "10115",
    street1: "1 Sample Street",
    stateCode: null,
  },
];

/** Lulu requires a phone number on every quote address; demo-only value. */
const DEMO_PHONE_NUMBER = "+1 555 555 0100";

const BULK_TIERS: BulkTier[] = [
  { quantity: 100, label: "100–499", expectedDiscountLabel: "5% volume tier" },
  { quantity: 500, label: "500–999", expectedDiscountLabel: "10% volume tier" },
  { quantity: 1000, label: "1000+", expectedDiscountLabel: "15% volume tier" },
];

const PRICE_DEBOUNCE_MS = 500;

// ---------------------------------------------------------------------------
// Small presentational helpers
// ---------------------------------------------------------------------------

function Section({
  step,
  icon,
  title,
  hint,
  children,
}: {
  step: number;
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-2.5 text-base font-semibold text-foreground">
          <span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-muted text-xs font-semibold tabular-nums text-muted-foreground">
            {step}
          </span>
          <span className="flex items-center gap-1.5">
            {icon}
            {title}
          </span>
        </h2>
        {hint ? (
          <span className="text-xs font-medium text-muted-foreground">
            {hint}
          </span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

/** Right-rail completeness list — Lulu's checklist, in our tokens. */
function SpecList({
  rows,
}: {
  rows: { id: string; label: string; value: string | null }[];
}) {
  return (
    <dl className="divide-y divide-border rounded-2xl border border-border bg-card">
      {rows.map((row) => (
        <div
          key={row.id}
          className="flex items-baseline justify-between gap-3 px-4 py-2.5"
        >
          <dt className="flex items-center gap-1.5 text-xs font-medium uppercase tracking-wide text-muted-foreground">
            {row.value !== null ? (
              <Check className="size-3 text-success" strokeWidth={3} />
            ) : (
              <span className="size-3 rounded-full border border-dashed border-muted-foreground/50" />
            )}
            {row.label}
          </dt>
          <dd
            className={cn(
              "text-right text-xs font-medium",
              row.value !== null
                ? "text-foreground"
                : "text-muted-foreground/60",
            )}
          >
            {row.value ?? "Not selected"}
          </dd>
        </div>
      ))}
    </dl>
  );
}

function labelFor(options: LuluOption[], id: string | null): string | null {
  if (id === null) return null;
  return options.find((option) => option.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

/**
 * Every async result is stored KEYED by the request that produced it, and the
 * rendered state is derived from whether that key still matches what the user
 * is looking at. That is what keeps the effects write-only on settle: an
 * effect here never calls setState synchronously in its body, so a keystroke
 * cannot cascade renders, and a stale response can never paint.
 */
interface Keyed<T> {
  key: string;
  state: LuluFetchState<T>;
}

export default function LuluPricingDemoPage() {
  const [catalogState, setCatalogState] = useState<LuluFetchState<LuluCatalog>>({
    status: "loading",
  });
  const [catalogAttempt, setCatalogAttempt] = useState(0);

  const [selection, setSelection] = useState<LuluSelection>(EMPTY_SELECTION);
  const [pageCountText, setPageCountText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [destinationId, setDestinationId] = useState(DESTINATIONS[0].id);

  const [shippingResult, setShippingResult] =
    useState<Keyed<LuluShippingOption[]> | null>(null);
  const [shippingChoice, setShippingChoice] = useState<{
    key: string;
    level: string;
  } | null>(null);

  const [priceResult, setPriceResult] = useState<Keyed<LuluPriceResult> | null>(
    null,
  );
  const [priceAttempt, setPriceAttempt] = useState(0);

  /** Tier prices, cached by `${configKey}@${quantity}` — never refetched. */
  const [tierCache, setTierCache] = useState<
    Record<string, LuluFetchState<LuluPriceResult>>
  >({});

  const destination =
    DESTINATIONS.find((entry) => entry.id === destinationId) ?? DESTINATIONS[0];

  // ── Catalog ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    fetchCatalog(controller.signal)
      .then((catalog) => {
        if (!controller.signal.aborted) {
          setCatalogState({ status: "ready", data: catalog });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setCatalogState(toFetchState<LuluCatalog>(error));
        }
      });
    return () => controller.abort();
  }, [catalogAttempt]);

  function retryCatalog() {
    setCatalogState({ status: "loading" });
    setCatalogAttempt((n) => n + 1);
  }

  const catalog = catalogState.status === "ready" ? catalogState.data : null;
  const previewOnly = catalogState.status !== "ready";

  const combination = catalog ? resolveCombination(catalog, selection) : null;
  const podPackageId = combination?.podPackageId ?? null;
  const pageWindow = catalog
    ? pageWindowFor(catalog, selection)
    : { min: null, max: null };

  // ── Shipping options — the upstream needs a concrete line item, so the
  // levels load once the configuration resolves to a package.
  const shippingKey =
    podPackageId !== null && selection.pageCount !== null
      ? `${destination.countryCode}#${podPackageId}#${selection.pageCount}#q${quantity}#${catalogAttempt}`
      : null;
  const shippingState: LuluFetchState<LuluShippingOption[]> =
    shippingKey === null
      ? { status: "idle" }
      : shippingResult?.key === shippingKey
        ? shippingResult.state
        : { status: "loading" };

  useEffect(() => {
    if (
      shippingKey === null ||
      podPackageId === null ||
      selection.pageCount === null
    ) {
      return;
    }
    const controller = new AbortController();
    const key = shippingKey;
    fetchShippingOptions(
      {
        countryCode: destination.countryCode,
        stateCode: destination.stateCode,
        podPackageId,
        pageCount: selection.pageCount,
        quantity,
      },
      controller.signal,
    )
      .then((options) => {
        if (!controller.signal.aborted) {
          setShippingResult({ key, state: { status: "ready", data: options } });
        }
      })
      .catch((error: unknown) => {
        if (!controller.signal.aborted) {
          setShippingResult({
            key,
            state: toFetchState<LuluShippingOption[]>(error),
          });
        }
      });
    return () => controller.abort();
  }, [
    shippingKey,
    podPackageId,
    selection.pageCount,
    quantity,
    destination.countryCode,
    destination.stateCode,
  ]);

  // First available level is the default until the user picks one for THIS
  // country; changing destination therefore resets the choice with no effect.
  const shippingLevel: string | null =
    shippingChoice?.key === destination.countryCode
      ? shippingChoice.level
      : shippingState.status === "ready"
        ? (shippingState.data[0]?.level ?? null)
        : null;

  const configKey =
    podPackageId !== null && selection.pageCount !== null && shippingLevel !== null
      ? `${podPackageId}|${selection.pageCount}|${destination.id}|${shippingLevel}`
      : null;

  // ── Debounced live price ─────────────────────────────────────────────────
  const priceKey =
    configKey === null || quantity < 1
      ? null
      : `${configKey}|q${quantity}|a${priceAttempt}`;

  const priceState: LuluFetchState<LuluPriceResult> =
    priceKey === null
      ? { status: "idle" }
      : priceResult?.key === priceKey
        ? priceResult.state
        : { status: "loading" };

  useEffect(() => {
    if (
      priceKey === null ||
      podPackageId === null ||
      selection.pageCount === null ||
      shippingLevel === null
    ) {
      return;
    }
    const controller = new AbortController();
    const key = priceKey;
    const request = {
      podPackageId,
      pageCount: selection.pageCount,
      quantity,
      shippingLevel,
      address: {
        city: destination.city,
        countryCode: destination.countryCode,
        postcode: destination.postcode,
        street1: destination.street1,
        stateCode: destination.stateCode,
        phoneNumber: DEMO_PHONE_NUMBER,
      },
    };
    const timer = setTimeout(() => {
      fetchPrice(request, controller.signal)
        .then((result) => {
          if (!controller.signal.aborted) {
            setPriceResult({ key, state: { status: "ready", data: result } });
          }
        })
        .catch((error: unknown) => {
          if (!controller.signal.aborted) {
            setPriceResult({ key, state: toFetchState<LuluPriceResult>(error) });
          }
        });
    }, PRICE_DEBOUNCE_MS);

    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    priceKey,
    podPackageId,
    selection.pageCount,
    shippingLevel,
    quantity,
    destination,
  ]);

  // ── Bulk tiers — derived straight from the cache, no effect ──────────────
  const tierResults: Record<number, LuluFetchState<LuluPriceResult>> = {};
  for (const tier of BULK_TIERS) {
    const cached =
      configKey === null
        ? undefined
        : tierCache[`${configKey}@${tier.quantity}`];
    if (cached) tierResults[tier.quantity] = cached;
  }

  const tiersCalculating = BULK_TIERS.some(
    (tier) => tierResults[tier.quantity]?.status === "loading",
  );

  function calculateTiers() {
    if (
      configKey === null ||
      podPackageId === null ||
      selection.pageCount === null ||
      shippingLevel === null
    ) {
      return;
    }
    const pageCount = selection.pageCount;
    const address = {
      city: destination.city,
      countryCode: destination.countryCode,
      postcode: destination.postcode,
      street1: destination.street1,
      stateCode: destination.stateCode,
      phoneNumber: DEMO_PHONE_NUMBER,
    };
    for (const tier of BULK_TIERS) {
      const cacheKey = `${configKey}@${tier.quantity}`;
      if (tierCache[cacheKey]?.status === "ready") continue;

      setTierCache((prev) => ({ ...prev, [cacheKey]: { status: "loading" } }));
      fetchPrice({
        podPackageId,
        pageCount,
        quantity: tier.quantity,
        shippingLevel,
        address,
      })
        .then((result) => {
          setTierCache((prev) => ({
            ...prev,
            [cacheKey]: { status: "ready", data: result },
          }));
        })
        .catch((error: unknown) => {
          setTierCache((prev) => ({
            ...prev,
            [cacheKey]: toFetchState<LuluPriceResult>(error),
          }));
        });
    }
  }

  // ── Selection updates ────────────────────────────────────────────────────
  function chooseOption(dimension: LuluDimension, optionId: string) {
    if (!catalog) return;
    setSelection((prev) => {
      const current =
        dimension === "trim"
          ? prev.trimId
          : dimension === "binding"
            ? prev.bindingId
            : dimension === "color"
              ? prev.colorId
              : dimension === "paper"
                ? prev.paperId
                : prev.coverFinishId;
      // Clicking the selected option clears it, so a user can back out of a
      // dead-end combination without resetting everything.
      const patch =
        current === optionId
          ? selectionPatchClear(dimension)
          : selectionPatch(dimension, optionId);
      return pruneInvalidSelections(catalog, { ...prev, ...patch }, dimension);
    });
  }

  function selectionPatchClear(dimension: LuluDimension): Partial<LuluSelection> {
    switch (dimension) {
      case "trim":
        return { trimId: null };
      case "binding":
        return { bindingId: null };
      case "color":
        return { colorId: null };
      case "paper":
        return { paperId: null };
      case "coverFinish":
        return { coverFinishId: null };
    }
  }

  function changePageCount(raw: string) {
    setPageCountText(raw);
    const parsed = Number(raw);
    const pageCount =
      raw.trim().length > 0 && Number.isFinite(parsed) && parsed > 0
        ? Math.floor(parsed)
        : null;
    setSelection((prev) => {
      const next = { ...prev, pageCount };
      return catalog ? pruneInvalidSelections(catalog, next) : next;
    });
  }

  function entriesFor(
    dimension: LuluDimension,
    decorated: { option: LuluOption; label: string; hint: string | null }[],
  ): OptionGridEntry[] {
    return decorated.map(({ option, label, hint }) => ({
      option,
      label,
      hint,
      availability: catalog
        ? availabilityFor(catalog, selection, dimension, option.id)
        : { available: false, reason: null },
    }));
  }

  // ── Right rail spec list ─────────────────────────────────────────────────
  const selectedTrim =
    catalog?.trims.find((trim) => trim.id === selection.trimId) ?? null;
  const selectedBinding =
    catalog?.bindings.find((binding) => binding.id === selection.bindingId) ??
    null;

  const specRows = [
    {
      id: "trim",
      label: "Size",
      value: selectedTrim ? trimName(selectedTrim) : null,
    },
    {
      id: "pages",
      label: "Pages",
      value: selection.pageCount === null ? null : `${selection.pageCount}`,
    },
    {
      id: "binding",
      label: "Binding",
      value: labelFor(catalog?.bindings ?? [], selection.bindingId),
    },
    {
      id: "color",
      label: "Interior",
      value: selection.colorId === null ? null : colorLabel(selection.colorId),
    },
    {
      id: "paper",
      label: "Paper",
      value:
        selection.paperId === null ? null : paperLabel(selection.paperId).label,
    },
    {
      id: "coverFinish",
      label: "Cover",
      value: labelFor(catalog?.coverFinishes ?? [], selection.coverFinishId),
    },
    {
      id: "shipping",
      label: "Shipping",
      value:
        shippingLevel === null
          ? null
          : ((shippingState.status === "ready"
              ? shippingState.data.find((o) => o.level === shippingLevel)?.label
              : null) ?? shippingLevel),
    },
  ];
  const missingFields = specRows
    .filter((row) => row.value === null)
    .map((row) => row.label.toLowerCase());

  const bindingGroups: { group: LuluBindingGroup; title: string }[] = [
    { group: "paperback", title: "Paperback" },
    { group: "hardcover", title: "Hardcover" },
  ];

  const pageHint =
    pageWindow.min !== null || pageWindow.max !== null
      ? `${pageWindow.min ?? 1}–${pageWindow.max ?? "∞"} pages for this selection`
      : null;

  // Group the size dropdown the way the catalog classes them (Small/Medium…).
  const trimGroups = new Map<string, LuluTrimOption[]>();
  for (const trim of catalog?.trims ?? []) {
    const sizeClass = trimSizeClass(trim);
    const bucket = trimGroups.get(sizeClass) ?? [];
    bucket.push(trim);
    trimGroups.set(sizeClass, bucket);
  }

  const belowMinimum =
    selection.pageCount !== null &&
    pageWindow.min !== null &&
    selection.pageCount < pageWindow.min;
  const aboveMaximum =
    selection.pageCount !== null &&
    pageWindow.max !== null &&
    selection.pageCount > pageWindow.max;

  return (
    <div className="mx-auto w-full max-w-[80rem] px-4 py-8 lg:px-8 lg:py-12">
      <header className="mb-10 max-w-3xl space-y-3">
        <h1 className="text-4xl font-semibold tracking-tight text-foreground">
          Print pricing calculator
        </h1>
        <p className="text-base leading-relaxed text-muted-foreground">
          Build your book and see exactly what it costs to print and ship —
          priced live, the moment every option is set. Combinations that
          can&apos;t be printed switch themselves off as you go.
        </p>
        {catalog?.retrievedAt ? (
          <p className="text-xs text-muted-foreground/70">
            Catalog updated {catalog.retrievedAt.slice(0, 10)}
          </p>
        ) : null}
      </header>

      {catalogState.status === "awaiting_credentials" ? (
        <div className="mb-8">
          <AwaitingCredentialsCard
            detail={catalogState.detail}
            onRetry={retryCatalog}
            retrying={false}
          />
        </div>
      ) : null}

      {catalogState.status === "error" ? (
        <div className="mb-8">
          <UpstreamErrorCard
            headline={catalogState.headline}
            detail={catalogState.detail}
            onRetry={retryCatalog}
            retrying={false}
          />
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-10 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
        {/* ── Configurator ───────────────────────────────────────────────── */}
        <div className="space-y-10">
          {catalogState.status === "loading" ? (
            <ConfiguratorSkeleton />
          ) : (
            <>
              <Section
                step={1}
                icon={<Ruler className="size-4 text-muted-foreground" />}
                title="Size & page count"
                hint={pageHint}
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-[minmax(0,1fr)_11rem]">
                  <div className="space-y-1.5">
                    <Label htmlFor="lulu-trim" className="text-xs">
                      Book size
                    </Label>
                    <Select
                      value={selection.trimId ?? ""}
                      onValueChange={(id) => chooseOption("trim", id)}
                      disabled={previewOnly}
                    >
                      <SelectTrigger id="lulu-trim" className="h-11">
                        <SelectValue placeholder="Choose a book size" />
                      </SelectTrigger>
                      <SelectContent>
                        {[...trimGroups.entries()].map(([sizeClass, trims]) => (
                          <SelectGroup key={sizeClass}>
                            <SelectLabel>{sizeClass}</SelectLabel>
                            {trims.map((trim) => {
                              const availability = catalog
                                ? availabilityFor(
                                    catalog,
                                    selection,
                                    "trim",
                                    trim.id,
                                  )
                                : { available: true, reason: null };
                              return (
                                <SelectItem
                                  key={trim.id}
                                  value={trim.id}
                                  disabled={
                                    !availability.available &&
                                    trim.id !== selection.trimId
                                  }
                                >
                                  <span className="font-medium">
                                    {trimName(trim)}
                                  </span>
                                  <span className="ml-2 text-muted-foreground">
                                    {trimSizeLine(trim)}
                                  </span>
                                </SelectItem>
                              );
                            })}
                          </SelectGroup>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label htmlFor="lulu-pages" className="text-xs">
                      Page count
                    </Label>
                    <Input
                      id="lulu-pages"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={pageCountText}
                      disabled={previewOnly}
                      onChange={(event) => changePageCount(event.target.value)}
                      placeholder="e.g. 200"
                      className="h-11"
                    />
                  </div>
                </div>

                {belowMinimum || aboveMaximum ? (
                  <p className="flex items-center gap-1.5 text-xs font-medium text-destructive">
                    <Info className="size-3.5 shrink-0" />
                    {belowMinimum
                      ? `That is below the ${pageWindow.min}-page minimum for this selection.`
                      : `That is above the ${pageWindow.max}-page maximum for this selection.`}
                  </p>
                ) : null}
              </Section>

              <Section
                step={2}
                icon={<BookOpen className="size-4 text-muted-foreground" />}
                title="Binding"
              >
                <div className="space-y-5">
                  {bindingGroups.map(({ group, title }) => {
                    const groupOptions = (catalog?.bindings ?? []).filter(
                      (binding) => binding.group === group,
                    );
                    if (groupOptions.length === 0) return null;
                    return (
                      <div key={group} className="space-y-2.5">
                        <p className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                          {title}
                        </p>
                        <OptionGrid
                          entries={entriesFor(
                            "binding",
                            groupOptions.map(decorateBinding),
                          )}
                          selectedId={selection.bindingId}
                          onSelect={(id) => chooseOption("binding", id)}
                          columns={3}
                          disabled={previewOnly}
                        />
                      </div>
                    );
                  })}
                </div>
              </Section>

              <Section
                step={3}
                icon={<Palette className="size-4 text-muted-foreground" />}
                title="Interior color"
              >
                <OptionGrid
                  entries={entriesFor(
                    "color",
                    (catalog?.colors ?? []).map(decorateColor),
                  )}
                  selectedId={selection.colorId}
                  onSelect={(id) => chooseOption("color", id)}
                  columns={2}
                  disabled={previewOnly}
                />
              </Section>

              <Section
                step={4}
                icon={<Layers className="size-4 text-muted-foreground" />}
                title="Paper"
              >
                <OptionGrid
                  entries={entriesFor(
                    "paper",
                    (catalog?.papers ?? []).map(decoratePaper),
                  )}
                  selectedId={selection.paperId}
                  onSelect={(id) => chooseOption("paper", id)}
                  columns={3}
                  disabled={previewOnly}
                />
              </Section>

              <Section
                step={5}
                icon={<Sparkle className="size-4 text-muted-foreground" />}
                title="Cover finish"
              >
                <OptionGrid
                  entries={entriesFor(
                    "coverFinish",
                    (catalog?.coverFinishes ?? []).map(decorateCoverFinish),
                  )}
                  selectedId={selection.coverFinishId}
                  onSelect={(id) => chooseOption("coverFinish", id)}
                  columns={3}
                  disabled={previewOnly}
                />
              </Section>

              <Section
                step={6}
                icon={<Truck className="size-4 text-muted-foreground" />}
                title="Quantity & delivery"
              >
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <div className="space-y-1.5">
                    <Label htmlFor="lulu-quantity" className="text-xs">
                      Quantity
                    </Label>
                    <Input
                      id="lulu-quantity"
                      type="number"
                      inputMode="numeric"
                      min={1}
                      value={quantity}
                      disabled={previewOnly}
                      onChange={(event) => {
                        const parsed = Number(event.target.value);
                        setQuantity(
                          Number.isFinite(parsed) && parsed >= 1
                            ? Math.floor(parsed)
                            : 1,
                        );
                      }}
                      className="h-11"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="flex items-center gap-1 text-xs">
                      <MapPin className="size-3" />
                      Ship to
                    </Label>
                    <Select
                      value={destinationId}
                      onValueChange={setDestinationId}
                      disabled={previewOnly}
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue placeholder="Select a destination" />
                      </SelectTrigger>
                      <SelectContent>
                        {DESTINATIONS.map((entry) => (
                          <SelectItem key={entry.id} value={entry.id}>
                            {entry.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Shipping speed</Label>
                    <Select
                      value={shippingLevel ?? ""}
                      onValueChange={(level) =>
                        setShippingChoice({
                          key: destination.countryCode,
                          level,
                        })
                      }
                      disabled={
                        previewOnly ||
                        shippingState.status !== "ready" ||
                        shippingState.data.length === 0
                      }
                    >
                      <SelectTrigger className="h-11">
                        <SelectValue
                          placeholder={
                            shippingState.status === "idle"
                              ? "Finish the book first"
                              : shippingState.status === "loading"
                                ? "Loading options…"
                                : shippingState.status === "ready" &&
                                    shippingState.data.length === 0
                                  ? "No options for this country"
                                  : "Select a speed"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {shippingState.status === "ready"
                          ? shippingState.data.map((option) => (
                              <SelectItem key={option.level} value={option.level}>
                                <span className="font-medium">
                                  {option.label}
                                </span>
                                {option.sublabel ? (
                                  <span className="ml-2 text-muted-foreground">
                                    {option.sublabel}
                                  </span>
                                ) : null}
                              </SelectItem>
                            ))
                          : null}
                      </SelectContent>
                    </Select>
                  </div>
                </div>

                {shippingState.status === "awaiting_credentials" ? (
                  <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
                    <Info className="size-3.5" />
                    Shipping speeds load once the print service is connected.
                  </p>
                ) : null}
                {shippingState.status === "error" ? (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <Info className="size-3.5" />
                    {shippingState.headline}
                  </p>
                ) : null}
              </Section>

              <BulkTierTable
                tiers={BULK_TIERS}
                results={tierResults}
                currency={
                  priceState.status === "ready" ? priceState.data.currency : null
                }
                onCalculate={configKey === null ? null : calculateTiers}
                calculating={tiersCalculating}
              />
            </>
          )}
        </div>

        {/* ── Right rail ─────────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-6 lg:self-start">
          <BookPreview
            trim={selectedTrim}
            binding={selectedBinding}
            pageCount={selection.pageCount}
            coverFinishId={selection.coverFinishId}
          />

          <PricePanel
            state={priceState}
            quantity={quantity}
            missingFields={missingFields}
            onRetry={() => setPriceAttempt((n) => n + 1)}
          />

          <SpecList rows={specRows} />

          {podPackageId ? (
            <p className="px-1 text-[0.6875rem] leading-relaxed text-muted-foreground/70">
              Product code{" "}
              <code className="font-mono text-muted-foreground">
                {podPackageId}
              </code>
            </p>
          ) : null}

          <Button
            variant="ghost"
            size="sm"
            className="w-full text-muted-foreground"
            onClick={() => {
              setSelection(EMPTY_SELECTION);
              setPageCountText("");
              setQuantity(1);
            }}
            disabled={previewOnly}
          >
            <RefreshCcw className="size-3.5" />
            Start over
          </Button>
        </aside>
      </div>

      <MobilePriceBar state={priceState} quantity={quantity} />
    </div>
  );
}
