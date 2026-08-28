/**
 * THE PLACES WORKSPACE — mock data (preview only, nothing here is real).
 *
 * Typed to the NEW model in
 * `common-docs/systems/agents/mandates/THE-MODEL.md`:
 *
 *  - **Known values are the shared middle vocabulary** — each one a UUID-identified,
 *    kind-typed, key-labeled slot, sitting in one of three layers (system interaction /
 *    org+user scope context / system context). *Identity resolves; keys describe* (law 2),
 *    so every alignment below carries the UUID and treats the key as a label.
 *  - **A place declares a manifest**; some of its declared values ARE the local
 *    implementation of a known value, and the rest are surface-only.
 *  - **A mandate meets a place two ways**: REFERENCED (a slot names the key — the manifest
 *    is the provision, mapping is exact, and law 7 says a fully-mapped referenced binding
 *    RUNS with no user input) or DISCOVERED (nothing names it — it appears wherever the
 *    keys it consumes exist; law 3, availability = capability, with an explicit
 *    per-place exclusion valve).
 *
 * No service, no fetch, no DB. Every id is a stable fake so the mockup renders
 * identically on every load.
 */

/* ------------------------------------------------------------------ */
/* Known values — the shared middle vocabulary                         */
/* ------------------------------------------------------------------ */

/** The three layers a known value can live in. THE-MODEL § Known values. */
export type KnownValueLayer =
  | "interaction"
  | "scope_context"
  | "system_context";

export const LAYER_META: Record<
  KnownValueLayer,
  { label: string; blurb: string; className: string; dotClassName: string }
> = {
  interaction: {
    label: "Interaction",
    blurb:
      "System interaction values — what the human is doing right now (selection, content, …). Written by the surface, read anywhere.",
    className:
      "border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300",
    dotClassName: "bg-sky-500",
  },
  scope_context: {
    label: "Scope context",
    blurb:
      "Org- and user-defined context items. Scope-defined, UUID-identified, and the reason a job can be portable across places.",
    className:
      "border-violet-500/40 bg-violet-500/10 text-violet-700 dark:text-violet-300",
    dotClassName: "bg-violet-500",
  },
  system_context: {
    label: "System context",
    blurb:
      "Platform-supplied facts every place gets for free (current_date, ui_language, …).",
    className:
      "border-teal-500/40 bg-teal-500/10 text-teal-700 dark:text-teal-300",
    dotClassName: "bg-teal-500",
  },
};

export interface KnownValue {
  /** Identity. This is what a binding references — never the key. */
  id: string;
  /** Human label / matchmaking hint only (law 2). */
  key: string;
  label: string;
  layer: KnownValueLayer;
  valueKind: string;
}

export const KNOWN_VALUES: readonly KnownValue[] = [
  {
    id: "kv-0f2a-4c11-selection",
    key: "selection",
    label: "Selection",
    layer: "interaction",
    valueKind: "text",
  },
  {
    id: "kv-71bd-4e03-content",
    key: "content",
    label: "Content",
    layer: "interaction",
    valueKind: "markdown",
  },
  {
    id: "kv-9a44-4f60-focused_record",
    key: "focused_record",
    label: "Focused record",
    layer: "interaction",
    valueKind: "record_ref",
  },
  {
    id: "kv-2c85-41d7-record_history",
    key: "record_history",
    label: "Record history",
    layer: "interaction",
    valueKind: "timeline",
  },
  {
    id: "kv-b3e0-4a92-house_style",
    key: "house_style",
    label: "House style",
    layer: "scope_context",
    valueKind: "text",
  },
  {
    id: "kv-6dd1-49aa-territory",
    key: "territory",
    label: "Territory",
    layer: "scope_context",
    valueKind: "text",
  },
  {
    id: "kv-4f57-4b18-current_date",
    key: "current_date",
    label: "Current date",
    layer: "system_context",
    valueKind: "date",
  },
  {
    id: "kv-8ab2-4d35-ui_language",
    key: "ui_language",
    label: "UI language",
    layer: "system_context",
    valueKind: "text",
  },
] as const;

export const KNOWN_VALUE_BY_ID: ReadonlyMap<string, KnownValue> = new Map(
  KNOWN_VALUES.map((kv) => [kv.id, kv]),
);

/* ------------------------------------------------------------------ */
/* The place and its manifest                                          */
/* ------------------------------------------------------------------ */

export type ValueSyncStatus = "in_sync" | "manifest_only" | "db_only" | "diff";

/**
 * How a declared value relates to the shared vocabulary. `known` means THIS ROW
 * is the local implementation of that known value — the thing that makes a
 * discovered job able to land here at all.
 */
export type ValueAlignment =
  | { kind: "known"; knownValueId: string }
  | { kind: "surface_only" };

export interface PlaceValue {
  name: string;
  label: string;
  description: string;
  valueType: string;
  alwaysAvailable: boolean;
  typicalCharCount: number;
  sortOrder: number;
  syncStatus: ValueSyncStatus;
  alignment: ValueAlignment;
  /** Is the page actually supplying it right now (the live-scope read). */
  supplied: boolean;
}

export interface PlaceSummary {
  displayName: string;
  fullName: string;
  client: string;
  routePattern: string;
  readiness: "verified" | "partial" | "stub" | "unregistered";
  readinessNote: string;
  lastCheckedLabel: string;
}

export const PLACE: PlaceSummary = {
  displayName: "CRM Contact Page",
  fullName: "matrx-web/crm-contact-detail",
  client: "matrx-web",
  routePattern: "/crm/contacts/[contactId]",
  readiness: "partial",
  readinessNote:
    "Manifest complete and synced; 2 declared write targets still have no registered handler.",
  lastCheckedLabel: "checked 3d ago by admin@admin.com",
};

export const PLACE_VALUES: readonly PlaceValue[] = [
  {
    name: "selection",
    label: "Selected text",
    description: "Whatever the rep has highlighted anywhere on the page.",
    valueType: "text",
    alwaysAvailable: false,
    typicalCharCount: 180,
    sortOrder: 10,
    syncStatus: "in_sync",
    alignment: { kind: "known", knownValueId: "kv-0f2a-4c11-selection" },
    supplied: true,
  },
  {
    name: "contact_record",
    label: "Contact record",
    description:
      "The contact currently open — the page's implementation of the focused record.",
    valueType: "record_ref",
    alwaysAvailable: true,
    typicalCharCount: 64,
    sortOrder: 20,
    syncStatus: "in_sync",
    alignment: { kind: "known", knownValueId: "kv-9a44-4f60-focused_record" },
    supplied: true,
  },
  {
    name: "contact_notes",
    label: "Contact notes",
    description: "The free-text notes body on the contact.",
    valueType: "markdown",
    alwaysAvailable: true,
    typicalCharCount: 1400,
    sortOrder: 30,
    syncStatus: "in_sync",
    alignment: { kind: "known", knownValueId: "kv-71bd-4e03-content" },
    supplied: true,
  },
  {
    name: "activity_timeline",
    label: "Activity timeline",
    description: "Every logged call, email and meeting on this contact.",
    valueType: "timeline",
    alwaysAvailable: true,
    typicalCharCount: 3200,
    sortOrder: 40,
    syncStatus: "diff",
    alignment: { kind: "known", knownValueId: "kv-2c85-41d7-record_history" },
    supplied: true,
  },
  {
    name: "open_deals",
    label: "Open deals",
    description: "Deals in flight for this contact, with stage and value.",
    valueType: "json",
    alwaysAvailable: true,
    typicalCharCount: 900,
    sortOrder: 50,
    syncStatus: "in_sync",
    alignment: { kind: "surface_only" },
    supplied: true,
  },
  {
    name: "last_touch_days",
    label: "Days since last touch",
    description: "How long since anyone on the team contacted this person.",
    valueType: "number",
    alwaysAvailable: true,
    typicalCharCount: 3,
    sortOrder: 60,
    syncStatus: "in_sync",
    alignment: { kind: "surface_only" },
    supplied: true,
  },
  {
    name: "owner_territory",
    label: "Owner territory",
    description:
      "The territory the record owner sells into — resolved from the org's context items.",
    valueType: "text",
    alwaysAvailable: true,
    typicalCharCount: 24,
    sortOrder: 70,
    syncStatus: "in_sync",
    alignment: { kind: "known", knownValueId: "kv-6dd1-49aa-territory" },
    supplied: true,
  },
  {
    name: "house_style",
    label: "House writing style",
    description:
      "The org's tone-of-voice context item, inherited by every place.",
    valueType: "text",
    alwaysAvailable: true,
    typicalCharCount: 420,
    sortOrder: 80,
    syncStatus: "in_sync",
    alignment: { kind: "known", knownValueId: "kv-b3e0-4a92-house_style" },
    supplied: true,
  },
  {
    name: "current_date",
    label: "Current date",
    description: "System context — supplied to every place, always.",
    valueType: "date",
    alwaysAvailable: true,
    typicalCharCount: 10,
    sortOrder: 90,
    syncStatus: "in_sync",
    alignment: { kind: "known", knownValueId: "kv-4f57-4b18-current_date" },
    supplied: true,
  },
  {
    name: "email_thread",
    label: "Email thread",
    description:
      "The synced mail conversation with this contact. Declared in code, never upserted.",
    valueType: "markdown",
    alwaysAvailable: false,
    typicalCharCount: 5200,
    sortOrder: 100,
    syncStatus: "manifest_only",
    alignment: { kind: "surface_only" },
    supplied: false,
  },
  {
    name: "call_transcript",
    label: "Call transcript",
    description:
      "Transcript of the most recent recorded call, when one exists.",
    valueType: "markdown",
    alwaysAvailable: false,
    typicalCharCount: 8000,
    sortOrder: 110,
    syncStatus: "in_sync",
    alignment: { kind: "surface_only" },
    supplied: false,
  },
  {
    name: "legacy_score",
    label: "Legacy lead score",
    description:
      "A DB row with no code manifest behind it — the classic stale mirror.",
    valueType: "number",
    alwaysAvailable: false,
    typicalCharCount: 3,
    sortOrder: 120,
    syncStatus: "db_only",
    alignment: { kind: "surface_only" },
    supplied: false,
  },
];

/* ------------------------------------------------------------------ */
/* Bindings — the REFERENCED half, and THE AUTO-RUN CONTROL            */
/* ------------------------------------------------------------------ */

export type MappingSource =
  | "place_value"
  | "known_value"
  | "direct"
  | "prompt_user"
  | "unmapped";

export interface BindingInput {
  /** The mandate's input-contract key. */
  key: string;
  source: MappingSource;
  /** Place value name, known-value id, or the literal — depends on `source`. */
  from: string | null;
  note?: string;
}

export interface HolderRef {
  name: string;
  type: "agent" | "workflow";
  /** Which layer owns the row that won. */
  tier: "Platform" | "Org" | "You";
}

export interface PlaceBinding {
  id: string;
  mandateKey: string;
  goal: string;
  outputKind: string;
  holder: HolderRef;
  inputs: readonly BindingInput[];
  /** Law 7's control — user-owned, per binding, per level. */
  autoRun: boolean;
  /** Where in the page the slot lives. */
  slot: string;
  scopeTier: "System" | "Org" | "You";
}

export const BINDINGS: readonly PlaceBinding[] = [
  {
    id: "bind-3319",
    mandateKey: "crm_contact.next_best_action",
    goal: "The rep's ONE next action on this contact, with the reason.",
    outputKind: "next_best_action",
    holder: { name: "Revenue Coach", type: "agent", tier: "Org" },
    slot: "Right rail · header card",
    scopeTier: "Org",
    autoRun: true,
    inputs: [
      { key: "record", source: "place_value", from: "contact_record" },
      { key: "history", source: "place_value", from: "activity_timeline" },
      { key: "deals", source: "place_value", from: "open_deals" },
      { key: "staleness_days", source: "place_value", from: "last_touch_days" },
      { key: "today", source: "known_value", from: "kv-4f57-4b18-current_date" },
    ],
  },
  {
    id: "bind-3320",
    mandateKey: "crm_contact.draft_followup",
    goal: "Draft the follow-up message this contact is owed.",
    outputKind: "markdown",
    holder: { name: "Outreach Writer", type: "agent", tier: "Platform" },
    slot: "Notes panel · toolbar",
    scopeTier: "Org",
    autoRun: false,
    inputs: [
      { key: "record", source: "place_value", from: "contact_record" },
      { key: "history", source: "place_value", from: "activity_timeline" },
      { key: "style", source: "known_value", from: "kv-b3e0-4a92-house_style" },
      {
        key: "channel",
        source: "prompt_user",
        from: null,
        note: "Email or SMS — the place cannot know which the rep means.",
      },
      { key: "today", source: "known_value", from: "kv-4f57-4b18-current_date" },
    ],
  },
  {
    id: "bind-3321",
    mandateKey: "crm_contact.enrich_company",
    goal: "Fill the company fields from public sources.",
    outputKind: "company_profile",
    holder: { name: "Enrichment Flow", type: "workflow", tier: "You" },
    slot: "Company card · action menu",
    scopeTier: "You",
    autoRun: true,
    inputs: [
      { key: "record", source: "place_value", from: "contact_record" },
      { key: "territory", source: "known_value", from: "kv-6dd1-49aa-territory" },
      { key: "depth", source: "direct", from: '"standard"' },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Discovered mandates — availability = capability                     */
/* ------------------------------------------------------------------ */

export interface ConsumedKey {
  /** The label the job describes the slot with. */
  key: string;
  /** Identity — what actually resolves (law 2). Null = not a known value. */
  knownValueId: string | null;
  /** The place value that satisfies it, or null when nothing here does. */
  satisfiedByPlaceValue: string | null;
}

export interface DiscoveredMandate {
  id: string;
  mandateKey: string;
  goal: string;
  outputKind: string;
  holder: HolderRef;
  treatment: "widget" | "document" | "none";
  category: string;
  consumed: readonly ConsumedKey[];
  /** Set when this job is on the place's exclusion list. */
  excluded?: { by: string; reason: string; at: string };
}

const kvSelection = "kv-0f2a-4c11-selection";
const kvContent = "kv-71bd-4e03-content";
const kvFocused = "kv-9a44-4f60-focused_record";
const kvHistory = "kv-2c85-41d7-record_history";
const kvStyle = "kv-b3e0-4a92-house_style";
const kvTerritory = "kv-6dd1-49aa-territory";
const kvDate = "kv-4f57-4b18-current_date";
const kvLang = "kv-8ab2-4d35-ui_language";

export const DISCOVERED_APPEARING: readonly DiscoveredMandate[] = [
  {
    id: "disc-01",
    mandateKey: "utility.translate_selection",
    goal: "Translate the selection, keeping tone and formatting.",
    outputKind: "markdown",
    holder: { name: "Matrx Utility Agent", type: "agent", tier: "Platform" },
    treatment: "widget",
    category: "Utilities",
    consumed: [
      { key: "selection", knownValueId: kvSelection, satisfiedByPlaceValue: "selection" },
      { key: "ui_language", knownValueId: kvLang, satisfiedByPlaceValue: null },
    ],
  },
  {
    id: "disc-02",
    mandateKey: "utility.summarize_content",
    goal: "Summarize whatever content is in front of the user.",
    outputKind: "markdown",
    holder: { name: "Matrx Utility Agent", type: "agent", tier: "Platform" },
    treatment: "widget",
    category: "Utilities",
    consumed: [
      { key: "content", knownValueId: kvContent, satisfiedByPlaceValue: "contact_notes" },
    ],
  },
  {
    id: "disc-03",
    mandateKey: "crm.relationship_temperature",
    goal: "Read how warm this relationship is and say why.",
    outputKind: "relationship_read",
    holder: { name: "Revenue Coach", type: "agent", tier: "Org" },
    treatment: "widget",
    category: "Revenue",
    consumed: [
      { key: "focused_record", knownValueId: kvFocused, satisfiedByPlaceValue: "contact_record" },
      { key: "record_history", knownValueId: kvHistory, satisfiedByPlaceValue: "activity_timeline" },
    ],
  },
  {
    id: "disc-04",
    mandateKey: "case.draft_status_email",
    goal: "Draft a client status email in my own voice.",
    outputKind: "markdown",
    holder: { name: "My Writing Agent", type: "agent", tier: "You" },
    treatment: "document",
    category: "Mine",
    consumed: [
      { key: "focused_record", knownValueId: kvFocused, satisfiedByPlaceValue: "contact_record" },
      { key: "house_style", knownValueId: kvStyle, satisfiedByPlaceValue: "house_style" },
      { key: "current_date", knownValueId: kvDate, satisfiedByPlaceValue: "current_date" },
    ],
  },
  {
    id: "disc-05",
    mandateKey: "utility.rewrite_selection",
    goal: "Rewrite the selection tighter, same meaning.",
    outputKind: "markdown",
    holder: { name: "Matrx Utility Agent", type: "agent", tier: "Platform" },
    treatment: "widget",
    category: "Utilities",
    consumed: [
      { key: "selection", knownValueId: kvSelection, satisfiedByPlaceValue: "selection" },
      { key: "house_style", knownValueId: kvStyle, satisfiedByPlaceValue: "house_style" },
    ],
  },
  {
    id: "disc-06",
    mandateKey: "crm.territory_brief",
    goal: "Brief me on this territory before I dial.",
    outputKind: "markdown",
    holder: { name: "Territory Brief Flow", type: "workflow", tier: "Org" },
    treatment: "widget",
    category: "Revenue",
    consumed: [
      { key: "territory", knownValueId: kvTerritory, satisfiedByPlaceValue: "owner_territory" },
      { key: "current_date", knownValueId: kvDate, satisfiedByPlaceValue: "current_date" },
    ],
  },
  {
    id: "disc-07",
    mandateKey: "utility.explain_record",
    goal: "Explain this record to someone who has never seen it.",
    outputKind: "markdown",
    holder: { name: "Matrx Utility Agent", type: "agent", tier: "Platform" },
    treatment: "widget",
    category: "Utilities",
    consumed: [
      { key: "focused_record", knownValueId: kvFocused, satisfiedByPlaceValue: "contact_record" },
    ],
  },
];

export const DISCOVERED_EXCLUDED: readonly DiscoveredMandate[] = [
  {
    id: "disc-x1",
    mandateKey: "utility.tone_police",
    goal: "Flag anything in the selection that reads harshly.",
    outputKind: "markdown",
    holder: { name: "Matrx Utility Agent", type: "agent", tier: "Platform" },
    treatment: "widget",
    category: "Utilities",
    consumed: [
      { key: "selection", knownValueId: kvSelection, satisfiedByPlaceValue: "selection" },
    ],
    excluded: {
      by: "admin@admin.com",
      reason: "Duplicates the Outreach Writer's own review step on this page.",
      at: "12 Aug 2026",
    },
  },
  {
    id: "disc-x2",
    mandateKey: "utility.emoji_summary",
    goal: "Summarize the content as a short emoji line.",
    outputKind: "markdown",
    holder: { name: "Matrx Utility Agent", type: "agent", tier: "Platform" },
    treatment: "widget",
    category: "Utilities",
    consumed: [
      { key: "content", knownValueId: kvContent, satisfiedByPlaceValue: "contact_notes" },
    ],
    excluded: {
      by: "admin@admin.com",
      reason: "Not appropriate on a customer-facing record.",
      at: "02 Jul 2026",
    },
  },
];

/** One key short of appearing — the "would appear if…" hint (law 3, stated positively). */
export const DISCOVERED_NEAR_MISS: readonly DiscoveredMandate[] = [
  {
    id: "disc-n1",
    mandateKey: "crm.call_debrief",
    goal: "Turn the last call into a debrief plus next steps.",
    outputKind: "call_debrief",
    holder: { name: "Revenue Coach", type: "agent", tier: "Org" },
    treatment: "widget",
    category: "Revenue",
    consumed: [
      { key: "focused_record", knownValueId: kvFocused, satisfiedByPlaceValue: "contact_record" },
      { key: "record_history", knownValueId: kvHistory, satisfiedByPlaceValue: "activity_timeline" },
      { key: "call_transcript", knownValueId: null, satisfiedByPlaceValue: null },
    ],
  },
];

/* ------------------------------------------------------------------ */
/* Completeness — readiness, drift report, sync receipt                */
/* ------------------------------------------------------------------ */

export interface DriftSection {
  title: string;
  tone: "amber" | "rose" | "orange";
  description: string;
  rows: readonly { name: string; detail: string }[];
}

/**
 * Same severity-tone structure the real 15-array report uses: amber = declared
 * in code, not applied · rose = stale DB row with no code behind it · orange =
 * same name on both sides, fields differ.
 */
export const DRIFT_SECTIONS: readonly DriftSection[] = [
  {
    title: "Manifest values missing from DB",
    tone: "amber",
    description: "Declared in code but not yet upserted. Sync to apply.",
    rows: [{ name: "email_thread", detail: "code=declared db=absent" }],
  },
  {
    title: "DB values without a code manifest",
    tone: "rose",
    description:
      "Stale rows. Rows written in the last 24h need a second, explicit confirm.",
    rows: [{ name: "legacy_score", detail: "code=absent db=number, written 4mo ago" }],
  },
  {
    title: "Field-level diffs",
    tone: "orange",
    description: "Same name on both sides but fields differ. Sync makes DB match code.",
    rows: [
      {
        name: "activity_timeline",
        detail: "label: code=Activity timeline db=Timeline · typicalCharCount: code=3200 db=1200",
      },
    ],
  },
  {
    title: "Declared write targets with no handler",
    tone: "rose",
    description:
      "The place declares them; nothing registered a handler, so the first write fails loudly.",
    rows: [
      { name: "contact.notes.append", detail: "declared in manifest · handler=none" },
      { name: "contact.owner.set", detail: "declared in manifest · handler=none" },
    ],
  },
];

export const DRIFT_ISSUE_COUNT = DRIFT_SECTIONS.reduce(
  (n, s) => n + s.rows.length,
  0,
);

/** The 11-counter applied-changes receipt, as counted rows. */
export const SYNC_RECEIPT: readonly { label: string; count: number }[] = [
  { label: "Surfaces created", count: 0 },
  { label: "Surfaces updated", count: 1 },
  { label: "Values inserted", count: 1 },
  { label: "Values updated", count: 1 },
  { label: "Values deleted (stale)", count: 1 },
  { label: "Roles upserted", count: 3 },
  { label: "Value groups upserted", count: 4 },
  { label: "Write targets upserted", count: 2 },
  { label: "Client tools upserted", count: 0 },
  { label: "Namespaces upserted", count: 2 },
  { label: "Surfaces skipped", count: 0 },
];

export const LIVE_SCOPE = {
  supplied: PLACE_VALUES.filter((v) => v.supplied).length,
  declared: PLACE_VALUES.filter((v) => v.syncStatus !== "db_only").length,
  undeclaredRuntimeKeys: ["crm.experiment_bucket"],
  writeTargets: 4,
  writeTargetsUnwired: 2,
} as const;
