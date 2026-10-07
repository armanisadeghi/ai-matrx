// The small helpers every template Applet carries in its own `shared.tsx` (Applets own their files).
export const SHARED_HELPERS = `
export function linkIds(value) {
  return (Array.isArray(value) ? value : value ? [value] : []).map((v) => (typeof v === "string" ? v : v && v.id)).filter(Boolean);
}
export function dayWords(iso) {
  if (!iso) return "No date";
  const [y, m, d] = String(iso).slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
}
export function money(n) {
  const v = Number(n);
  return Number.isFinite(v) ? v.toLocaleString(undefined, { style: "currency", currency: "USD", maximumFractionDigits: 0 }) : "";
}
export function Notice({ error }) {
  return error ? <p className="mb-3 rounded-md border border-destructive/40 p-2 text-sm text-destructive" data-applet-error="">{error.message}</p> : null;
}
export function Loading({ state, label }) {
  return state.status === "loading" && state.rows.length === 0 ? <RegionSkeleton shape="cards" count={4} aria-label={label} /> : null;
}
`;
