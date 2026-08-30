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
  const tier = parseMoney(line.unitTierCost);
  if (tier !== null) return tier;
  const total = parseMoney(line.totalCostExclTax);
  if (total === null || quantity <= 0) return null;
  return total / quantity;
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
          "text-xs",
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
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <Loader2 className="size-3.5 animate-spin" />
          Pricing this configuration…
        </div>
        <PriceSkeleton />
      </div>
    );
  }

  if (state.status === "error") {
    return (
      <div className="space-y-2 rounded-lg border border-destructive/40 bg-destructive/10 p-4">
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
      <div className="space-y-3 rounded-lg border border-border bg-card p-4">
        <PriceRow label="Unit price" value="—" emphasis />
        <div className="space-y-1.5 border-t border-border pt-3">
          <PriceRow label="Book Total" value="—" />
          <PriceRow label="Shipping & Handling" value="—" />
          <PriceRow label="Fulfillment Fee" value="—" />
          <PriceRow label="Tax" value="—" />
        </div>
        <div className="border-t border-border pt-3">
          <PriceRow label="Subtotal" value="—" emphasis />
        </div>
        {missingFields.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            Still needed: {missingFields.join(", ")}.
          </p>
        ) : (
          <p className="text-xs text-muted-foreground">
            Pricing is unavailable until the Lulu service is connected.
          </p>
        )}
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
    <div className="space-y-3 rounded-lg border border-border bg-card p-4">
      <div className="flex items-baseline justify-between gap-4">
        <span className="text-xs text-muted-foreground">
          Unit price · {quantity} {quantity === 1 ? "book" : "books"}
        </span>
        <span className="text-2xl font-semibold tabular-nums text-foreground">
          {formatMoney(unit, currency)}
        </span>
      </div>

      <div className="space-y-1.5 border-t border-border pt-3">
        <PriceRow label="Book Total" value={formatMoney(bookTotal, currency)} />
        <PriceRow
          label="Shipping & Handling"
          value={formatMoney(shippingAndHandling(result), currency)}
        />
        <PriceRow
          label="Fulfillment Fee"
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

      <div className="space-y-1.5 border-t border-border pt-3">
        <PriceRow
          label="Subtotal (excl. tax)"
          value={formatMoney(result.totalCostExclTax, currency)}
        />
        <PriceRow
          label="Total (incl. tax)"
          value={formatMoney(result.totalCostInclTax, currency)}
          emphasis
        />
      </div>

      {result.lineItems[0]?.discounts.length ? (
        <ul className="space-y-1 border-t border-border pt-3">
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
    <div className="rounded-lg border border-border bg-card p-4">
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
