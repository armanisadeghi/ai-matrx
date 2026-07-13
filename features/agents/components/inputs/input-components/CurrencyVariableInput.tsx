"use client";

/**
 * CurrencyVariableInput — a money value: an amount plus a currency code, stored
 * together as `{ amount, currency }` in value_json (never a bare number, which
 * would lose the currency). Value in/out is that object (or null when empty).
 */

import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

/** Common ISO-4217 codes; extend as needed. */
export const CURRENCY_CODES = [
  "USD",
  "EUR",
  "GBP",
  "CAD",
  "AUD",
  "JPY",
  "CHF",
  "CNY",
  "INR",
  "MXN",
  "BRL",
] as const;

export interface CurrencyValue {
  amount: number | null;
  currency: string;
}

function parse(value: unknown): CurrencyValue {
  let obj: Record<string, unknown> | null = null;
  if (value && typeof value === "object") {
    obj = value as Record<string, unknown>;
  } else if (typeof value === "string" && value.trim()) {
    try {
      const p = JSON.parse(value);
      if (p && typeof p === "object") obj = p as Record<string, unknown>;
    } catch {
      obj = null;
    }
  }
  const amountRaw = obj?.amount;
  const amount =
    typeof amountRaw === "number"
      ? amountRaw
      : typeof amountRaw === "string" && amountRaw.trim() !== ""
        ? Number(amountRaw)
        : null;
  const currency =
    typeof obj?.currency === "string" && obj.currency ? obj.currency : "USD";
  return { amount: Number.isNaN(amount as number) ? null : amount, currency };
}

interface CurrencyVariableInputProps {
  value: unknown;
  onChange: (value: CurrencyValue | null) => void;
  variableName: string;
  compact?: boolean;
  disabled?: boolean;
}

export function CurrencyVariableInput({
  value,
  onChange,
  variableName,
  disabled,
}: CurrencyVariableInputProps) {
  const { amount, currency } = parse(value);

  const emit = (next: CurrencyValue) => {
    if (next.amount == null) {
      onChange(null);
      return;
    }
    onChange(next);
  };

  return (
    <div className="flex items-center gap-2">
      <Input
        type="number"
        inputMode="decimal"
        value={amount == null ? "" : String(amount)}
        onChange={(e) => {
          const raw = e.target.value;
          emit({ amount: raw === "" ? null : Number(raw), currency });
        }}
        placeholder="0.00"
        disabled={disabled}
        aria-label={`${variableName} amount`}
        style={{ fontSize: "16px" }}
        className="flex-1"
      />
      <Select
        value={currency}
        onValueChange={(c) => emit({ amount, currency: c })}
        disabled={disabled}
      >
        <SelectTrigger className="w-24 shrink-0" aria-label={`${variableName} currency`}>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {CURRENCY_CODES.map((c) => (
            <SelectItem key={c} value={c}>
              {c}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}

export default CurrencyVariableInput;
