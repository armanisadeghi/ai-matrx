/**
 * timeline kind → TimelineBlock bridge (+ compiled definitions).
 *
 * The successor to the `<timeline>` XML markdown block. The kind family is
 * derived from COMPONENT REALITY — the exact shapes TimelineBlock
 * (components/mardown-display/blocks/timeline/TimelineBlock.tsx) and its
 * parser (parseTimelineMarkdown.ts) already produce and consume:
 *
 *   { __kind:"timeline", title, description?, periods: [
 *       { __kind:"timeline_period", period, events: [
 *           { __kind:"timeline_event", id?, title, date?, description?,
 *             status?, category? } ] } ] }
 *
 * The bridge derives the component's exact `TimelineData` serverData —
 * TimelineArtifact resolves `serverData ?? data ?? parse(raw)` and hands it
 * straight to TimelineBlock, zero component changes. Complete-only
 * (makeCompleteEnvelopeBridge): TimelineBlock copies its `timeline` prop
 * into useState ONCE (progress, collapse state), so partial payloads must
 * never reach it — the type's loading visualization stands while streaming.
 *
 * Mapping defaults mirror the PARSER'S OWN behavior (it is the shape
 * authority), never invented:
 * - set `title` falls back to "Timeline" (parser: `title || 'Timeline'`).
 * - event `date` falls back to "TBD" (parser: `eventDate || 'TBD'`).
 * - event `description` falls back to the event title (parser:
 *   `descriptionLines.join(' ') || eventTitle`).
 * - event `id` is synthesized as `${period}-${index}` when absent (the
 *   parser's exact id scheme — the component keys progress tracking on it).
 * - `status` normalizes "in progress"/"in_progress" → "in-progress" (the
 *   parser accepts the spaced spelling); anything else is omitted so the
 *   component shows its neutral default icon.
 * - an event without a non-empty `title` and a period with zero surviving
 *   events are dropped — the parser never produces either.
 *
 * NOT registered anywhere yet — central integration wires
 * TIMELINE_KIND_DEFINITIONS into the registry; until then the kind stays
 * is_active=false and renders via the legacy XML path only.
 */

import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

export const TIMELINE_EVENT_STATUSES = [
  "completed",
  "in-progress",
  "pending",
] as const;

type TimelineEventStatus = (typeof TIMELINE_EVENT_STATUSES)[number];

// ---------------------------------------------------------------------------
// Schemas — the single source the storage rows (`data[]` + edges) and the
// emitted JSON Schemas are GENERATED from (kindSchemaToStorage /
// kindSchemaToJsonSchema), never hand-written twice.
// ---------------------------------------------------------------------------

export const timelineKindSchema: KindSchema = {
  kind: "timeline",
  fields: {
    title: { type: "string", required: true },
    description: { type: "string" },
    periods: {
      type: "array",
      itemKinds: ["timeline_period"],
      required: true,
    },
  },
};

export const timelinePeriodKindSchema: KindSchema = {
  kind: "timeline_period",
  fields: {
    period: { type: "string", required: true },
    events: {
      type: "array",
      itemKinds: ["timeline_event"],
      required: true,
    },
  },
};

export const timelineEventKindSchema: KindSchema = {
  kind: "timeline_event",
  fields: {
    id: { type: "string" },
    title: { type: "string", required: true },
    date: { type: "string" },
    description: { type: "string" },
    status: { type: "enum", values: [...TIMELINE_EVENT_STATUSES] },
    category: { type: "string" },
  },
};

export const TIMELINE_KIND_SCHEMAS: KindSchema[] = [
  timelineKindSchema,
  timelinePeriodKindSchema,
  timelineEventKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

const MAPPED_EVENT_KEYS = new Set([
  "id",
  "title",
  "date",
  "description",
  "status",
  "category",
]);
const MAPPED_PERIOD_KEYS = new Set(["period", "events"]);
const MAPPED_SET_KEYS = new Set(["title", "description", "periods"]);

function nonEmptyString(value: unknown): string | null {
  return typeof value === "string" && value !== "" ? value : null;
}

/** Parser-faithful status read: exact enum + the spaced/underscored variants. */
function normalizeStatus(value: unknown): TimelineEventStatus | undefined {
  if (typeof value !== "string") return undefined;
  const canon = value.trim().toLowerCase().replace(/[\s_]+/g, "-");
  return (TIMELINE_EVENT_STATUSES as readonly string[]).includes(canon)
    ? (canon as TimelineEventStatus)
    : undefined;
}

function mapEvent(
  event: Record<string, unknown>,
  periodName: string,
  index: number,
): Record<string, unknown> | null {
  const title = nonEmptyString(event.title);
  if (!title) return null;

  const mapped: Record<string, unknown> = {
    // The parser's exact id scheme — the component keys completion on it.
    id: nonEmptyString(event.id) ?? `${periodName}-${index}`,
    title,
    date: nonEmptyString(event.date) ?? "TBD",
    description: nonEmptyString(event.description) ?? title,
  };

  const status = normalizeStatus(event.status);
  if (status) mapped.status = status;

  const category = nonEmptyString(event.category);
  if (category) mapped.category = category;

  // Zero data loss: schema-unknown extras ride along untouched.
  for (const [key, value] of Object.entries(event)) {
    if (MAPPED_EVENT_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }

  return mapped;
}

function mapPeriod(
  period: Record<string, unknown>,
): Record<string, unknown> | null {
  const name = nonEmptyString(period.period);
  if (!name) return null;

  const rawEvents = Array.isArray(period.events) ? period.events : [];
  const events: Record<string, unknown>[] = [];
  for (const event of rawEvents) {
    if (!isRecord(event)) continue;
    const mapped = mapEvent(event, name, events.length);
    if (mapped) events.push(mapped);
  }
  // The parser only ever pushes periods that hold at least one event.
  if (events.length === 0) return null;

  const mapped: Record<string, unknown> = { period: name, events };
  for (const [key, value] of Object.entries(period)) {
    if (MAPPED_PERIOD_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }
  return mapped;
}

export const timelineServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "timeline",
  (value) => {
    if (!Array.isArray(value.periods)) return undefined;

    const periods: Record<string, unknown>[] = [];
    for (const period of value.periods) {
      if (!isRecord(period)) continue;
      const mapped = mapPeriod(period);
      if (mapped) periods.push(mapped);
    }
    if (periods.length === 0) return undefined;

    const serverData: Record<string, unknown> = {
      // The parser's own fallback title.
      title: nonEmptyString(value.title) ?? "Timeline",
      periods,
    };
    const description = nonEmptyString(value.description);
    if (description) serverData.description = description;

    for (const [key, extra] of Object.entries(value)) {
      if (MAPPED_SET_KEYS.has(key) || key in serverData) continue;
      serverData[key] = extra;
    }

    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — timeline → human-readable roadmap markdown.
//
// One heading per period, one bullet per event carrying the same inline
// grammar the legacy `<timeline>` text format used — `**Title** (Date)
// [Category] — status` — with the description indented under the bullet.
// Unknown keys (event/period-level inline; set-level under "Additional
// details") never silently vanish.
// ---------------------------------------------------------------------------

const MD_EVENT_KNOWN_KEYS = [
  "id",
  "title",
  "date",
  "description",
  "status",
  "category",
];
const MD_PERIOD_KNOWN_KEYS = ["period", "events"];
const MD_SET_KNOWN_KEYS = ["title", "description", "periods"];

function eventMarkdown(event: Record<string, unknown>): string {
  const title = nonEmptyString(event.title) ?? "";
  const date = nonEmptyString(event.date);
  const category = nonEmptyString(event.category);
  const status = normalizeStatus(event.status);

  let line = `- **${title}**`;
  if (date) line += ` (${date})`;
  if (category) line += ` [${category}]`;
  if (status) line += ` — ${status}`;

  const parts = [line];
  const description = nonEmptyString(event.description);
  if (description && description !== title) {
    parts.push(`  ${description}`);
  }
  const extras = extrasList(collectExtras(event, MD_EVENT_KNOWN_KEYS));
  if (extras) parts.push(extras.replace(/^- /gm, "  - "));
  return parts.join("\n");
}

function periodMarkdown(period: Record<string, unknown>): string {
  const blocks: Array<string | null> = [
    `## ${nonEmptyString(period.period) ?? "Period"}`,
  ];

  const events = Array.isArray(period.events)
    ? period.events.filter(isRecordValue)
    : [];
  if (events.length > 0) {
    blocks.push(events.map(eventMarkdown).join("\n"));
  }

  const extras = extrasList(collectExtras(period, MD_PERIOD_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  return joinBlocks(blocks);
}

export function timelineMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title = nonEmptyString(value.title) ?? "Timeline";
  const periods = Array.isArray(value.periods)
    ? value.periods.filter(isRecordValue)
    : [];

  return joinBlocks([
    `# ${title}`,
    nonEmptyString(value.description),
    ...periods.map(periodMarkdown),
    additionalDetailsSection(collectExtras(value, MD_SET_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — NOT registered here. Central integration adds these
// to the system registry (system-kinds.ts); this module only exports them.
// ---------------------------------------------------------------------------

export const TIMELINE_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "timeline",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "timeline",
    toLegacyServerData: timelineServerDataFromEnvelope,
    toMarkdown: timelineMarkdownFromValue,
    artifact: { canvasType: "timeline" },
    persistence: { persistStructured: true },
    schema: timelineKindSchema,
  },
  {
    kind: "timeline_period",
    schemaSource: "system",
    tier: "eager",
    schema: timelinePeriodKindSchema,
  },
  {
    kind: "timeline_event",
    schemaSource: "system",
    tier: "eager",
    schema: timelineEventKindSchema,
  },
];
