"use client";

/**
 * Lulu live-pricing calculator — the P10 calculator's first living surface.
 *
 * Capability parity with Lulu's own pricing page, in OUR design system: a
 * reactive constraint graph fed entirely from `GET /lulu/catalog` (nothing
 * about the product matrix is hardcoded here), invalid options disabled live
 * with an inline reason, a right-rail completeness checklist, and a debounced
 * `POST /lulu/price` once every field is set. No Lulu branding or assets.
 *
 * Brief: common-docs/projects/npm-package-extraction/LULU-INTEGRATION-BRIEF.md
 * § "The calculator surface — UX spec".
 *
 * Production placement comes later with the course-creator surfaces; this is
 * the (dev) demo that proves the surface against the real server.
 */

import { useEffect, useRef, useState } from "react";
import {
  BookOpen,
  Calculator,
  Info,
  MapPin,
  Package,
  RefreshCcw,
  Truck,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
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
import { BulkTierTable, PricePanel } from "./PricePanel";
import {
  AwaitingCredentialsCard,
  ConfiguratorSkeleton,
  UpstreamErrorCard,
} from "./LuluStateCards";
import { OptionGrid, type OptionGridEntry } from "./OptionGrid";
import { RequirementChecklist, type ChecklistRow } from "./RequirementChecklist";
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
  icon,
  title,
  hint,
  children,
}: {
  icon: React.ReactNode;
  title: string;
  hint?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          {icon}
          {title}
        </h2>
        {hint ? (
          <span className="text-xs text-muted-foreground">{hint}</span>
        ) : null}
      </div>
      {children}
    </section>
  );
}

function labelFor(options: LuluOption[], id: string | null): string | null {
  if (id === null) return null;
  return options.find((option) => option.id === id)?.label ?? id;
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------

export default function LuluPricingDemoPage() {
  const [catalogState, setCatalogState] = useState<LuluFetchState<LuluCatalog>>({
    status: "loading",
  });
  const [catalogAttempt, setCatalogAttempt] = useState(0);

  const [selection, setSelection] = useState<LuluSelection>(EMPTY_SELECTION);
  const [pageCountText, setPageCountText] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [destinationId, setDestinationId] = useState(DESTINATIONS[0].id);
  const [shippingLevel, setShippingLevel] = useState<string | null>(null);

  const [shippingState, setShippingState] = useState<
    LuluFetchState<LuluShippingOption[]>
  >({ status: "idle" });

  const [priceState, setPriceState] = useState<LuluFetchState<LuluPriceResult>>({
    status: "idle",
  });
  const [priceAttempt, setPriceAttempt] = useState(0);

  const [tierResults, setTierResults] = useState<
    Record<number, LuluFetchState<LuluPriceResult>>
  >({});
  const tierCache = useRef(new Map<string, LuluFetchState<LuluPriceResult>>());

  const destination =
    DESTINATIONS.find((entry) => entry.id === destinationId) ?? DESTINATIONS[0];

  // ── Catalog ──────────────────────────────────────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setCatalogState({ status: "loading" });
    fetchCatalog(controller.signal)
      .then((catalog) => {
        if (!cancelled) setCatalogState({ status: "ready", data: catalog });
      })
      .catch((error: unknown) => {
        if (!cancelled && !controller.signal.aborted) {
          setCatalogState(toFetchState<LuluCatalog>(error));
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [catalogAttempt]);

  // ── Shipping options, per destination country ────────────────────────────
  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;
    setShippingState({ status: "loading" });
    setShippingLevel(null);
    fetchShippingOptions(destination.countryCode, controller.signal)
      .then((options) => {
        if (cancelled) return;
        setShippingState({ status: "ready", data: options });
        if (options.length > 0) setShippingLevel(options[0].level);
      })
      .catch((error: unknown) => {
        if (!cancelled && !controller.signal.aborted) {
          setShippingState(toFetchState<LuluShippingOption[]>(error));
        }
      });
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [destination.countryCode, catalogAttempt]);

  const catalog = catalogState.status === "ready" ? catalogState.data : null;
  const previewOnly = catalogState.status !== "ready";

  const combination = catalog ? resolveCombination(catalog, selection) : null;
  const podPackageId = combination?.podPackageId ?? null;
  const pageWindow = catalog
    ? pageWindowFor(catalog, selection)
    : { min: null, max: null };

  const configKey =
    podPackageId !== null && selection.pageCount !== null && shippingLevel !== null
      ? `${podPackageId}|${selection.pageCount}|${destination.id}|${shippingLevel}`
      : null;

  // ── Debounced live price ─────────────────────────────────────────────────
  useEffect(() => {
    if (
      podPackageId === null ||
      selection.pageCount === null ||
      shippingLevel === null ||
      quantity < 1
    ) {
      setPriceState({ status: "idle" });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setPriceState({ status: "loading" });
    const timer = setTimeout(() => {
      fetchPrice(
        {
          podPackageId,
          pageCount: selection.pageCount ?? 0,
          quantity,
          shippingLevel,
          address: {
            city: destination.city,
            countryCode: destination.countryCode,
            postcode: destination.postcode,
            street1: destination.street1,
            stateCode: destination.stateCode,
          },
        },
        controller.signal,
      )
        .then((result) => {
          if (!cancelled) setPriceState({ status: "ready", data: result });
        })
        .catch((error: unknown) => {
          if (!cancelled && !controller.signal.aborted) {
            setPriceState(toFetchState<LuluPriceResult>(error));
          }
        });
    }, PRICE_DEBOUNCE_MS);

    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [
    podPackageId,
    selection.pageCount,
    shippingLevel,
    quantity,
    destination,
    priceAttempt,
  ]);

  // ── Bulk tiers reset when the configuration changes ──────────────────────
  useEffect(() => {
    if (configKey === null) {
      setTierResults({});
      return;
    }
    const restored: Record<number, LuluFetchState<LuluPriceResult>> = {};
    for (const tier of BULK_TIERS) {
      const cached = tierCache.current.get(`${configKey}@${tier.quantity}`);
      if (cached) restored[tier.quantity] = cached;
    }
    setTierResults(restored);
  }, [configKey]);

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
    for (const tier of BULK_TIERS) {
      const cacheKey = `${configKey}@${tier.quantity}`;
      const cached = tierCache.current.get(cacheKey);
      if (cached && cached.status === "ready") continue;

      setTierResults((prev) => ({ ...prev, [tier.quantity]: { status: "loading" } }));
      fetchPrice({
        podPackageId,
        pageCount,
        quantity: tier.quantity,
        shippingLevel,
        address: {
          city: destination.city,
          countryCode: destination.countryCode,
          postcode: destination.postcode,
          street1: destination.street1,
          stateCode: destination.stateCode,
        },
      })
        .then((result) => {
          const next: LuluFetchState<LuluPriceResult> = {
            status: "ready",
            data: result,
          };
          tierCache.current.set(cacheKey, next);
          setTierResults((prev) => ({ ...prev, [tier.quantity]: next }));
        })
        .catch((error: unknown) => {
          const next = toFetchState<LuluPriceResult>(error);
          tierCache.current.set(cacheKey, next);
          setTierResults((prev) => ({ ...prev, [tier.quantity]: next }));
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
    options: LuluOption[],
  ): OptionGridEntry[] {
    return options.map((option) => ({
      option,
      availability: catalog
        ? availabilityFor(catalog, selection, dimension, option.id)
        : { available: false, reason: null },
    }));
  }

  // ── Checklist ────────────────────────────────────────────────────────────
  const checklistRows: ChecklistRow[] = [
    {
      id: "trim",
      label: "Trim size",
      value: labelFor(catalog?.trims ?? [], selection.trimId),
    },
    {
      id: "pages",
      label: "Page count",
      value: selection.pageCount === null ? null : `${selection.pageCount} pages`,
    },
    {
      id: "binding",
      label: "Binding",
      value: labelFor(catalog?.bindings ?? [], selection.bindingId),
    },
    {
      id: "color",
      label: "Interior color",
      value: labelFor(catalog?.colors ?? [], selection.colorId),
    },
    {
      id: "paper",
      label: "Paper type",
      value: labelFor(catalog?.papers ?? [], selection.paperId),
    },
    {
      id: "coverFinish",
      label: "Cover finish",
      value: labelFor(catalog?.coverFinishes ?? [], selection.coverFinishId),
    },
    { id: "quantity", label: "Quantity", value: `${quantity}` },
    { id: "destination", label: "Ship to", value: destination.label },
    {
      id: "shipping",
      label: "Shipping level",
      value:
        shippingLevel === null
          ? null
          : (shippingState.status === "ready"
              ? shippingState.data.find((o) => o.level === shippingLevel)?.label
              : null) ?? shippingLevel,
    },
  ];
  const missingFields = checklistRows
    .filter((row) => row.value === null)
    .map((row) => row.label.toLowerCase());

  const bindingGroups: { group: LuluBindingGroup; title: string }[] = [
    { group: "paperback", title: "Paperback" },
    { group: "hardcover", title: "Hardcover" },
  ];

  const pageHint =
    pageWindow.min !== null || pageWindow.max !== null
      ? `${pageWindow.min ?? 1}–${pageWindow.max ?? "∞"} pages available`
      : null;

  return (
    <div className="mx-auto w-full max-w-7xl space-y-6 p-4 lg:p-6">
      <header className="space-y-1">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-foreground">
          <Calculator className="size-5 text-muted-foreground" />
          Print pricing calculator
        </h1>
        <p className="max-w-3xl text-sm text-muted-foreground">
          Live print-on-demand pricing over the aidream <code>/lulu</code>{" "}
          service. Every option below comes from the ingested product catalog —
          invalid combinations disable themselves as you configure, and a
          complete configuration prices itself against the live cost API.
        </p>
        {catalog?.retrievedAt ? (
          <p className="text-xs text-muted-foreground">
            Catalog{catalog.source ? ` · ${catalog.source}` : ""} · retrieved{" "}
            {catalog.retrievedAt}
          </p>
        ) : null}
      </header>

      {catalogState.status === "awaiting_credentials" ? (
        <AwaitingCredentialsCard
          detail={catalogState.detail}
          onRetry={() => setCatalogAttempt((n) => n + 1)}
          retrying={false}
        />
      ) : null}

      {catalogState.status === "error" ? (
        <UpstreamErrorCard
          headline={catalogState.headline}
          detail={catalogState.detail}
          onRetry={() => setCatalogAttempt((n) => n + 1)}
          retrying={false}
        />
      ) : null}

      <div className="grid grid-cols-1 gap-6 lg:grid-cols-[minmax(0,1fr)_20rem]">
        {/* ── Configurator ───────────────────────────────────────────────── */}
        <div className="space-y-6">
          {catalogState.status === "loading" ? (
            <ConfiguratorSkeleton />
          ) : (
            <>
              <Section
                icon={<BookOpen className="size-4 text-muted-foreground" />}
                title="Trim size"
              >
                <OptionGrid
                  entries={entriesFor("trim", catalog?.trims ?? [])}
                  selectedId={selection.trimId}
                  onSelect={(id) => chooseOption("trim", id)}
                  columns={3}
                  disabled={previewOnly}
                />
              </Section>

              <Section
                icon={<Package className="size-4 text-muted-foreground" />}
                title="Page count"
                hint={pageHint}
              >
                <div className="flex flex-wrap items-center gap-3">
                  <Input
                    type="number"
                    inputMode="numeric"
                    min={1}
                    value={pageCountText}
                    disabled={previewOnly}
                    onChange={(event) => changePageCount(event.target.value)}
                    placeholder="e.g. 200"
                    className="h-9 w-40"
                    aria-label="Page count"
                  />
                  {selection.pageCount !== null &&
                  pageWindow.min !== null &&
                  selection.pageCount < pageWindow.min ? (
                    <span className="text-xs text-destructive">
                      Below the minimum for the current selection.
                    </span>
                  ) : selection.pageCount !== null &&
                    pageWindow.max !== null &&
                    selection.pageCount > pageWindow.max ? (
                    <span className="text-xs text-destructive">
                      Above the maximum for the current selection.
                    </span>
                  ) : (
                    <span className="text-xs text-muted-foreground">
                      The available range narrows as you pick binding and paper.
                    </span>
                  )}
                </div>
              </Section>

              <Section
                icon={<BookOpen className="size-4 text-muted-foreground" />}
                title="Binding"
              >
                <div className="space-y-4">
                  {bindingGroups.map(({ group, title }) => {
                    const groupOptions = (catalog?.bindings ?? []).filter(
                      (binding) => binding.group === group,
                    );
                    if (groupOptions.length === 0) return null;
                    return (
                      <div key={group} className="space-y-2">
                        <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                          {title}
                        </p>
                        <OptionGrid
                          entries={entriesFor("binding", groupOptions)}
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
                icon={<Package className="size-4 text-muted-foreground" />}
                title="Interior color"
              >
                <OptionGrid
                  entries={entriesFor("color", catalog?.colors ?? [])}
                  selectedId={selection.colorId}
                  onSelect={(id) => chooseOption("color", id)}
                  columns={2}
                  disabled={previewOnly}
                />
              </Section>

              <Section
                icon={<Package className="size-4 text-muted-foreground" />}
                title="Paper type"
              >
                <OptionGrid
                  entries={entriesFor("paper", catalog?.papers ?? [])}
                  selectedId={selection.paperId}
                  onSelect={(id) => chooseOption("paper", id)}
                  columns={2}
                  disabled={previewOnly}
                />
              </Section>

              <Section
                icon={<Package className="size-4 text-muted-foreground" />}
                title="Cover finish"
              >
                <OptionGrid
                  entries={entriesFor("coverFinish", catalog?.coverFinishes ?? [])}
                  selectedId={selection.coverFinishId}
                  onSelect={(id) => chooseOption("coverFinish", id)}
                  columns={2}
                  disabled={previewOnly}
                />
              </Section>

              <Section
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
                      className="h-9"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">
                      <MapPin className="mr-1 inline size-3" />
                      Ship to
                    </Label>
                    <Select
                      value={destinationId}
                      onValueChange={setDestinationId}
                      disabled={previewOnly}
                    >
                      <SelectTrigger className="h-9">
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
                    <Label className="text-xs">Shipping level</Label>
                    <Select
                      value={shippingLevel ?? ""}
                      onValueChange={setShippingLevel}
                      disabled={
                        previewOnly ||
                        shippingState.status !== "ready" ||
                        shippingState.data.length === 0
                      }
                    >
                      <SelectTrigger className="h-9">
                        <SelectValue
                          placeholder={
                            shippingState.status === "loading"
                              ? "Loading options…"
                              : shippingState.status === "ready" &&
                                  shippingState.data.length === 0
                                ? "No options for this country"
                                : "Select a level"
                          }
                        />
                      </SelectTrigger>
                      <SelectContent>
                        {shippingState.status === "ready"
                          ? shippingState.data.map((option) => (
                              <SelectItem key={option.level} value={option.level}>
                                {option.label}
                                {option.sublabel ? ` · ${option.sublabel}` : ""}
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
                    Shipping levels load once the Lulu sandbox credentials are
                    connected.
                  </p>
                ) : null}
                {shippingState.status === "error" ? (
                  <p className="flex items-center gap-1.5 text-xs text-destructive">
                    <Info className="size-3.5" />
                    {shippingState.headline}
                  </p>
                ) : null}
              </Section>

              {podPackageId ? (
                <p className="flex flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
                  <Package className="size-3.5" />
                  Resolved package
                  <code className="rounded border border-border bg-card px-1.5 py-0.5 font-mono text-foreground">
                    {podPackageId}
                  </code>
                </p>
              ) : null}
            </>
          )}
        </div>

        {/* ── Right rail ─────────────────────────────────────────────────── */}
        <aside className="space-y-4 lg:sticky lg:top-4 lg:self-start">
          <RequirementChecklist rows={checklistRows} />

          <PricePanel
            state={priceState}
            quantity={quantity}
            missingFields={missingFields}
            onRetry={() => setPriceAttempt((n) => n + 1)}
          />

          <BulkTierTable
            tiers={BULK_TIERS}
            results={tierResults}
            currency={
              priceState.status === "ready" ? priceState.data.currency : null
            }
            onCalculate={configKey === null ? null : calculateTiers}
            calculating={tiersCalculating}
          />

          <Button
            variant="outline"
            size="sm"
            className={cn("w-full")}
            onClick={() => {
              setSelection(EMPTY_SELECTION);
              setPageCountText("");
              setQuantity(1);
            }}
            disabled={previewOnly}
          >
            <RefreshCcw className="size-3.5" />
            Reset configuration
          </Button>
        </aside>
      </div>
    </div>
  );
}
