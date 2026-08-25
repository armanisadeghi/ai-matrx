// The witnessed trust axis — `chat.user_request.origin_class` — as ONE shared
// presentation contract for every admin usage surface.
//
// The vocabulary is defined server-side in
// aidream/packages/matrx-connect/matrx_connect/context/provenance.py: three
// ATTESTED classes (human / client_auto / api — a person, client-side code, or
// an unattested HTTP caller, each backed by a witness the platform observed),
// four MACHINE classes (child_agent / workflow / scheduled / system), and
// `unknown`, which is only the DB backfill value for pre-provenance history —
// live code never writes it.
//
// These are the SHORT analytics labels for charts and table columns. The
// sentence-form labels used in the user-facing conversation UI live in
// features/ai-work/conversations/presentation.ts and are deliberately separate:
// "Started by a person" reads well beside one conversation, not inside a legend
// with eight entries.

export const ORIGIN_CLASSES = [
  "human",
  "client_auto",
  "api",
  "child_agent",
  "workflow",
  "scheduled",
  "system",
  "unknown",
] as const;

export type OriginClass = (typeof ORIGIN_CLASSES)[number];

const ORIGIN_LABELS: Record<OriginClass, string> = {
  human: "Human",
  client_auto: "Client auto",
  api: "API caller",
  child_agent: "Child agent",
  workflow: "Workflow",
  scheduled: "Scheduled",
  system: "System",
  unknown: "Unknown",
};

// Stable per-class colors: a class keeps its color across the cx-dashboard
// chart and the per-user table, so the eye can carry meaning between the two.
// Trust descends warm→cool: human is the signal color, machine lanes are muted,
// unknown is deliberately grey so it never looks like a finding.
const ORIGIN_COLORS: Record<OriginClass, string> = {
  human: "hsl(215, 70%, 55%)",
  client_auto: "hsl(190, 70%, 45%)",
  api: "hsl(280, 60%, 55%)",
  child_agent: "hsl(160, 60%, 45%)",
  workflow: "hsl(35, 80%, 50%)",
  scheduled: "hsl(330, 60%, 50%)",
  system: "hsl(100, 50%, 45%)",
  unknown: "hsl(220, 9%, 55%)",
};

function isKnown(value: string): value is OriginClass {
  return (ORIGIN_CLASSES as readonly string[]).includes(value);
}

/** Short analytics label. An unrecognized class renders as itself, never blank. */
export function originClassLabel(value: string | null | undefined): string {
  if (!value) return ORIGIN_LABELS.unknown;
  return isKnown(value) ? ORIGIN_LABELS[value] : value;
}

/** Stable chart/legend color; anything unrecognized falls back to the unknown grey. */
export function originClassColor(value: string | null | undefined): string {
  if (!value) return ORIGIN_COLORS.unknown;
  return isKnown(value) ? ORIGIN_COLORS[value] : ORIGIN_COLORS.unknown;
}

/** Canonical display order (trust ladder, `unknown` last) for a set of classes. */
export function sortByOriginOrder<T>(
  rows: readonly T[],
  classOf: (row: T) => string,
): T[] {
  const rank = (v: string) => {
    const i = (ORIGIN_CLASSES as readonly string[]).indexOf(v);
    return i === -1 ? ORIGIN_CLASSES.length : i;
  };
  return [...rows].sort((a, b) => rank(classOf(a)) - rank(classOf(b)));
}
