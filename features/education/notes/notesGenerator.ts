// features/education/notes/notesGenerator.ts
//
// Converter generator: source text → a structured platform NOTE (workbench.notes
// via the canonical NotesAPI — never a forked note store). This is the `notes`
// TargetKind that P4 Smart Notes owns; registering it lights the "Study notes"
// target up on the kit picker (P9) and the one-click note-convert menu.
//
// A note is a real, first-class platform note (shareable, editable, RAG-indexable)
// — so a generated note lands right back in the Smart Notes surface where the
// student can keep working on it. Same lineage + TrustEnvelope contract as the
// summary/deck generators: link a `source` edge to the ingest anchor file and
// carry the trust envelope through unchanged.

import { NotesAPI } from "@/features/notes/service/notesApi";
import { associationsService } from "@/features/scopes/service/associationsService";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import type { TrustEnvelope } from "@/features/education/trust/types";
import { NOTES_AGENTS } from "./agents";
import { runAgentExtraction } from "@/features/education/convert/runAgentExtraction";
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

  const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
    agentId: NOTES_AGENTS.studyNotes,
    surfaceKey: "education-convert-notes",
    sourceFeature: "education-ingest",
    variables: {
      source_content: source.text,
      title: source.title ?? "",
      focus: options?.focus ?? "",
    },
    timeoutMs: 120_000,
    onRequestId: ctx.onRequestId,
  });

  const { title, markdown, keyTerms, trust } = coerceNotes(extracted.value);
  if (!markdown) {
    throw new Error("The notes generator returned no usable notes");
  }
  const finalTitle = title || source.title || "Study notes";
  const content = buildNoteContent(markdown, keyTerms);

  const note = await NotesAPI.create({
    label: finalTitle,
    content,
    folder_name: STUDY_NOTES_FOLDER,
    organization_id: ctx.orgId ?? null,
  });

  // Lineage: link the note → the ingest anchor file (kit provenance). Note↔note
  // and note↔source-entity edges (e.g. note→transcript, note→note) are added by
  // the P4 one-click convert UI, which knows the origin entity token.
  if (source.ref?.fileId) {
    const edge = await associationsService.add({
      sourceType: "note",
      sourceId: note.id,
      targetType: "file",
      targetId: source.ref.fileId,
      role: "source",
      orgId: ctx.orgId,
    });
    if (!edge.ok) console.error("[convert/notes] source edge failed:", edge);
  }

  return {
    targetKind: "notes",
    artifactId: note.id,
    resourceType: "note",
    href: `/education/notes/${note.id}`,
    title: finalTitle,
    trust,
    detail: keyTerms.length
      ? `${keyTerms.length} key term${keyTerms.length === 1 ? "" : "s"}`
      : "Notes",
  };
}

export const notesGenerator: ConvertGenerator = {
  targetKind: "notes",
  label: "Study notes",
  available: true,
  capability: "education.notes_generate",
  run,
};
