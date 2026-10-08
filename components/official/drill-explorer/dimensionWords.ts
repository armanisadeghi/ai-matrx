// components/official/drill-explorer/dimensionWords.ts — A GROUP READS AS WORDS, FROM THE DOOR
// (lane DRILL-GAPS; PROGRESS-DRILL-FINISH owner ruling under DRILL-CONVERSIONS (c)).
//
// KEYS NEVER REACH A PERSON (VERIFIER-32 F5). Where the words come from, first match wins:
//
//   the empty group   the Dimension's declared `empty_label` ("No embedding (nothing new to embed)"),
//                     else the host resolver's, else "None"
//   a choice code     the Dimension's declared `choices` label (describe carries them) — before any
//                     host or door name: the definition is the one place a code gets its words
//                     (lane DRILL-CLOSE: `sch_run` reads "Scheduled run" even on a Dimension whose
//                     other codes the names door reads, e.g. a usage feature)
//   a relation id     the door's own `labels` on the answer (read as the seat through the target's
//                     row security — organizations, workflows, agents, models), else the host's name
//                     resolver (a person's name comes from the platform's names door, because the
//                     person registry has no title a member may read)
//   a boolean         Yes / No
//   a text value      as written (a name, not a code: "claude-sonnet-4-5")
//   anything else     the host's words (a definition that declares no choices yet), else the value
//                     in plain words ("save_hook" → "Save hook"; an id inside a code dropped)
//
// So a mount passes no copy of its definition's labels: the definition file is the one place a code
// gets its words.

import type { DrillDefinition } from "@ai-matrx/records";

import type { DrillNameResolver } from "./types";

/** `code_shaped`: the definition says this Dimension's values are codes ("mandate:seo.topic_assigner"), so a dot separates words. */
type Dimension = DrillDefinition["dimensions"][number] & { empty_label?: string; code_shaped?: boolean };

const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;

/**
 * A code in plain words when nothing declares its label: "save_hook" → "Save hook",
 * "mandate:seo.topic_assigner" → "Mandate · Seo topic assigner" (`code: true`; without it a dot stays,
 * so a display name like "Z.ai" is never taken apart). An id inside a code never reaches a
 * person ("agent_service:<uuid>" → "Agent service"); a code that is nothing but an id reads "Unnamed".
 */
export function plainWords(value: string, opts: { code?: boolean } = {}): string {
  // A dot is a separator ONLY inside a declared code ("seo.topic_assigner": `code: true`, a key the
  // definition says is a code, e.g. a feature). In a display name it stays ("Z.ai", "Gemini 2.5 Pro")
  // (lane DRILL-CLOSE-2).
  const part = (p: string) => {
    const dotted = opts.code ? p.replace(/(?<=[A-Za-z])\.(?=[A-Za-z])/g, " ") : p;
    return dotted.replace(UUID, " ").replace(/[_\-/]+/g, " ").replace(/\s+/g, " ").trim();
  };
  const parts = value.split(":").map(part).filter(Boolean);
  if (parts.length === 0) return value.trim() ? "Unnamed" : value;
  const joined = parts.join(" · ");
  return joined.charAt(0).toUpperCase() + joined.slice(1);
}

/** An ISO moment (a date with a time, any offset): what a ten-minute bucket or any time-valued code carries. */
const ISO_MOMENT = /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}(?::?\d{2})?)$/;

/**
 * A TIME-VALUED GROUP READS AS A MOMENT (lane DRILL-FLIP-FIXES, VERIFY-DRILL-FINAL R3): a Dimension of
 * kind text or choice whose value is an instant — `bucket_10m` "2026-09-12T19:20:00+00:00" — reads
 * "Sep 12, 7:20 PM UTC", never "2026 09 12T19 · 20 · 00+00 · 00". In UTC and said so, because such a
 * bucket is cut in UTC; null when the value is not a moment.
 */
export function momentGroupWords(value: string): string | null {
  if (!ISO_MOMENT.test(value)) return null;
  const at = new Date(value.replace(" ", "T"));
  if (Number.isNaN(at.getTime())) return null;
  const sameYear = at.getUTCFullYear() === new Date().getUTCFullYear();
  const words = at.toLocaleString("en-US", {
    timeZone: "UTC",
    month: "short",
    day: "numeric",
    ...(sameYear ? {} : { year: "numeric" }),
    hour: "numeric",
    minute: "2-digit",
  });
  return `${words} UTC`;
}

/**
 * How one Dimension's values read, or undefined when the package's own reading is right (a time
 * period, and a boolean or text Dimension that declares nothing).
 */
export function drillDimensionLabelFor(
  dim: Dimension,
  context: {
    /** id → words for this Dimension: the door's labels, merged with the host resolver's names. */
    names: Record<string, string> | undefined;
    resolver?: DrillNameResolver | undefined;
    hostWords?: ((value: string) => string) | undefined;
  },
): ((value: string | null) => string) | undefined {
  if (dim.kind === "time") return undefined;
  const { names, resolver, hostWords } = context;
  const choices = new Map((dim.choices ?? []).map((c) => [c.value, c.label]));
  // a relation's empty group is "No <dimension>" ("No conversation"), never "None" (lane DRILL-LIVE-FIX-2 #5)
  const empty = dim.empty_label ?? resolver?.emptyLabel ?? (hostWords ? hostWords("") : undefined) ?? (dim.kind === "relation" ? `No ${dim.label.toLowerCase()}` : "None");
  if (dim.kind === "boolean") {
    return (value) => (value === null || value === "" ? empty : value === "true" ? "Yes" : value === "false" ? "No" : plainWords(value, { code: dim.code_shaped === true }));
  }
  if (dim.kind === "text" && choices.size === 0 && !resolver && !hostWords) {
    // a text value reads as written — unless it is a moment, which reads as one (R3)
    return (value) => (value === null || value === "" ? empty : momentGroupWords(value) ?? value);
  }
  return (value) => {
    if (value === null || value === "") return empty;
    const said = choices.get(value) ?? names?.[value];
    if (said) return said;
    // a time-valued code (a ten-minute bucket) is a moment, never a code in plain words (R3)
    const moment = dim.kind === "relation" ? null : momentGroupWords(value);
    if (moment) return moment;
    if (hostWords) return hostWords(value);
    // an id a host resolver names (a sign-in session is a choice of ids): its name is on the way
    if (resolver && dim.kind !== "relation") return resolver.missingLabel ?? "Reading the name…";
    // a text value is a name (a model's own name), never a code: it reads as written
    if (dim.kind === "text") return new RegExp(`^${UUID.source}$`, "i").test(value) ? plainWords(value) : value;
    if (dim.kind === "relation") {
      const noun = dim.label.toLowerCase();
      return resolver ? (resolver.missingLabel ?? "Reading the name…") : `${/^[aeiou]/.test(noun) ? "An" : "A"} ${noun} whose name you cannot read`;
    }
    return plainWords(value, { code: dim.code_shaped === true });
  };
}

/**
 * The door's own words on an answer's rows (`labels`: a relation group's name, read as the seat),
 * as Dimension key → id → words — what the screen names a relation group with before any host lookup.
 */
export function drillDoorLabels(
  rows: ReadonlyArray<{ groups?: Record<string, unknown> | null; prior_groups?: Record<string, unknown> | null; labels?: Record<string, unknown> | null }>,
): Record<string, Record<string, string>> {
  const out: Record<string, Record<string, string>> = {};
  for (const row of rows) {
    const groups = row.groups ?? row.prior_groups ?? {};
    for (const [dim, label] of Object.entries(row.labels ?? {})) {
      const value = groups[dim];
      // a relation Dimension's key never carries a grain, so the label's key is the Dimension's key
      if (typeof value === "string" && typeof label === "string" && label) (out[dim.split(":")[0]!] ??= {})[value] = label;
    }
  }
  return out;
}
