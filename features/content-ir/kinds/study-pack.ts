/**
 * `study_pack_set` — the whole Study Pack as one composed artifact: the pack
 * header (title / topic / audience) plus the four member artifacts, each of
 * them a REGISTERED KIND in its own right:
 *
 *   { "__kind":"study_pack_set", "title":"…", "topic":"…", "audience":"…",
 *     "notes":      { "__kind":"study_notes", … },
 *     "flashcards": { "__kind":"flashcard_set", … },
 *     "quiz":       { "__kind":"quiz_set", … },
 *     "lessons":    { "__kind":"lesson_script_set", … },
 *     "sources_summary": { … } }
 *
 * This supersedes the v4 "generic structured root" schema (`included_sets`
 * anyOf with the dangling `flashcard_set_beta` ref — the v5 kind-migration
 * leftover). The composed shape is what study_pack_v2 emits.
 *
 * TS-OWNED: the DB row's `data[]` and emitted schemas are generated from the
 * schema below by `pnpm shape:emit`.
 *
 * The bridge is STREAMING and deliberately THIN: it never re-maps a child's
 * fields — it hands each child subtree through untouched, because
 * StudyPackBlock TRANSPARENTLY DELEGATES every child to that kind's own
 * canonical component (the runtime-wrapper law: delegate, never reimplement).
 * A child that hasn't arrived yet is simply absent; the block shows that
 * kind's loading skeleton until its object opens.
 */

import type { CanonicalBlockIR } from "@ai-matrx/content-ir";
import { KIND_KEY } from "@ai-matrx/content-ir";
import type { KindSchema } from "@ai-matrx/content-ir";
import type { KindDefinition } from "@ai-matrx/content-ir";
import {
  additionalDetailsSection,
  collectExtras,
  joinBlocks,
} from "./kind-markdown-utils";
import { flashcardsMarkdownFromValue } from "./flashcard-set";
import { quizMarkdownFromValue } from "./quiz-set";
import { studyNotesMarkdownFromValue } from "./study-notes";
import { lessonScriptsMarkdownFromValue } from "./lesson-scripts";

// ---------------------------------------------------------------------------
// Schema — the ONE source `data[]` and the emitted JSON Schemas come from.
// ---------------------------------------------------------------------------

export const studyPackSetKindSchema: KindSchema = {
  kind: "study_pack_set",
  fields: {
    title: {
      type: "string",
      required: true,
      description: "What this study pack covers.",
    },
    topic: {
      type: "string",
      description: "The subject the pack was generated from.",
    },
    audience: {
      type: "string",
      description: "Who the pack was written for.",
    },
    notes: {
      type: "object",
      kind: "study_notes",
      description: "The pack's study notes document.",
    },
    flashcards: {
      type: "object",
      kind: "flashcard_set",
      description: "The pack's flashcard deck.",
    },
    quiz: {
      type: "object",
      kind: "quiz_set",
      description: "The pack's practice quiz.",
    },
    lessons: {
      type: "object",
      kind: "lesson_script_set",
      description: "The pack's spoken lesson scripts.",
    },
    sources_summary: {
      type: "inline_object",
      open: true,
      fields: {},
      description:
        "What the pack was built from — free-form summary of the ingested sources.",
    },
  },
};

// ---------------------------------------------------------------------------
// serverData bridge — STREAMING, delegation-shaped.
// ---------------------------------------------------------------------------

/** Canonical member order — also the render order in StudyPackBlock. */
export const STUDY_PACK_CHILDREN = [
  { key: "notes", kind: "study_notes", label: "Study notes" },
  { key: "flashcards", kind: "flashcard_set", label: "Flashcards" },
  { key: "quiz", kind: "quiz_set", label: "Practice quiz" },
  { key: "lessons", kind: "lesson_script_set", label: "Lessons" },
] as const;

export type StudyPackChildKey = (typeof STUDY_PACK_CHILDREN)[number]["key"];

export interface StudyPackChild {
  key: StudyPackChildKey;
  kind: string;
  label: string;
  /** The child subtree, untouched — the block delegates it to its own kind. */
  value: Record<string, unknown>;
  complete: boolean;
}

export interface StudyPackData extends Record<string, unknown> {
  title: string;
  topic: string;
  audience: string;
  /** Arrived members in canonical order; absent members simply aren't here yet. */
  children: StudyPackChild[];
  sourcesSummary: Record<string, unknown> | null;
  isComplete: boolean;
}

const PACK_MAPPED_KEYS = new Set([
  "title",
  "topic",
  "audience",
  "notes",
  "flashcards",
  "quiz",
  "lessons",
  "sources_summary",
  KIND_KEY,
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

const childMemo = new WeakMap<object, StudyPackChild>();

export function studyPackServerDataFromEnvelope(
  envelope: CanonicalBlockIR,
): StudyPackData | undefined {
  if (envelope.root.kind !== "study_pack_set") return undefined;

  const value = envelope.root.value;
  const setComplete = envelope.root.status === "complete";
  const children: StudyPackChild[] = [];

  for (const member of STUDY_PACK_CHILDREN) {
    const raw = value[member.key];
    if (!isRecord(raw)) continue;

    const cached = childMemo.get(raw);
    if (cached) {
      children.push(cached);
      continue;
    }

    const meta = envelope.nodeIndex?.[member.key];
    const child: StudyPackChild = {
      key: member.key,
      kind: member.kind,
      label: member.label,
      value: raw,
      complete: setComplete || meta?.status === "complete",
    };
    childMemo.set(raw, child);
    children.push(child);
  }

  const serverData: StudyPackData = {
    title: typeof value.title === "string" ? value.title : "",
    topic: typeof value.topic === "string" ? value.topic : "",
    audience: typeof value.audience === "string" ? value.audience : "",
    children,
    sourcesSummary: isRecord(value.sources_summary)
      ? value.sources_summary
      : null,
    isComplete: setComplete,
  };

  // Pack-level unknown keys ride along untouched — nothing vanishes.
  for (const [key, extra] of Object.entries(value)) {
    if (PACK_MAPPED_KEYS.has(key) || key in serverData) continue;
    serverData[key] = extra;
  }

  return serverData;
}

// ---------------------------------------------------------------------------
// toMarkdown facet — the pack as one document, each member via ITS OWN facet.
// ---------------------------------------------------------------------------

const MD_KNOWN_KEYS = [
  "title",
  "topic",
  "audience",
  "notes",
  "flashcards",
  "quiz",
  "lessons",
  "sources_summary",
  KIND_KEY,
];

const CHILD_MARKDOWN: Record<
  StudyPackChildKey,
  (value: Record<string, unknown>) => string
> = {
  notes: studyNotesMarkdownFromValue,
  flashcards: flashcardsMarkdownFromValue,
  quiz: quizMarkdownFromValue,
  lessons: lessonScriptsMarkdownFromValue,
};

export function studyPackMarkdownFromValue(
  value: Record<string, unknown>,
): string {
  const title =
    typeof value.title === "string" && value.title !== ""
      ? value.title
      : "Study pack";

  const meta: string[] = [];
  if (typeof value.topic === "string" && value.topic !== "") {
    meta.push(`- **Topic:** ${value.topic}`);
  }
  if (typeof value.audience === "string" && value.audience !== "") {
    meta.push(`- **Audience:** ${value.audience}`);
  }

  const memberBlocks = STUDY_PACK_CHILDREN.map((member) => {
    const raw = value[member.key];
    if (!isRecord(raw)) return null;
    return CHILD_MARKDOWN[member.key](raw);
  });

  return joinBlocks([
    `# ${title}`,
    meta.length > 0 ? meta.join("\n") : null,
    ...memberBlocks,
    additionalDetailsSection(collectExtras(value, MD_KNOWN_KEYS)),
  ]);
}

// ---------------------------------------------------------------------------
// Compiled definition — registered centrally in system-kinds.ts. The four
// child kinds are registered by their own modules, never re-declared here.
// ---------------------------------------------------------------------------

export const STUDY_PACK_KIND_DEFINITIONS: KindDefinition[] = [
  {
    kind: "study_pack_set",
    schemaSource: "system",
    tier: "eager",
    legacyBlockType: "study_pack",
    toLegacyServerData: studyPackServerDataFromEnvelope,
    toMarkdown: studyPackMarkdownFromValue,
    persistence: { persistStructured: true },
    loadingComponent: "document",
    // Streaming partial kinds: a provisional study_pack_set routes to the real
    // StudyPackBlock and gains its members one at a time. The bridge already
    // reads every field defensively and marks a member incomplete unless the
    // node index says otherwise, so a half-arrived pack renders as a pack with
    // members still filling — never as a throw and never as an empty shell.
    partialReady: true,
    schema: studyPackSetKindSchema,
  },
];
