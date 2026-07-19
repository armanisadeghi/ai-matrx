/** Format runtime execution cost without hiding useful sub-cent precision. */
export function formatRuntimeCost(value: number | null | undefined): string {
  const cost = Number(value ?? 0);
  const digits = Math.abs(cost) > 0 && Math.abs(cost) < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(undefined, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(Number.isFinite(cost) ? cost : 0);
}
