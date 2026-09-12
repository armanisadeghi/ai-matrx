// features/admin/spend/format.ts
//
// Money and time formatting for the spend surfaces. One place, so the popover
// and the dashboard can never disagree about what $144.85 looks like.
//
// Doc: features/admin/spend/FEATURE.md

const USD = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

const USD_PRECISE = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 4,
});

const COUNT = new Intl.NumberFormat("en-US");

/** `$144.85`. A null is "not measured" — never rendered as $0.00. */
export function usd(value: number | null | undefined): string {
  if (value === null || value === undefined) return "not measured";
  return USD.format(value);
}

/** Keeps sub-cent amounts visible so a $0.004 ledger does not read as $0.00. */
export function usdPrecise(value: number | null | undefined): string {
  if (value === null || value === undefined) return "not measured";
  if (value !== 0 && Math.abs(value) < 0.01) return USD_PRECISE.format(value);
  return USD.format(value);
}

export function count(value: number | null | undefined): string {
  if (value === null || value === undefined) return "—";
  return COUNT.format(value);
}

/** `+18%` / `−7%` against yesterday. Null when yesterday was zero. */
export function deltaPercent(today: number, yesterday: number): number | null {
  if (!Number.isFinite(yesterday) || yesterday === 0) return null;
  return ((today - yesterday) / yesterday) * 100;
}

export function formatDelta(percent: number | null): string {
  if (percent === null) return "no comparison";
  const rounded = Math.round(percent);
  if (rounded === 0) return "level with yesterday";
  return `${rounded > 0 ? "+" : "−"}${Math.abs(rounded)}% vs yesterday`;
}

/** Compact table time: `09/11/26 · 9:45 PM`, or the honest absence. */
export function timestamp(value: string | null | undefined): string {
  if (!value) return "never";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "never";
  const formatted = date.toLocaleString("en-US", {
    year: "2-digit",
    month: "2-digit",
    day: "2-digit",
    hour: "numeric",
    minute: "2-digit",
  });
  return formatted.replace(", ", " · ").replaceAll(" ", "\u00a0");
}

/** `3 days ago` — how stale a ledger's last write is. */
export function staleness(value: string | null | undefined): string {
  if (!value) return "never written";
  const then = new Date(value).getTime();
  if (Number.isNaN(then)) return "never written";
  const days = Math.floor((Date.now() - then) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  return `${days} days ago`;
}

/** A human name for the zone the day boundary was cut in. */
export function zoneLabel(timezone: string): string {
  return timezone.replace(/_/g, " ");
}
