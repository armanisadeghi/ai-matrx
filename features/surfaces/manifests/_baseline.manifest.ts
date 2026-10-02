/**
 * Baseline SurfaceValue catalog.
 *
 * Most surfaces want to advertise the same handful of values (selection,
 * content, context) so legacy code that uses the universal scope keys
 * (`UnifiedAgentContextMenu`'s `selection` / `content` / `context`) keeps
 * working without touching the resolver.
 *
 * Manifests can spread `BASELINE_VALUES` (or a subset) into their own
 * declarations to inherit the canonical descriptions/labels. Override any
 * field by listing the value again with a different shape — last-write wins
 * in `mergeBaselineValues`.
 */

import type { SurfaceValue } from "@ai-matrx/chat/surfaces/types";

/**
 * THE PERSON'S POINTER (Arman, 2026-09-30). What someone highlighted — and the
 * text right around it — is how an agent knows what they are asking about. It
 * is shown to the agent in full, never behind a `context` lookup, on EVERY page
 * and every launch (with or without a surface), and it never counts against a
 * page's `PAGE_CONTEXT_BUDGET`: it exists only when the person selects, and it
 * is theirs, not the page's. The server inlines up to these many characters
 * (its default for anything undeclared is 200, which sent every real selection
 * to a lookup).
 */
export const POINTER_INLINE_CEILINGS: Readonly<Record<string, number>> = {
  selection: 10_000,
  text_before: 2_500,
  text_after: 2_500,
};

/**
 * A launch with NO page behind it (Custom Agent, Send to another agent) has no
 * page bundle carrying the document, so its `content` is shown in full up to
 * this size instead of costing a lookup. With a page, the page's own values
 * decide (`SurfaceValue.inlineUpTo`) — they usually carry the body already.
 */
export const PAGELESS_CONTENT_INLINE_CEILING = 6_000;

/** Universally-recognized values. Surfaces opt in by spreading. */
export const BASELINE_VALUES = {
  selection: {
    name: "selection",
    label: "Current selection",
    description:
      "The text the person highlighted before asking — they are pointing you at it. Treat it as the focus of their request unless they say otherwise. Empty when nothing is selected.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 100,
  },
  text_before: {
    name: "text_before",
    label: "Text before selection",
    description:
      "The text immediately before the person's selection, in the same document — read it to understand what the selection means where it sits. Empty when there is no selection or nothing before it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 110,
  },
  text_after: {
    name: "text_after",
    label: "Text after selection",
    description:
      "The text immediately after the person's selection, in the same document — read it to understand what the selection means where it sits. Empty when there is no selection or nothing after it.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 500,
    sortOrder: 120,
  },
  content: {
    name: "content",
    label: "Primary content",
    description:
      "The surface's primary editable content (full document, full note, full file body). Use with care — can be large.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    sortOrder: 200,
  },
  custom_fields: {
    name: "custom_fields",
    label: "Custom fields",
    description:
      "The organization's custom fields shown on this record, with this record's values: a list of { entity, record_id, fields: [{ name, key, type, value }] } (value null = empty). Contributed by the custom-fields section itself. Add a field with the platform target custom_fields_add; fill values in with custom_fields_set.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 800,
    inlineUpTo: 2000,
    sortOrder: 9990,
  },
  context: {
    name: "context",
    label: "Free-form context",
    description:
      "Loose-shaped context blob a surface may emit (commonly an object with surface-specific keys). Prefer named SurfaceValues over stuffing things in here.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 9999,
  },
} as const satisfies Record<string, SurfaceValue>;

/**
 * AMBIENT — what is true around the user right now, regardless of surface.
 *
 * 🚨 ONE KEY, not five. Ambient state arrives as a single namespaced object so
 * it can never collide with a surface's own value names, needs exactly one
 * declaration here, and does not turn every surface's Context Admin into a
 * wall of undeclared runtime keys.
 *
 * Written ONLY by the platform (the context menu's ambient underlay,
 * `features/context-menu-v3/value-resolution.ts`) and only into a silence — a
 * surface that declares its own `ambient` is never overwritten.
 */
export const AMBIENT_VALUES = {
  ambient: {
    name: "ambient",
    label: "Ambient state",
    description:
      "What is true around the user at this moment, independent of the surface: the active organization, the active scopes/context selections, the surface they are on, and whether an agent run is currently streaming. Platform-written; use it to avoid asking the user what the app already knows.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 300,
    sortOrder: 9998,
  },
} as const satisfies Record<string, SurfaceValue>;

/**
 * PLATFORM CONTEXT — what the platform adds to EVERY run about the screens
 * around the primary surface (register ARE-010 / ARE-012,
 * `features/surfaces/runtime/surface-chain.ts`). Written ONLY by the platform
 * at launch and at every follow-up turn, never by a surface; no manifest may
 * declare either name (the registry throws). Not surface values — no binding
 * maps to them — so they are declared here once instead of injected into
 * every manifest; the server (aidream `apply_surface_context`) expands them
 * into one context object per value.
 */
export const PLATFORM_CONTEXT_VALUES = {
  surface_chain: {
    name: "surface_chain",
    label: "Open screens around this one",
    description:
      "Every OTHER registered screen open right now, nearest first: the window over the page, the page under a window, and parent pages. Each level carries its surface name, its role (window / page / parent) and its declared values with their descriptions. The server shows each value as `<surface>::<value>`.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 2000,
    sortOrder: 9996,
  },
  surface_closed: {
    name: "surface_closed",
    label: "The screen this conversation started on is closed",
    description:
      "Present only when the screen this conversation is attached to (a window, dialog or page) has been closed since the conversation started. Its earlier values are gone and must not be treated as current; what is open now is in surface_chain and window_forms.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 9995,
  },
  window_forms: {
    name: "window_forms",
    label: "Open windows with no registered surface",
    description:
      "Every open dialog or window no registered surface speaks for, read from the screen: its title and every field in it (label, type, current value, options, required, invalid). The agent changes them with the platform write target `window_form_fields`; the person approves.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1000,
    sortOrder: 9997,
  },
} as const satisfies Record<string, SurfaceValue>;

/** Names only the platform writes — a manifest declaring one is refused. */
export const PLATFORM_RESERVED_NAMES = {
  values: Object.keys(PLATFORM_CONTEXT_VALUES) as ReadonlyArray<string>,
  writeTargets: ["window_form_fields", "surface_feedback", "custom_fields_add", "custom_fields_set"] as ReadonlyArray<string>,
};

/**
 * THE PAGE'S OWN CONVERSATION never receives itself (Arman, 2026-10-01: the
 * agent in a battle "cannot and should not know its own conversation id, route
 * and things that identify itself. User, Client and Organization are ok").
 * Withheld at the page layer, beside the page's own values and the screens
 * around it. The default of every manifest's `ownConversationWithholds` knob;
 * the same list as the parity corpus's `page_context_defaults.own`
 * (`@ai-matrx/agents` `OWN_CONVERSATION_WITHHELD`, aidream `page_context.py`).
 */
export const PAGE_OFF_WITHHELD: readonly string[] = [
  "route_brief",
  "surface_chain",
  "window_forms",
  "surface_closed",
];
export const OWN_CONVERSATION_WITHHELD: readonly string[] = [...PAGE_OFF_WITHHELD, "conversation"];
/** About the PERSON, never the page — never withheld, whatever a page lists. */
export const PERSON_CONTEXT_VALUES: ReadonlySet<string> = new Set([
  "user",
  "client",
  "organization",
  "project",
  "task",
  "active_scopes",
]);

export type BaselineKey = keyof typeof BASELINE_VALUES;

/** Pick a subset of baseline values by key. */
export function pickBaseline(...keys: BaselineKey[]): SurfaceValue[] {
  return keys.map((k) => BASELINE_VALUES[k]);
}

/**
 * Merge baseline values with surface-specific overrides. Override entries
 * (matched by `name`) replace the baseline ones; new entries are appended.
 */
export function mergeBaselineValues(
  baseline: readonly SurfaceValue[],
  overrides: readonly SurfaceValue[],
): SurfaceValue[] {
  const byName = new Map<string, SurfaceValue>();
  for (const v of baseline) byName.set(v.name, v);
  for (const v of overrides) byName.set(v.name, v);
  return Array.from(byName.values()).sort(
    (a, b) => (a.sortOrder ?? 1000) - (b.sortOrder ?? 1000),
  );
}

/**
 * Canonical ordered list of the generic baseline value names.
 *
 * EVERY surface guarantees these are (a) bindable — declared, via the
 * injection in `registry.ts` — and (b) present at runtime — emitted and
 * empty-floored, via `withBaselineScope` in
 * `features/surfaces/utils/baseline-scope.ts`. An agent author can therefore
 * ALWAYS map a variable to one of these on any surface and get at least an
 * empty value. That uniformity is what makes generic, surface-agnostic agents
 * (clean-up, "help with this", summarize) work everywhere without per-surface
 * remapping — the whole reason the baseline set exists.
 *
 * Because of that always-present floor, `mapType: "surface_value",
 * required: true` is a no-op against any of these keys — the empty floor counts
 * as satisfied, so `required` never fails for a baseline value (by design). See
 * `withBaselineScope` for the full rationale.
 */
export const BASELINE_VALUE_NAMES = Object.keys(BASELINE_VALUES) as BaselineKey[];

/** Every baseline value, in sort order. */
export function allBaseline(): SurfaceValue[] {
  return Object.values(BASELINE_VALUES);
}

/**
 * Declare the full generic baseline set beneath a surface's specific values.
 * The canonical way to author a content/editor surface — equivalent to
 * `mergeBaselineValues(allBaseline(), surfaceSpecific)`. Note `registry.ts`
 * also injects the full set into every manifest, so this is belt-and-suspenders
 * for authors who prefer to be explicit; a same-named surface value still wins.
 */
export function withAllBaselines(
  surfaceSpecific: readonly SurfaceValue[],
): SurfaceValue[] {
  return mergeBaselineValues(Object.values(BASELINE_VALUES), surfaceSpecific);
}
