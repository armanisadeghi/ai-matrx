"use client";

/**
 * Live price breakdown + the bulk-discount tier table.
 *
 * Every money value on the wire is a decimal STRING; nothing here does
 * arithmetic on a formatted value. When the selection is incomplete the panel
 * renders "—" rather than a zero, so an empty state never reads as free.
 */

import { Layers, Loader2, RefreshCcw } from "lucide-react";
import { Button } from "@/components/ui/button";
import { cn } from "@/utils/cn";
import { formatMoney, parseMoney } from "./lulu-api";
import { PriceSkeleton } from "./LuluStateCards";
import type { BulkTier, LuluFetchState, LuluPriceResult } from "./types";

// ---------------------------------------------------------------------------
// Derivations from a price response
// ---------------------------------------------------------------------------

export function unitPriceOf(
  result: LuluPriceResult,
  quantity: number,
): number | null {
  const line = result.lineItems[0];
  if (!line) return null;
  // The EFFECTIVE per-book price: bulk discounts land on the line total, not
  // on `unit_tier_cost`, so divide the discounted total — this is the number
  // Lulu's own tier table shows falling as quantity rises.
  const total = parseMoney(line.totalCostExclTax);
  if (total !== null && quantity > 0) return total / quantity;
  return parseMoney(line.unitTierCost);
}

function feeTotal(result: LuluPriceResult, feeType: string): number | null {
  let sum: number | null = null;
  for (const fee of result.fees) {
    if ((fee.feeType ?? "").toUpperCase() !== feeType) continue;
    const value = parseMoney(fee.totalCostExclTax ?? fee.totalCostInclTax);
    if (value === null) continue;
    sum = (sum ?? 0) + value;
  }
  return sum;
}

function shippingAndHandling(result: LuluPriceResult): number | null {
  const shipping = parseMoney(
    result.shipping?.totalCostExclTax ?? result.shipping?.totalCostInclTax ?? null,
  );
  const handling = feeTotal(result, "HANDLING_FEE");
  if (shipping === null && handling === null) return null;
  return (shipping ?? 0) + (handling ?? 0);
}

function fulfillmentFee(result: LuluPriceResult): number | null {
  const block = parseMoney(
    result.fulfillment?.totalCostExclTax ??
      result.fulfillment?.totalCostInclTax ??
      null,
  );
  if (block !== null) return block;
  return feeTotal(result, "FULFILLMENT_FEE");
}
// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

function PriceRow({
  label,
  value,
  emphasis = false,
  tone = "default",
}: {
  label: string;
  value: string;
  emphasis?: boolean;
  tone?: "default" | "positive";
}) {
  return (
    <div className="flex items-baseline justify-between gap-4">
      <span
        className={cn(
          "text-sm",
          emphasis ? "font-semibold text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
      </span>
      <span
        className={cn(
          "tabular-nums",
          emphasis ? "text-base font-semibold" : "text-sm",
          tone === "positive" ? "text-success" : "text-foreground",
        )}
      >
        {value}
      </span>
    </div>
  );
}

/**
 * The hero number. Lulu's calculator makes the per-book price the largest
 * thing on the page, and it is the number a course creator is actually
 * shopping for — so it gets the same weight here.
 */
function HeroPrice({
  amount,
  currency,
  quantity,
  muted = false,
}: {
  amount: string;
  currency: string | null;
  quantity: number;
  muted?: boolean;
}) {
  return (
    <div className="flex flex-col items-center gap-0.5 px-4 py-6 text-center">
      <span
        className={cn(
          "text-5xl font-semibold tracking-tight tabular-nums",
          muted ? "text-muted-foreground/50" : "text-foreground",
        )}
      >
        {amount}
      </span>
      <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
        {currency ?? "USD"} per book
        {quantity > 1 ? ` · ${quantity} copies` : ""}
      </span>
    </div>
  );
}

/**
 * Phone-only price bar.
 *
 * On a narrow screen the full panel sits below six configuration steps, so the
 * number you are shopping for scrolls out of sight exactly while you change
 * the things that move it. This keeps it pinned.
 */
export function MobilePriceBar({
  state,
  quantity,
}: {
  state: LuluFetchState<LuluPriceResult>;
  quantity: number;
}) {
  if (state.status === "idle") return null;

  const ready = state.status === "ready" ? state.data : null;
  const unit = ready ? unitPriceOf(ready, quantity) : null;

  return (
    <div className="sticky bottom-0 z-20 -mx-4 border-t border-border bg-card/95 px-4 py-3 backdrop-blur lg:hidden">
      <div className="flex items-center justify-between gap-4">
        <div className="flex flex-col">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            Per book
          </span>
          <span className="text-2xl font-semibold tabular-nums text-foreground">
            {state.status === "loading" ? (
              <Loader2 className="size-5 animate-spin text-muted-foreground" />
            ) : (
              formatMoney(unit, ready?.currency ?? null)
            )}
          </span>
        </div>
        <div className="flex flex-col items-end">
          <span className="text-[0.6875rem] font-medium uppercase tracking-wider text-muted-foreground">
            Total
          </span>
          <span className="text-base font-semibold tabular-nums text-foreground">
            {state.status === "loading"
              ? "…"
              : formatMoney(ready?.totalCostInclTax ?? null, ready?.currency ?? null)}
          </span>
        </div>
      </div>
    </div>
  );
}

// ---------------------------------------------------------------------------
// Panel
// ---------------------------------------------------------------------------

interface PricePanelProps {
  state: LuluFetchState<LuluPriceResult>;
  quantity: number;
  /** Human-readable list of what is still missing, for the empty state. */
  missingFields: string[];
  onRetry: () => void;
}

export function PricePanel({
  state,
  quantity,
  missingFields,
  onRetry,
}: PricePanelProps) {
  if (state.status === "loading") {
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <div className="flex flex-col items-center gap-2 px-4 py-6">
          <Loader2 className="size-7 animate-spin text-muted-foreground/60" />
          <span className="text-xs font-medium uppercase tracking-wider text-muted-foreground">
            Pricing this book…
          </span>
        </div>
        <div className="border-t border-border p-4">
          <PriceSkeleton />
        </div>
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-3 rounded-2xl border border-destructive/40 bg-destructive/5 p-5">
        <p className="text-sm font-semibold text-foreground">{state.headline}</p>
        {state.detail ? (
          <p className="break-words font-mono text-xs text-muted-foreground">
            {state.detail}
          </p>
        ) : null}
        <Button size="sm" variant="outline" onClick={onRetry}>
          <RefreshCcw className="size-3.5" />
          Retry pricing
        </Button>
      </div>
    );
  }

  if (state.status !== "ready") {
    // Idle / awaiting credentials — the shape of the answer, with no numbers.
    return (
      <div className="overflow-hidden rounded-2xl border border-border bg-card">
        <HeroPrice amount="—" currency={null} quantity={quantity} muted />
        <div className="space-y-2 border-t border-border p-4">
          <PriceRow label="Books" value="—" />
          <PriceRow label="Shipping & handling" value="—" />
          <PriceRow label="Fulfillment fee" value="—" />
          <PriceRow label="Tax" value="—" />
        </div>
        <div className="border-t border-border p-4">
          <PriceRow label="Total" value="—" emphasis />
          {missingFields.length > 0 ? (
            <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
              Choose your {missingFields.join(", ")} and the price appears here.
            </p>
          ) : (
            <p className="mt-2 text-xs text-muted-foreground">
              Pricing is unavailable until the print service is connected.
            </p>
          )}
        </div>
      </div>
    );
  }

  const result = state.data;
  const currency = result.currency;
  const unit = unitPriceOf(result, quantity);
  const bookTotal =
    parseMoney(result.lineItems[0]?.totalCostExclTax ?? null) ??
    (unit === null ? null : unit * quantity);
  const discount = parseMoney(result.totalDiscountAmount);

  return (
    <div className="overflow-hidden rounded-2xl border border-border bg-card shadow-sm">
      <HeroPrice
        amount={formatMoney(unit, currency)}
        currency={currency}
        quantity={quantity}
      />

      <div className="space-y-2 border-t border-border p-4">
        <PriceRow
          label={quantity === 1 ? "Book" : `Books × ${quantity}`}
          value={formatMoney(bookTotal, currency)}
        />
        <PriceRow
          label="Shipping & handling"
          value={formatMoney(shippingAndHandling(result), currency)}
        />
        <PriceRow
          label="Fulfillment fee"
          value={formatMoney(fulfillmentFee(result), currency)}
        />
        {discount !== null && discount > 0 ? (
          <PriceRow
            label="Bulk discount"
            value={`− ${formatMoney(discount, currency)}`}
            tone="positive"
          />
        ) : null}
        <PriceRow label="Tax" value={formatMoney(result.totalTax, currency)} />
      </div>

      <div className="space-y-2 border-t border-border bg-muted/30 p-4">
        <PriceRow
          label="Subtotal (excl. tax)"
          value={formatMoney(result.totalCostExclTax, currency)}
        />
        <PriceRow
          label="Total"
          value={formatMoney(result.totalCostInclTax, currency)}
          emphasis
        />
      </div>

      {result.lineItems[0]?.discounts.length ? (
        <ul className="space-y-1 border-t border-border p-4">
          {result.lineItems[0].discounts.map((entry, index) => (
            <li
              key={`${entry.description ?? "discount"}-${index}`}
              className="flex items-baseline justify-between gap-4 text-xs"
            >
              <span className="text-muted-foreground">
                {entry.description ?? "Discount"}
              </span>
              <span className="tabular-nums text-success">
                − {formatMoney(entry.amount, currency)}
              </span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Bulk tier table
// ---------------------------------------------------------------------------

interface BulkTierTableProps {
  tiers: BulkTier[];
  results: Record<number, LuluFetchState<LuluPriceResult>>;
  currency: string | null;
  /** Null while the configuration is incomplete — the table stays inert. */
  onCalculate: (() => void) | null;
  calculating: boolean;
}

export function BulkTierTable({
  tiers,
  results,
  currency,
  onCalculate,
  calculating,
}: BulkTierTableProps) {
  return (
    <div className="rounded-2xl border border-border bg-card p-5">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h3 className="flex items-center gap-1.5 text-sm font-semibold text-foreground">
          <Layers className="size-4 text-muted-foreground" />
          Bulk pricing
        </h3>
        <Button
          size="sm"
          variant="outline"
          onClick={() => onCalculate?.()}
          disabled={onCalculate === null || calculating}
        >
          {calculating ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <RefreshCcw className="size-3.5" />
          )}
          {calculating ? "Pricing tiers…" : "Price these tiers"}
        </Button>
      </div>

      <p className="mt-1 text-xs text-muted-foreground">
        Each tier is a real cost calculation at that quantity — cached per
        configuration, fetched only when you ask for it.
      </p>

      <div className="mt-3 overflow-x-auto">
        <table className="w-full min-w-[22rem] text-sm">
          <thead>
            <tr className="border-b border-border text-left">
              <th className="pb-2 text-xs font-medium text-muted-foreground">
                Quantity
              </th>
              <th className="pb-2 text-xs font-medium text-muted-foreground">
                Expected discount
              </th>
              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                Per book
              </th>
              <th className="pb-2 text-right text-xs font-medium text-muted-foreground">
                Total
              </th>
            </tr>
          </thead>
          <tbody>
            {tiers.map((tier) => {
              const state = results[tier.quantity] ?? { status: "idle" as const };
              return (
                <tr key={tier.quantity} className="border-b border-border/60">
                  <td className="py-2 text-foreground">{tier.label}</td>
                  <td className="py-2 text-xs text-muted-foreground">
                    {tier.expectedDiscountLabel}
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    <TierCell state={state} quantity={tier.quantity} mode="unit" currency={currency} />
                  </td>
                  <td className="py-2 text-right tabular-nums">
                    <TierCell state={state} quantity={tier.quantity} mode="total" currency={currency} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TierCell({
  state,
  quantity,
  mode,
  currency,
}: {
  state: LuluFetchState<LuluPriceResult>;
  quantity: number;
  mode: "unit" | "total";
  currency: string | null;
}) {
  if (state.status === "loading") {
    return <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />;
  }
  if (state.status === "error") {
    return <span className="text-xs text-destructive">Failed</span>;
  }
  if (state.status === "awaiting_credentials") {
    return <span className="text-xs text-muted-foreground">Pending</span>;
  }
  if (state.status !== "ready") {
    return <span className="text-muted-foreground">—</span>;
  }
  const resolved = state.data.currency ?? currency;
  if (mode === "unit") {
    return (
      <span className="text-foreground">
        {formatMoney(unitPriceOf(state.data, quantity), resolved)}
      </span>
    );
  }
  return (
    <span className="text-foreground">
      {formatMoney(state.data.totalCostExclTax, resolved)}
    </span>
  );
}
