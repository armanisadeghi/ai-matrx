import { priceFieldLabel } from "../usageBasis";

export type ProviderPriceField =
  "input_price" | "cached_input_price" | "output_price";

function formatProviderPrice(value: number): string {
  if (value === 0) return "$0";
  if (value < 0.01) return `$${value.toPrecision(2)}`;
  return `$${value.toLocaleString(undefined, { maximumFractionDigits: 4 })}`;
}

/**
 * Canonical compact provider-price cell for AI catalog comparison tables.
 * The usage basis is always rendered beside the dollar amount because the
 * same numeric value can mean $/1M tokens, $/image, $/minute, or another unit.
 */
export function ProviderPriceCell({
  value,
  usageBasis,
  field,
}: {
  value: number | null | undefined;
  usageBasis: string | null | undefined;
  field: ProviderPriceField;
}) {
  if (value === null || value === undefined) {
    return <span className="text-xs text-muted-foreground">—</span>;
  }

  const unit = priceFieldLabel(usageBasis, field);
  const displayUnit = unit.replace("$ / ", "/");

  return (
    <span
      className="block whitespace-nowrap text-right text-xs tabular-nums"
      title={`${formatProviderPrice(value)} · ${unit}`}
    >
      <span className="font-medium">{formatProviderPrice(value)}</span>
      <span className="ml-1 text-[10px] text-muted-foreground">
        {displayUnit}
      </span>
    </span>
  );
}
