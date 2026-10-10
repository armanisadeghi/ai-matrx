"use client";

/** The one price editor: amount, currency, unit and note. Used by Add and Edit offering. */

import { Input } from "@ai-matrx/design-system/controls";
import { Label } from "@/components/ui/label";
import { PRICE_UNITS, priceProblems } from "./vocabulary";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface OfferingPriceDraft {
  /** Empty amount = no published price. */
  priceAmount: string;
  priceCurrency: string;
  priceUnit: string;
  priceNote: string;
}

export const EMPTY_PRICE_DRAFT: OfferingPriceDraft = {
  priceAmount: "",
  priceCurrency: "USD",
  priceUnit: "",
  priceNote: "",
};

export function OfferingPriceFields({
  value,
  onChange,
}: {
  value: OfferingPriceDraft;
  onChange: (next: OfferingPriceDraft) => void;
}) {
  const problems = priceProblems(value.priceAmount, value.priceCurrency);
  const set = (patch: Partial<OfferingPriceDraft>) => onChange({ ...value, ...patch });
  return (
    <div className="grid gap-1.5">
      <Label className="text-xs">Price (optional)</Label>
      <div className="grid grid-cols-[1fr_5rem_1fr] gap-1.5">
        <Input
          aria-label="Price amount"
          inputMode="decimal"
          value={value.priceAmount}
          onChange={(event) => set({ priceAmount: event.target.value })}
          placeholder="199"
        />
        <Input
          aria-label="Currency"
          value={value.priceCurrency}
          onChange={(event) => set({ priceCurrency: event.target.value.toUpperCase() })}
          placeholder="USD"
          maxLength={3}
        />
        <select
          aria-label="Price unit"
          value={value.priceUnit}
          onChange={(event) => set({ priceUnit: event.target.value })}
          className="h-9 rounded-md border border-border bg-card px-2 text-sm text-foreground"
        >
          {PRICE_UNITS.map((unit) => (
            <option key={unit.value} value={unit.value}>
              {unit.label}
            </option>
          ))}
        </select>
      </div>
      <Input
        aria-label="Price note"
        value={value.priceNote}
        onChange={(event) => set({ priceNote: event.target.value })}
        placeholder="Note, e.g. volume discounts over 50 drives"
      />
      {problems.amount || problems.currency ? (
        <p className="text-[11px] text-destructive">
          {problems.amount ? "Amount must be a number, 0 or more." : "Currency is a 3-letter code, like USD."}
        <ErrorAlchemyMenu /></p>
      ) : null}
    </div>
  );
}
