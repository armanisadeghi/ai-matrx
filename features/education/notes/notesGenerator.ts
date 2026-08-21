// features/education/notes/notesGenerator.ts
//
// Converter generator: source text → a structured platform NOTE (workbench.notes
// via the canonical NotesAPI — never a forked note store). This is the `notes`
// TargetKind that P4 Smart Notes owns; registering it lights the "Study notes"
// target up on the kit picker (P9) and the one-click note-convert menu.
//
// COVERAGE (2026-08-21): notes are the one target where "preserve, don't
// compress" is the whole point, and a single call over a long document is the
// worst possible shape for that — the model writes the length it thinks notes
// should be, not the length the material needs. It now writes ONE SECTION PER
// coverage section (`features/education/convert/coverage.ts`) and stitches them
// into one note in the document's own order, so a 77-slide deck produces notes
// that actually walk the 77 slides.
//
// A note is a real, first-class platform note (shareable, editable, Knowledge-indexable)
// — so a generated note lands right back in the Smart Notes surface where the
// student can keep working on it. Same lineage + TrustEnvelope contract as the
// summary/deck generators: link a `source` edge to the ingest anchor file and
// carry the trust envelope through unchanged.

import { NotesAPI } from "@/features/notes/service/notesApi";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { NOTES_MANDATES } from "./mandates";
import { recordSourceLineage } from "@/features/education/convert/recordSourceLineage";
import {
  looseKey,
  segmentedGenerate,
} from "@/features/education/convert/segmentedGenerate";
import { mergeTrustEnvelopes } from "@/features/education/convert/trustMerge";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "@/features/education/convert/types";

/** Folder generated study notes land in, so they group in the sidebar. */
const STUDY_NOTES_FOLDER = "Study Notes";

interface KeyTerm {
  term: string;
  definition: string;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

function coerceNotes(value: unknown): {
  title: string;
  markdown: string;
  keyTerms: KeyTerm[];
  trust: TrustEnvelope | null;
} {
  const obj = isRecord(value) ? value : {};
  const title = typeof obj.title === "string" ? obj.title.trim() : "";
  const markdown =
    typeof obj.notes_markdown === "string" ? obj.notes_markdown.trim() : "";
  const keyTerms = Array.isArray(obj.key_terms)
    ? obj.key_terms
        .map((k): KeyTerm | null => {
          if (!isRecord(k)) return null;
          const term = typeof k.term === "string" ? k.term.trim() : "";
          const definition =
            typeof k.definition === "string" ? k.definition.trim() : "";
          return term ? { term, definition } : null;
        })
        .filter((k): k is KeyTerm => k !== null)
    : [];
  return { title, markdown, keyTerms, trust: coerceTrustEnvelope(obj) };
}

/** Assemble the persisted note body: the notes markdown + a Key Terms section. */
function buildNoteContent(markdown: string, keyTerms: KeyTerm[]): string {
  if (keyTerms.length === 0) return markdown;
  const terms = keyTerms
    .map((k) => `- **${k.term}** — ${k.definition}`)
    .join("\n");
  return `${markdown}\n\n## Key Terms\n\n${terms}\n`;
}

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const sectionTrust: (TrustEnvelope | null)[] = [];

  const baseTitle = source.title ?? "";
  let agentTitle = "";
  const proseBySection = new Map<number, { label: string; markdown: string }>();

  const covered = await segmentedGenerate<KeyTerm>({
    ctx,
    source,
    targetKind: "notes",
    options,
    mandateKey: NOTES_MANDATES.studyNotes,
    surfaceKey: "education-convert-notes",
    sourceFeature: "education-ingest",
    variables: (segment, plan) => ({
      source_content: segment.text,
      title:
        plan.segments.length > 1
          ? `${baseTitle || "Study material"} - section ${segment.index} of ${segment.total}: ${segment.label}`
          : baseTitle,
      focus: options?.focus ?? "",
    }),
    extract: (value, segment) => {
      const part = coerceNotes(value);
      if (!agentTitle && part.title) agentTitle = part.title;
      if (part.markdown) {
        proseBySection.set(segment.index, {
          label: segment.label || part.title || `Part ${segment.index}`,
          markdown: part.markdown,
        });
        sectionTrust.push(part.trust);
      }
      // Key terms ride as the de-duplicated stream (the same term defined in two
      // sections is one entry in the glossary); the prose is collected above and
      // re-assembled in document order.
      return part.keyTerms;
    },
    identity: (term) => looseKey(term.term),
    timeoutMs: 120_000,
  });

  const keyTerms = covered.items;
  const ordered = [...proseBySection.entries()].sort((a, b) => a[0] - b[0]);
  // A multi-section note keeps the agent's own headings inside each section and
  // adds the section heading above them, so the note reads as one document.
  const markdown = covered.plan.singlePass
    ? (ordered[0]?.[1].markdown ?? "")
    : ordered
        .map(([, part]) => `## ${part.label}\n\n${part.markdown}`)
        .join("\n\n");

  if (!markdown) {
    throw new Error("The notes generator returned no usable notes");
  }
  const trust = mergeTrustEnvelopes(sectionTrust);
  const finalTitle = covered.plan.singlePass
    ? agentTitle || source.title || "Study notes"
    : source.title || agentTitle || "Study notes";
  const content = buildNoteContent(markdown, keyTerms);

  const note = await NotesAPI.create({
    label: finalTitle,
    content,
    folder_name: STUDY_NOTES_FOLDER,
    organization_id: ctx.orgId ?? null,
  });

  const result: ConvertResult = {
    targetKind: "notes",
    artifactId: note.id,
    resourceType: "note",
    href: `/education/notes/${note.id}`,
    title: finalTitle,
    trust,
    detail: (() => {
      const d = keyTerms.length
        ? `${keyTerms.length} key term${keyTerms.length === 1 ? "" : "s"}`
        : "Notes";
      return covered.gapNote ? `${d} - ${covered.gapNote}` : d;
    })(),
  };

  // Lineage: link the note → its origin (ingest anchor file for the kit, or the
  // source entity — e.g. note→note, transcript→note — for a one-click convert).
  await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const notesGenerator: ConvertGenerator = {
  targetKind: "notes",
  label: "Study notes",
  available: true,
  capability: "education.notes_generate",
  run,
};
