// features/education/convert/generators/deck.ts
//
// Converter generator: source text → a flashcard deck (fc_set + fc_card). Wraps
// the flashcards "from source" agent + fcService.createSetWithCards (the single
// deck writer) and links a set-level `source` lineage edge to the ingest anchor
// file so the kit results page can trace provenance.
//
// NOTE: the raw-JSON card coercion here intentionally mirrors
// features/flashcards/data/useGenerateCards.ts#coerceCard (that helper is not
// exported). If the flashcards feature exports it, collapse to that — do not let
// the two drift on card shape.

import { fcService } from "@/features/flashcards/data/fcService";
import type { NewCardInput } from "@/features/flashcards/data/types";
import { coerceTrustEnvelope } from "@/features/education/trust/types";
import { CONVERT_AGENTS } from "../agents";
import { runAgentExtraction } from "../runAgentExtraction";
import { recordSourceLineage } from "../recordSourceLineage";
import { mergeTrustEnvelopes } from "../trustMerge";
import type {
  ConvertContext,
  ConvertGenerator,
  ConvertRequest,
  ConvertResult,
} from "../types";

function isRecord(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/**
 * The from-source deck agent grounds + cites against `### Chunk <id>` markers —
 * it returns NO cards for an unmarked blob. Ingest gives us plain text, so we
 * synthesize chunk markers (paragraph-packed to ~1000 chars) before sending.
 *
 * NOTE: no page number is emitted. Ingest hands us a flat text blob with no
 * per-chunk page mapping, so any page we stamped would be a lie — and the agent
 * echoes it straight into the citation locator the trust layer renders. Better
 * an honest chunk id with no page than a false "Page 1" on every card.
 */
function chunkForGrounding(text: string): string {
  const paras = text
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);
  const chunks: string[] = [];
  let buf = "";
  for (const p of paras) {
    if (buf && buf.length + p.length > 1000) {
      chunks.push(buf);
      buf = p;
    } else {
      buf = buf ? `${buf}\n\n${p}` : p;
    }
  }
  if (buf) chunks.push(buf);
  if (chunks.length === 0) chunks.push(text.trim());
  return chunks.map((c, i) => `### Chunk c${i + 1}\n${c}`).join("\n\n");
}

/** Coerce one raw agent card object → NewCardInput (drops unusable entries). */
function coerceCard(
  raw: unknown,
  docId: string,
  anchorFileId: string,
): NewCardInput | null {
  if (!isRecord(raw)) return null;
  const str = (k: string) =>
    typeof raw[k] === "string" ? (raw[k] as string).trim() : "";
  const front = str("front");
  const back = str("back");
  if (!front && !back) return null;
  const optional = (k: string): string | null => {
    const v = raw[k];
    return typeof v === "string" && v.trim() ? v.trim() : null;
  };

  const rawSource = raw.source;
  // Per-card lineage points at the ingest anchor file (fcService writes a
  // card→file `source` edge when file_id is set), keeping the agent-echoed
  // chunk/page for the citation locator.
  const source = anchorFileId
    ? {
        file_id: anchorFileId,
        processed_document_id:
          isRecord(rawSource) &&
          typeof rawSource.processed_document_id === "string"
            ? rawSource.processed_document_id
            : docId || undefined,
        chunk_id:
          isRecord(rawSource) && typeof rawSource.chunk_id === "string"
            ? rawSource.chunk_id
            : undefined,
        page:
          isRecord(rawSource) && typeof rawSource.page === "number"
            ? rawSource.page
            : undefined,
      }
    : undefined;

  return {
    front,
    back,
    card_kind: optional("card_kind") ?? "basic",
    difficulty: optional("difficulty"),
    topic: optional("topic"),
    source,
    trust: coerceTrustEnvelope(raw) ?? undefined,
  };
}

function coerceCards(
  value: unknown,
  docId: string,
  anchorFileId: string,
): {
  title: string;
  cards: NewCardInput[];
} {
  const obj = isRecord(value) ? value : {};
  const title =
    (typeof obj.title === "string" && obj.title.trim()) ||
    (typeof obj.set_title === "string" && obj.set_title.trim()) ||
    "";
  const rawCards = Array.isArray(obj.cards)
    ? obj.cards
    : Array.isArray(obj.flashcards)
      ? obj.flashcards
      : Array.isArray(value)
        ? (value as unknown[])
        : [];
  const cards = rawCards
    .map((c) => coerceCard(c, docId, anchorFileId))
    .filter((c): c is NewCardInput => c !== null);
  return { title, cards };
}

async function run(
  request: ConvertRequest,
  ctx: ConvertContext,
): Promise<ConvertResult> {
  const { source, options } = request;
  const anchorFileId = source.ref?.fileId ?? "";
  // The agent grounds cards against these markers + echoes document_id back.
  const docId = (source.ref?.processedDocumentId ?? anchorFileId) || "ingest";

  const extracted = await runAgentExtraction(ctx.dispatch, ctx.store, {
    agentId: CONVERT_AGENTS.deckFromSource,
    surfaceKey: "education-ingest-deck",
    sourceFeature: "education-ingest",
    variables: {
      source_content: chunkForGrounding(source.text),
      title: source.title ?? "Study material",
      count: String(options?.count ?? 15),
      difficulty: options?.difficulty ?? "Mixed",
      focus: options?.focus ?? "",
    },
    onRequestId: ctx.onRequestId,
  });

  const { title, cards } = coerceCards(extracted.value, docId, anchorFileId);
  if (cards.length === 0) {
    throw new Error("The deck generator returned no usable cards");
  }

  const setName = title || source.title || "Study deck";
  const created = await fcService.createSetWithCards(
    {
      name: setName,
      description: source.title ? `Generated from ${source.title}` : null,
      orgId: ctx.orgId,
    },
    cards,
  );
  if (created.error || !created.data) {
    throw new Error(
      typeof created.error === "string"
        ? created.error
        : "Failed to save the generated deck",
    );
  }
  const setId = created.data.set.id;

  const trust = mergeTrustEnvelopes(cards.map((c) => c.trust));
  const result: ConvertResult = {
    targetKind: "deck",
    artifactId: setId,
    resourceType: "fc_set",
    href: `/education/flashcards/${setId}`,
    title: setName,
    trust,
    detail: `${cards.length} card${cards.length === 1 ? "" : "s"}`,
  };

  // Set-level lineage edge → the origin (ingest anchor file OR entity source).
  await recordSourceLineage(result, source, ctx.orgId);

  return result;
}

export const deckGenerator: ConvertGenerator = {
  targetKind: "deck",
  label: "Flashcard deck",
  available: true,
  capability: "education.generate_cards",
  run,
};
