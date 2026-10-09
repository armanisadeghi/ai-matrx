// features/education/onboard/kitSources.ts
//
// The study kit's material comes from the ONE Source payload (the unified
// Source input → `SourceSet` → `POST /sources/resolve`), exactly like the
// flashcard deck. These pure steps turn the server's answer into:
//
//   - the kit's text: every Source's grounded text (`### Chunk <id>` blocks,
//     never re-chunked), joined in the order the person picked them — the
//     same join the deck generator uses (`generateDeckFromSources`);
//   - the kit's anchor: a kit IS its anchor file (`kitHref("file", id)`), so
//     ONE Source with a stored file behind it anchors on that file and a second
//     run over it merges into the same kit. Anything else (several Sources, a
//     web page, pasted text) is kept as one `.md` file by the ingest step.
//
// Plain functions, no React — tested in `__tests__/kit-sources.test.ts`.

import type { ResolvedSource, ResolvedSourceSet } from "@ai-matrx/agents/sources";
import type { SourceCardModel } from "@ai-matrx/agents/sources/runtime";
import type { KitSourceRef } from "@/features/education/convert/types";

export interface KitMaterial {
  text: string;
  title: string;
  /** Any Source the server cut to its limit. */
  truncated: boolean;
  sourceCount: number;
  /** Distinct pages across every Source, when the Sources have pages. */
  pages?: number;
  sources: ResolvedSource[];
}

const EXTENSION_RE = /\.(pdf|docx?|pptx?|txt|md|csv|xlsx?|rtf|html?|json)$/i;

function plainLabel(label: string): string {
  return label.trim().replace(EXTENSION_RE, "") || "Study kit";
}

export function kitMaterialFromSources(resolved: ResolvedSourceSet): KitMaterial {
  const sources = resolved.sources.filter((s) => s.text.trim().length > 0);
  if (sources.length === 0) {
    const lookedUp = resolved.sources.filter((s) => s.ref.delivery === "context");
    if (lookedUp.length > 0) {
      throw new Error(
        `${lookedUp.map((s) => s.label).join(", ")} ${lookedUp.length === 1 ? "is" : "are"} set to "let the AI look it up". A study kit is built from the text itself — open the Source and choose "Include the text".`,
      );
    }
    throw new Error("None of the Sources had any text to study. Check each Source, or add another.");
  }
  const first = plainLabel(sources[0].label);
  const pages = new Set<string>();
  for (const s of sources) {
    for (const seg of s.segments) {
      if (seg.page !== undefined) pages.add(`${s.ref.resource_id}:${seg.page}`);
    }
  }
  return {
    text: sources.map((s) => s.text).join("\n\n"),
    // Never "X and N more": the namer titles a kit of several from the material;
    // this is only the floor under it.
    title: first,
    truncated: sources.some((s) => s.truncated),
    sourceCount: sources.length,
    pages: pages.size > 0 ? pages.size : undefined,
    sources,
  };
}

/** The file the kit anchors on: exactly one Source with a stored file behind it. */
export function kitFileAnchor(
  resolved: ResolvedSourceSet,
): { fileId: string; processedDocumentId?: string } | null {
  const sources = resolved.sources.filter((s) => s.text.trim().length > 0);
  if (sources.length !== 1) return null;
  const only = sources[0];
  const type = only.ref.resource_type;
  const fileId =
    only.file_id ?? (type === "file" || type === "cld_file" ? only.ref.resource_id : undefined);
  if (!fileId) return null;
  const processedDocumentId =
    only.processed_document_id ?? (type === "processed_document" ? only.ref.resource_id : undefined);
  return processedDocumentId ? { fileId, processedDocumentId } : { fileId };
}

/**
 * The stored file behind the picked Sources, read from the cards alone (no
 * server call): one settled card that is a file, or a Source read from one.
 */
export function pickedFileAnchor(cards: readonly SourceCardModel[]): string | null {
  if (cards.length !== 1) return null;
  const only = cards[0];
  if (only.status !== "ready" || !only.draft.ref) return null;
  const type = only.draft.ref.resource_type;
  if (type === "file" || type === "cld_file") return only.draft.ref.resource_id;
  return only.draft.fileId ?? null;
}

/**
 * Each Source the kit's text was read from, as the kit holds it: the
 * Source's own record (never a merged copy), plus the file / processed
 * document behind it so every citation opens the right one.
 */
const CHUNK_ID_RE = /^### Chunk (\S+)(?: \(page \d+\))?[ \t]*$/gm;

function chunkIdsOf(source: ResolvedSource): string[] {
  const ids = new Set<string>(source.segments.map((seg) => seg.id));
  for (const m of source.text.matchAll(CHUNK_ID_RE)) ids.add(m[1]);
  return [...ids];
}

export function kitSourceRefs(resolved: ResolvedSourceSet): KitSourceRef[] {
  return resolved.sources
    .filter((s) => s.text.trim().length > 0)
    .map((s) => {
      const type = s.ref.resource_type === "cld_file" ? "file" : s.ref.resource_type;
      const fileId = s.file_id ?? (type === "file" ? s.ref.resource_id : undefined);
      const processedDocumentId =
        s.processed_document_id ?? (type === "processed_document" ? s.ref.resource_id : undefined);
      return {
        type,
        id: s.ref.resource_id,
        title: s.label.trim() || "Source",
        ...(fileId ? { fileId } : {}),
        ...(processedDocumentId ? { processedDocumentId } : {}),
        chunkIds: chunkIdsOf(s),
      };
    });
}
