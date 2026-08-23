/**
 * `lesson_script_set` (+ nested child `lesson_script_section`) — the spoken
 * lessons of a Study Pack: an ordered set of narration scripts, each section
 * a TTS-ready passage with its heading, how long it runs, and the points it
 * must land.
 *
 * Produced by the Study Pack lessons agent (aidream study_pack_v2's
 * `lesson_scripts` → `parse_lessons` steps) and declared as this kind by the
 * workflow node. Two levels deep by design (Arman's nesting doctrine): the
 * set, and its sections — nothing deeper.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"lesson_script_set", "title":"…", "overview":"…",
 *     "sections":[ { "__kind":"lesson_script_section", "heading":"…",
 *                    "script":"…", "duration_seconds": 90,
 *                    "key_points":["…"] } ] }
 *
 * TS-OWNED: the DB row's `data[]` and emitted schemas are generated from the
 * schemas below by `pnpm shape:emit` — the converters are the source of
 * truth, so nothing is written twice.
 *
 * The bridge is STREAMING, in the flashcards style (hand-written — never
 * `makeCompleteEnvelopeBridge`): it reads `root.value` directly on every
 * flush, so sections appear the moment their objects close. A section whose
 * `heading` has arrived but whose `script` is still streaming maps to
 * `script: null`, which the block renders as that section's loader — the same
 * per-item contract as a flashcard whose `back` hasn't arrived. Section
 * mapping is memoized on the section's tree-value identity (structural
 * sharing keeps unchanged sections reference-stable across envelope flushes),
 * so memoized section components bail out.
 */

import type { CanonicalBlockIR, IrResidue } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import {
  additionalDetailsSection,
  collectExtras,
  extrasList,
  isRecordValue,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schemas — the ONE source `data[]` and the emitted JSON Schemas come from.
// ---------------------------------------------------------------------------

export const lessonScriptSectionKindSchema: KindSchema = {
  kind: "lesson_script_section",
  fields: {
    heading: {
      type: "string",
      required: true,
      description:
        "What this part of the lesson covers — a short, plain title.",
    },
    script: {
      type: "string",
      required: true,
      description:
        "The full narration for this section, written to be read aloud — complete sentences, no markup, ready for TTS.",
    },
    duration_seconds: {
      type: "number",
      description:
        "Roughly how long this section runs when spoken, in seconds.",
    },
    key_points: {
      type: "string[]",
      description:
        "The points this section must land, one per item — each a complete statement.",
    },
  },
};

export const lessonScriptSetKindSchema: KindSchema = {
  kind: "lesson_script_set",
  fields: {
    title: {
      type: "string",
      required: true,
      description: "What this set of lessons teaches.",
    },
    overview: {
      type: "string",
      description:
        "The whole lesson in one paragraph — what a listener gets before any section plays.",
    },
    sections: {
      type: "array",
      itemKinds: ["lesson_script_section"],
      required: true,
      description: "The lessons themselves, in teaching order.",
    },
    additionalDetails: { type: "inline_object", open: true, fields: {} },
  },
};

export const LESSON_SCRIPTS_KIND_SCHEMAS: KindSchema[] = [
  lessonScriptSetKindSchema,
  lessonScriptSectionKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING, flashcards style.
// ---------------------------------------------------------------------------

export interface LessonScriptSection extends Record<string, unknown> {
  heading: string;
  /** null while the section's narration is still streaming — per-section loader. */
  script: string | null;
  durationSeconds: number | null;
  keyPoints: string[];
}

export interface LessonScriptsData extends Record<string, unknown> {
  title: string;
  overview: string;
  sections: LessonScriptSection[];
  isComplete: boolean;
}

const SECTION_MAPPED_KEYS = new Set([
  "heading",
  "script",
  "duration_seconds",
  "key_points",
  KIND_KEY,
]);

const SET_MAPPED_KEYS = new Set(["title", "overview", "sections", KIND_KEY]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v !== "");
}

const sectionMemo = new WeakMap<object, LessonScriptSection>();

function mapSection(
  section: Record<string, unknown>,
  residue: IrResidue | null | undefined,
  sectionComplete: boolean,
): LessonScriptSection {
  const cached = sectionMemo.get(section);
  if (cached) return cached;

  const heading = typeof section.heading === "string" ? section.heading : "";
  const rawScript = section.script;
  const script =
    typeof rawScript === "string"
      ? rawScript === "" && !sectionComplete
        ? null // still streaming — the block shows the per-section loader
        : rawScript
      : null;
  const durationSeconds =
    typeof section.duration_seconds === "number" &&
    Number.isFinite(section.duration_seconds)
      ? section.duration_seconds
      : null;

  const mapped: LessonScriptSection = {
    heading,
    script,
    durationSeconds,
    keyPoints: stringList(section.key_points),
  };

  for (const [key, value] of Object.entries(section)) {
    if (SECTION_MAPPED_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }
  // Zero data loss: unknown keys ride the residue channel, not the snapshot.
  for (const [key, value] of Object.entries(residue?.extra ?? {})) {
    if (SECTION_MAPPED_KEYS.has(key) || key in mapped) continue;
    mapped[key] = value;
  }

  sectionMemo.set(section, mapped);
  return mapped;
}

export function lessonScriptsServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): LessonScriptsData | undefined {
  if (envelope.root.kind !== "lesson_script_set") return undefined;

  const rawSections = envelope.root.value.sections;
  if (!Array.isArray(rawSections)) return undefined;

  const setComplete = envelope.root.status === "complete";
  const sections: LessonScriptSection[] = [];

  for (let i = 0; i < rawSections.length; i++) {
    const section = rawSections[i];
    if (!isRecord(section)) continue;
    if (typeof section.heading !== "string" || section.heading === "") continue;

    const meta = envelope.nodeIndex?.[`sections.${i}`];
    sections.push(
      mapSection(
        section,
        meta?.residue,
        setComplete || meta?.status === "complete",
      ),
    );
  }

  const serverData: LessonScriptsData = {
    title:
      typeof envelope.root.value.title === "string"
        ? envelope.root.value.title
        : "",
    overview:
      typeof envelope.root.value.overview === "string"
        ? envelope.root.value.overview
        : "",
    sections,
    isComplete: setComplete,
  };

  // Set-level unknown keys ride along untouched — nothing vanishes.
  for (const [key, extra] of Object.entries(envelope.root.value)) {
    if (SET_MAPPED_KEYS.has(key) || key in serverData) continue;
    serverData[key] = extra;
  }

  return serverData;
}

// ---------------------------------------------------------------------------
// toMarkdown facet — the lessons as the narration document they are.
// ---------------------------------------------------------------------------

const MD_SECTION_KNOWN_KEYS = [
  "heading",
  "script",
  "duration_seconds",
  "key_points",
  KIND_KEY,
];

const MD_SET_KNOWN_KEYS = ["title", "overview", "sections", KIND_KEY];

function formatDuration(seconds: number): string {
  if (seconds < 60) return `${Math.round(seconds)}s`;
  const minutes = Math.floor(seconds / 60);
  const rest = Math.round(seconds % 60);
  return rest > 0 ? `${minutes}m ${rest}s` : `${minutes}m`;
}

function sectionMarkdown(
  section: Record<string, unknown>,
  index: number,
): string {
  const heading = typeof section.heading === "string" ? section.heading : "";
  const duration =
    typeof section.duration_seconds === "number" &&
    Number.isFinite(section.duration_seconds)
      ? ` (${formatDuration(section.duration_seconds)})`
      : "";

  const keyPoints = stringList(section.key_points);
  const blocks: Array<string | null> = [
    `## ${index + 1}. ${heading}${duration}`,
    typeof section.script === "string" && section.script !== ""
      ? section.script
      : null,
    keyPoints.length > 0
      ? joinBlocks([
          "**Key points**",
          keyPoints.map((point) => `- ${point}`).join("\n"),
        ])
      : null,
  ];

  const extras = extrasList(collectExtras(section, MD_SECTION_KNOWN_KEYS));
  if (extras) blocks.push(extras);

  return joinBlocks(blocks);
}

export function lessonScriptsMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Lesson scripts";
  const sections = Array.isArray(value.sections)
    ? value.sections.filter(isRecordValue)
    : [];

  return joinBlocks([
    `# ${title}`,
    typeof value.overview === "string" && value.overview !== ""
      ? value.overview
      : null,
    ...sections.map(sectionMarkdown),
    additionalDetailsSection(collectExtras(value, MD_SET_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const LESSON_SCRIPTS_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "lesson_script_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "lesson_scripts",
    toLegacyServerData: lessonScriptsServerDataFromEnvelope,
    toMarkdown: lessonScriptsMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "document",
    // Streaming partial kinds: a provisional lesson_script_set routes to the
    // real LessonScriptsBlock and fills in section by section. The bridge is
    // hand-written and never gates on status, so a streaming envelope maps
    // exactly like a complete one — the pinned pairing test covers this.
    partialReady: true,
    schema: lessonScriptSetKindSchema,
  },
  {
    kind: "lesson_script_section",
    schemaSource: "system",
    tier: "eager",
    schema: lessonScriptSectionKindSchema,
  },
];
