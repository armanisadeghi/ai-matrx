/**
 * `study_notes` (+ nested children `study_notes_section`, `glossary_term`) —
 * a set of study notes as a real document: an overview, sections that each
 * carry a summary, its key points and its worked examples, and a glossary.
 *
 * Produced by the Study Pack notes agent and read out of its reply by
 * `ai.util.parse_llm_json`; the workflow's `study_notes` step spreads that
 * parsed document flat and declares THIS kind (aidream
 * `aidream/workflows/study_pack_v1.py`). Before registration the panel showed
 * the generic JSON viewer — one unbroken line of braces and escaped quotes on
 * the screen where a learner is supposed to READ.
 *
 * 🚨 IT IS NOT `structured_info`, AND FORCING IT THERE IS A DRIFT LOG EVERY
 * RUN. That kind is `additionalProperties:false` over exactly `title` +
 * `sections`, and its section allows only `{heading, body, items}` — so
 * `overview`, a section `summary`, `key_points`, `examples` and the whole
 * `glossary` have nowhere to go. The measured shape (8 of 8 consecutive live
 * runs, identical) is what this schema describes.
 *
 * Canonical `__kind` JSON shape:
 *   { "__kind":"study_notes", "title":"…", "overview":"…",
 *     "sections":[ { "__kind":"study_notes_section", "heading":"…",
 *                    "summary":"…", "key_points":["…"], "examples":["…"] } ],
 *     "glossary":[ { "__kind":"glossary_term", "term":"…",
 *                    "definition":"…" } ] }
 *
 * TS-OWNED: the DB row's `data[]` and `emitted_json_schema` are generated from
 * the schemas below by `pnpm shape:emit` — the converters are the source of
 * truth, so nothing is written twice.
 *
 * The bridge is STREAMING (memory-aid precedent): `sections` and `glossary`
 * are arrays of child kinds, so the kernel commits them one element at a time
 * and a section appears the moment its object closes. An empty section list is
 * a NORMAL mid-stream state the component renders as the document taking
 * shape — never a spinner, never raw JSON.
 */

import type { CanonicalBlockIR } from "../core/ir-types";
import type { KindSchema } from "../core/kind-schema.types";
import type { KindDefinition } from "../registry/kind-registry.types";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";

// ---------------------------------------------------------------------------
// Schemas — the ONE source `data[]` and the emitted JSON Schemas come from.
// ---------------------------------------------------------------------------

export const glossaryTermKindSchema: KindSchema = {
  kind: "glossary_term",
  fields: {
    term: {
      type: "string",
      required: true,
      description: "The word or phrase being defined, exactly as it appears in the material.",
    },
    definition: {
      type: "string",
      required: true,
      description:
        "What it means, in one or two sentences a newcomer to the topic can follow without another lookup.",
    },
  },
};

export const studyNotesSectionKindSchema: KindSchema = {
  kind: "study_notes_section",
  fields: {
    heading: {
      type: "string",
      required: true,
      description: "What this part of the material is about — a short, plain title.",
    },
    summary: {
      type: "string",
      description:
        "The section in prose: two or three sentences that would stand on their own if the reader read nothing else.",
    },
    key_points: {
      type: "string[]",
      description:
        "The facts worth remembering, one per item — each a complete statement, not a fragment.",
    },
    examples: {
      type: "string[]",
      description:
        "Concrete cases, comparisons or analogies that make the section land.",
    },
  },
};

export const studyNotesKindSchema: KindSchema = {
  kind: "study_notes",
  fields: {
    title: {
      type: "string",
      required: true,
      description: "What these notes cover.",
    },
    overview: {
      type: "string",
      description:
        "The whole topic in one paragraph — what a reader gets before any section.",
    },
    sections: {
      type: "array",
      itemKinds: ["study_notes_section"],
      required: true,
      description: "The notes themselves, in teaching order.",
    },
    glossary: {
      type: "array",
      itemKinds: ["glossary_term"],
      description: "The terms the material assumes, defined.",
    },
  },
};

export const STUDY_NOTES_KIND_SCHEMAS: KindSchema[] = [
  studyNotesKindSchema,
  studyNotesSectionKindSchema,
  glossaryTermKindSchema,
];

// ---------------------------------------------------------------------------
// serverData bridge
// ---------------------------------------------------------------------------

export interface GlossaryTerm {
  term: string;
  definition: string;
}

export interface StudyNotesSection {
  heading: string;
  summary: string;
  keyPoints: string[];
  examples: string[];
}

export interface StudyNotes {
  title: string;
  overview: string;
  sections: StudyNotesSection[];
  glossary: GlossaryTerm[];
}

export interface StudyNotesData {
  notes: StudyNotes;
  isComplete: boolean;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function stringOr(value: unknown, fallback: string): string {
  return typeof value === "string" ? value : fallback;
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.filter((v): v is string => typeof v === "string" && v !== "");
}

/**
 * Tolerant of every partial mid-stream state: a section whose `heading` has
 * arrived but whose `key_points` array has not is a section the component
 * renders, not a reason to drop it.
 *
 * 🚨 IDEMPOTENT ON PURPOSE. The bridge hands the component an already-coerced
 * document, and the component coerces whatever it is given (it also accepts a
 * raw persisted value), so this runs TWICE on the normal path. Reading only the
 * wire spelling `key_points` made the second pass silently blank every key
 * point while `examples` — spelled the same in both shapes — survived, which is
 * exactly how it presented: notes with summaries and examples and no facts.
 * Every renamed field must accept BOTH spellings here.
 */
export function coerceStudyNotes(value: unknown): StudyNotes {
  const record = isRecord(value) ? value : {};
  const rawSections = Array.isArray(record.sections) ? record.sections : [];
  const rawGlossary = Array.isArray(record.glossary) ? record.glossary : [];

  return {
    title: stringOr(record.title, ""),
    overview: stringOr(record.overview, ""),
    sections: rawSections.filter(isRecord).map((section) => ({
      heading: stringOr(section.heading, ""),
      summary: stringOr(section.summary, ""),
      keyPoints: stringList(section.key_points ?? section.keyPoints),
      examples: stringList(section.examples),
    })),
    glossary: rawGlossary
      .filter(isRecord)
      .map((entry) => ({
        term: stringOr(entry.term, ""),
        definition: stringOr(entry.definition, ""),
      }))
      .filter((entry) => entry.term !== ""),
  };
}

export function studyNotesServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): (StudyNotesData & Record<string, unknown>) | undefined {
  if (envelope.root.kind !== "study_notes") return undefined;
  return {
    notes: coerceStudyNotes(envelope.root.value),
    isComplete: envelope.root.status === "complete",
  };
}

// ---------------------------------------------------------------------------
// toMarkdown facet — the notes as the document they are.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = ["title", "overview", "sections", "glossary"];

function sectionMarkdown(section: StudyNotesSection): string {
  return joinBlocks([
    `## ${section.heading}`,
    section.summary || null,
    section.keyPoints.length > 0
      ? joinBlocks([
          "**Key points**",
          section.keyPoints.map((point) => `- ${point}`).join("\n"),
        ])
      : null,
    section.examples.length > 0
      ? joinBlocks([
          "**Examples**",
          section.examples.map((example) => `- ${example}`).join("\n"),
        ])
      : null,
  ]);
}

export function studyNotesMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const notes = coerceStudyNotes(value);
  return joinBlocks([
    `# ${notes.title || "Study notes"}`,
    notes.overview || null,
    ...notes.sections.map(sectionMarkdown),
    notes.glossary.length > 0
      ? joinBlocks([
          "## Glossary",
          notes.glossary
            .map((entry) => `- **${entry.term}** — ${entry.definition}`)
            .join("\n"),
        ])
      : null,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definitions — registered centrally in system-kinds.ts.
// ---------------------------------------------------------------------------

export const STUDY_NOTES_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "study_notes",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "study_notes",
    toLegacyServerData: studyNotesServerDataFromEnvelope,
    toMarkdown: studyNotesMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "list",
    schema: studyNotesKindSchema,
  },
  {
    kind: "study_notes_section",
    schemaSource: "system",
    tier: "eager",
    schema: studyNotesSectionKindSchema,
  },
  {
    kind: "glossary_term",
    schemaSource: "system",
    tier: "eager",
    schema: glossaryTermKindSchema,
  },
];
