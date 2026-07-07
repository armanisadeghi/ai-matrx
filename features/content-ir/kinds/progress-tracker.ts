/**
 * progress_tracker kind → ProgressTrackerBlock bridge.
 *
 * The canonical structured shape behind the `<progress_tracker>` XML block
 * (components/mardown-display/blocks/progress/ProgressTrackerBlock.tsx +
 * parseProgressMarkdown.ts). The kind is the UNION of everything the palette's
 * two variants ("Progress Tracker" simple + "Detailed Progress Tracker") and
 * the component family carry:
 *
 *   { __kind:"progress_tracker", title, description?, phases: [
 *       { __kind:"progress_phase", id?, name, description?, color?,
 *         completion_percentage?, steps: [
 *           { __kind:"progress_step", id?, text, completed, optional?,
 *             priority?("low"|"medium"|"high"), estimated_hours?,
 *             category? } ] } ],
 *     overall_progress?, start_date?, target_date?, total_items?,
 *     completed_items? }
 *
 * Authored fields are snake_case (the kind convention — quiz `correct_answer`
 * precedent); the bridge derives the component's exact camelCase
 * `ProgressTrackerData` (`categories[].items[]`, `completionPercentage`,
 * `estimatedHours`, `overallProgress`, `startDate`, `targetDate`,
 * `totalItems`, `completedItems`). ProgressArtifact passes serverData
 * straight through as the `tracker` prop — zero component changes.
 *
 * Mapping notes:
 * - ids: the component keys interaction state (persisted completed sets) by
 *   item/category id. Authored ids win; missing ids are synthesized with the
 *   legacy parser's exact scheme (`category-N`, `item-N`, N global across
 *   phases) so bridge output is indistinguishable from a parse.
 * - tracker totals (`total_items`/`completed_items`/`overall_progress`):
 *   authored values win; otherwise computed from the steps, mirroring
 *   parseProgressMarkdown which always emits them.
 * - phase `completion_percentage` maps only when authored (the parser leaves
 *   it undefined unless the `**Name** (N% complete)` header carried it; the
 *   component recomputes live percentages regardless).
 * - Steps without `text` and phases without a surviving step are skipped
 *   (validateProgressTracker's floor); a tracker with no surviving phase
 *   declines to undefined (raw-content parse path takes over).
 *
 * NOT registered in registry/system-kinds.ts yet (Stage-5-style integration
 * is a separate deliberate step); the definitions below are splice-ready and
 * consumed directly by __tests__/kind-progress-tracker.test.ts.
 */

import type { KindDefinition } from "../registry/kind-registry.types";
import { makeCompleteEnvelopeBridge, isRecord } from "./legacy-bridge-utils";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Field vocabulary — one place for the authored (snake_case) key sets.
// ---------------------------------------------------------------------------

const TRACKER_KNOWN_KEYS = [
  "title",
  "description",
  "phases",
  "overall_progress",
  "start_date",
  "target_date",
  "total_items",
  "completed_items",
];

const PHASE_KNOWN_KEYS = [
  "id",
  "name",
  "description",
  "color",
  "completion_percentage",
  "steps",
];

const STEP_KNOWN_KEYS = [
  "id",
  "text",
  "completed",
  "optional",
  "priority",
  "estimated_hours",
  "category",
];

const PRIORITIES = ["low", "medium", "high"] as const;
type Priority = (typeof PRIORITIES)[number];

function readPriority(value: unknown): Priority | undefined {
  if (typeof value !== "string") return undefined;
  const normalized = value.trim().toLowerCase();
  return (PRIORITIES as readonly string[]).includes(normalized)
    ? (normalized as Priority)
    : undefined;
}

function readNonEmptyString(value: unknown): string | undefined {
  return typeof value === "string" && value !== "" ? value : undefined;
}

function readFiniteNumber(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value)
    ? value
    : undefined;
}

// ---------------------------------------------------------------------------
// toLegacyServerData — progress_tracker envelope → ProgressTrackerData.
// ---------------------------------------------------------------------------

function mapStep(
  step: Record<string, unknown>,
  syntheticId: string,
): Record<string, unknown> | undefined {
  const text = readNonEmptyString(step.text);
  if (!text) return undefined;

  const item: Record<string, unknown> = {
    id: readNonEmptyString(step.id) ?? syntheticId,
    text,
    completed: step.completed === true,
  };

  if (step.optional === true) item.optional = true;
  const priority = readPriority(step.priority);
  if (priority) item.priority = priority;
  const estimatedHours = readFiniteNumber(step.estimated_hours);
  if (estimatedHours !== undefined) item.estimatedHours = estimatedHours;
  const category = readNonEmptyString(step.category);
  if (category) item.category = category;

  // Zero data loss: schema-unknown step keys ride along untouched.
  for (const [key, value] of Object.entries(step)) {
    if (STEP_KNOWN_KEYS.includes(key) || key in item) continue;
    item[key] = value;
  }

  return item;
}

export const progressTrackerServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "progress_tracker",
  (value) => {
    const title = readNonEmptyString(value.title);
    if (!title || !Array.isArray(value.phases)) return undefined;

    const categories: Record<string, unknown>[] = [];
    let itemCounter = 0;

    for (const phase of value.phases) {
      if (!isRecord(phase)) continue;
      const name = readNonEmptyString(phase.name);
      if (!name) continue;

      const items: Record<string, unknown>[] = [];
      if (Array.isArray(phase.steps)) {
        for (const step of phase.steps) {
          if (!isRecord(step)) continue;
          const item = mapStep(step, `item-${itemCounter + 1}`);
          if (item) {
            itemCounter++;
            items.push(item);
          }
        }
      }
      // The component family's floor (validateProgressTracker): a category
      // renders only with at least one item.
      if (items.length === 0) continue;

      const category: Record<string, unknown> = {
        id: readNonEmptyString(phase.id) ?? `category-${categories.length + 1}`,
        name,
        items,
      };
      const description = readNonEmptyString(phase.description);
      if (description) category.description = description;
      const color = readNonEmptyString(phase.color);
      if (color) category.color = color;
      const completionPercentage = readFiniteNumber(
        phase.completion_percentage,
      );
      if (completionPercentage !== undefined) {
        category.completionPercentage = completionPercentage;
      }
      for (const [key, extra] of Object.entries(phase)) {
        if (PHASE_KNOWN_KEYS.includes(key) || key in category) continue;
        category[key] = extra;
      }

      categories.push(category);
    }

    if (categories.length === 0) return undefined;

    // Authored totals win; otherwise compute exactly like the legacy parser.
    const allItems = categories.flatMap(
      (category) => category.items as Record<string, unknown>[],
    );
    const computedTotal = allItems.length;
    const computedCompleted = allItems.filter(
      (item) => item.completed === true,
    ).length;

    const totalItems = readFiniteNumber(value.total_items) ?? computedTotal;
    const completedItems =
      readFiniteNumber(value.completed_items) ?? computedCompleted;
    const overallProgress =
      readFiniteNumber(value.overall_progress) ??
      (computedTotal > 0
        ? Math.round((computedCompleted / computedTotal) * 100)
        : 0);

    const serverData: Record<string, unknown> = {
      title,
      categories,
      overallProgress,
      totalItems,
      completedItems,
    };
    const description = readNonEmptyString(value.description);
    if (description) serverData.description = description;
    const startDate = readNonEmptyString(value.start_date);
    if (startDate) serverData.startDate = startDate;
    const targetDate = readNonEmptyString(value.target_date);
    if (targetDate) serverData.targetDate = targetDate;

    for (const [key, extra] of Object.entries(value)) {
      if (TRACKER_KNOWN_KEYS.includes(key) || key in serverData) continue;
      serverData[key] = extra;
    }

    return serverData;
  },
);

// ---------------------------------------------------------------------------
// toMarkdown facet — progress_tracker → the legacy markdown grammar.
//
// Deliberately emits the EXACT format parseProgressMarkdown consumes
// (### title / **Phase** (N% complete) / "- [x] text {priority} (2h)
// [optional] [category:Name]") so the export round-trips through the real
// parser — and it reads as clean markdown (heading, bold phase headers,
// checklists) at the same time. Unknown keys never silently vanish: phase
// extras ride as plain bullets (parser-inert), tracker extras under
// "Additional details".
// ---------------------------------------------------------------------------

function stepLine(step: Record<string, unknown>): string {
  const text = readNonEmptyString(step.text) ?? "";
  const parts = [`- [${step.completed === true ? "x" : " "}] ${text}`];

  const priority = readPriority(step.priority);
  if (priority) parts.push(`{${priority}}`);
  const estimatedHours = readFiniteNumber(step.estimated_hours);
  if (estimatedHours !== undefined) parts.push(`(${estimatedHours}h)`);
  if (step.optional === true) parts.push("[optional]");
  const category = readNonEmptyString(step.category);
  if (category) parts.push(`[category:${category}]`);

  const line = parts.join(" ");
  const extras = extrasList(
    collectExtras(step, [...STEP_KNOWN_KEYS, "estimatedHours"]),
  );
  // Indented bullets stay readable and are inert to the legacy parser.
  return extras ? `${line}\n${extras.replace(/^- /gm, "  - ")}` : line;
}

function phaseMarkdown(phase: Record<string, unknown>): string {
  const name = readNonEmptyString(phase.name) ?? "Phase";
  const completionPercentage = readFiniteNumber(phase.completion_percentage);
  const header =
    completionPercentage !== undefined
      ? `**${name}** (${completionPercentage}% complete)`
      : `**${name}**`;

  const blocks: Array<string | null> = [header];

  const steps = Array.isArray(phase.steps)
    ? phase.steps.filter(isRecordValue)
    : [];
  if (steps.length > 0) blocks.push(steps.map(stepLine).join("\n"));

  const meta: string[] = [];
  const description = readNonEmptyString(phase.description);
  if (description) meta.push(`- **Description:** ${description}`);
  const extras = extrasList(
    collectExtras(phase, [...PHASE_KNOWN_KEYS, "completionPercentage"]),
  );
  if (extras) meta.push(extras);
  if (meta.length > 0) blocks.push(meta.join("\n"));

  return joinBlocks(blocks);
}

export function progressTrackerMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title = readNonEmptyString(value.title) ?? "Progress Tracker";
  const phases = Array.isArray(value.phases)
    ? value.phases.filter(isRecordValue)
    : [];

  return joinBlocks([
    `### ${title}`,
    readNonEmptyString(value.description) ?? null,
    ...phases.map(phaseMarkdown),
    additionalDetailsSection(collectExtras(value, TRACKER_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Splice-ready KindDefinitions — the registry entries for the family
// (registry/system-kinds.ts integration is a separate deliberate step; DB
// rows mirror these via migrations/kind_progress_tracker_full.sql, where
// `data`/`emitted_json_schema` are converter-emitted from these schemas).
// ---------------------------------------------------------------------------

export const PROGRESS_TRACKER_KIND_DEFINITIONS: readonly KindDefinition[] = [
  {
    kind: "progress_tracker",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "progress_tracker",
    toLegacyServerData: progressTrackerServerDataFromEnvelope,
    toMarkdown: progressTrackerMarkdownFromValue,
    artifact: { canvasType: "progress" },
    persistence: { persistStructured: true },
    schema: {
      kind: "progress_tracker",
      fields: {
        title: { type: "string", required: true },
        description: { type: "string" },
        phases: {
          type: "array",
          itemKinds: ["progress_phase"],
          required: true,
        },
        overall_progress: { type: "number" },
        start_date: { type: "string" },
        target_date: { type: "string" },
        total_items: { type: "number" },
        completed_items: { type: "number" },
      },
    },
  },
  {
    kind: "progress_phase",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "progress_phase",
      fields: {
        id: { type: "string" },
        name: { type: "string", required: true },
        description: { type: "string" },
        color: { type: "string" },
        completion_percentage: { type: "number" },
        steps: {
          type: "array",
          itemKinds: ["progress_step"],
          required: true,
        },
      },
    },
  },
  {
    kind: "progress_step",
    schemaSource: "system",
    tier: "eager",
    schema: {
      kind: "progress_step",
      fields: {
        id: { type: "string" },
        text: { type: "string", required: true },
        completed: { type: "boolean", required: true },
        optional: { type: "boolean" },
        priority: { type: "enum", values: ["low", "medium", "high"] },
        estimated_hours: { type: "number" },
        category: { type: "string" },
      },
    },
  },
];
