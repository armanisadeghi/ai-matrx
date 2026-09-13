/**
 * Save-from-chat — extract REGISTERED `__kind` blocks from an assistant
 * message's text and persist them as `content_ir.kind_instance` rows through
 * THE ONE CLIENT STORE (`./store-kind-record.ts` — the same function the chat
 * block's record chrome and the Shape Studio's Test tab call), so every client
 * save writes the same metadata shape and the same `produced_by` provenance
 * edge the server store writes.
 *
 * Extraction reuses the artifact-materialization path's exact detection
 * (planMaterialization's Track-2B), never a bespoke re-parse:
 *   1. split with the production `splitContentIntoBlocksV2`
 *   2. envelope route: the splitter attached `metadata.__ir` and the parser
 *      RESOLVED the kind → `reconstructRegionValue` (zero-loss)
 *   3. parse fallback: a JSON code block whose root carries `__kind`
 * Gate: the kind must resolve in the warm `kindRegistry` (system + DB user
 * kinds) — unregistered `__kind` strings are skipped, honestly.
 *
 * HEAVY (splitter + parser) — lazy-import this module from the click handler
 * only (`./message-kind-gate.ts` holds the cheap hot-path menu gate).
 */

import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { readEnvelope } from "@ai-matrx/content-ir";
import { reconstructRegionValue } from "@ai-matrx/content-ir";
import { readObjectKind } from "@ai-matrx/content-ir";
import { kindRegistry } from "../registry/kind-registry";
import { type KindInstanceWriteResult } from "./instance-service";
import { storeKindRecord } from "./store-kind-record";
import { kindTitleKeyFromMetadata } from "./instance-title";
import { supabase } from "@/utils/supabase/client";

export interface ExtractedKindBlock {
  kind: string;
  /** The envelope's root value (zero-loss reconstruction) or the parsed root. */
  value: Record<string, unknown>;
  /** The envelope's own fingerprint, when this block carried one. */
  fingerprint: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * All REGISTERED kind blocks in the text, in document order. Warms the kind
 * registry first (the LIGHT catalog — membership, not schemas) so DB user
 * kinds resolve via `isKnownKind`. Unregistered kinds are skipped.
 */
export async function extractRegisteredKindBlocks(
  text: string,
): Promise<ExtractedKindBlock[]> {
  await kindRegistry.ensureWarm();
  const out: ExtractedKindBlock[] = [];
  for (const sb of splitContentIntoBlocksV2(text)) {
    // Envelope route (the splitter ran the kind parser).
    // kindState gate: refuse "raw" and ONLY "raw" — "unverified" (no schema
    // ever available, never checked) is GOOD data per the 2026-08-28 outage
    // doctrine; gating on === "resolved" sent unverified instances to the
    // zero-validation parse fallback below (2026-08-31 kindState audit). A
    // known-FAILED payload never becomes a saved instance on either route.
    const envelope = readEnvelope(sb.metadata);
    if (envelope?.root.kind && envelope.root.kindState === "raw") continue;
    if (
      envelope &&
      envelope.root.kind &&
      envelope.root.status === "complete"
    ) {
      if (kindRegistry.isKnownKind(envelope.root.kind)) {
        out.push({
          kind: envelope.root.kind,
          value: reconstructRegionValue(envelope),
          fingerprint: envelope.fingerprint ?? null,
        });
      }
      continue;
    }
    // Parse fallback — JSON code blocks only (same rule as materialization).
    if (sb.type !== "code" || sb.language !== "json") continue;
    const raw = (sb.content ?? "").trim();
    if (!raw.startsWith("{") || !raw.endsWith("}")) continue;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw) as unknown;
    } catch {
      continue;
    }
    if (!isRecord(parsed)) continue;
    const kind = readObjectKind(parsed);
    if (!kind || !kindRegistry.isKnownKind(kind)) continue;
    // A parse-fallback block has no envelope, so it has no fingerprint. The
    // key is omitted rather than invented (THE ONE CLIENT STORE's rule).
    out.push({ kind, value: parsed, fingerprint: null });
  }
  return out;
}

export interface SavedMessageInstance extends KindInstanceWriteResult {
  kind: string;
  label: string;
  /** Present when the row landed but its provenance edge did not. */
  provenanceWarning: string | null;
}

/**
 * Persist every registered kind block found in `text` as an instance (shared
 * insert path — kind_definition resolved live for id/version). Throws when no
 * registered block is found or on any DB failure; the caller surfaces it.
 */
export async function saveKindInstancesFromMessage(args: {
  text: string;
  organizationId: string | null;
  /** `chat.conversation.id` — the HOME the saved records are filed under. */
  conversationId?: string | null;
  /** `chat.message.id` — the provenance anchor and the `produced_by` edge. */
  messageId?: string | null;
}): Promise<SavedMessageInstance[]> {
  const blocks = await extractRegisteredKindBlocks(args.text);
  if (blocks.length === 0) {
    throw new Error(
      "No registered shape block found in this message — the __kind marker did not resolve to a known kind.",
    );
  }

  const slugs = [...new Set(blocks.map((b) => b.kind))];
  const { data: defs, error } = await supabase
    .schema("content_ir")
    .from("kind_definition")
    .select("id,kind,label,version,metadata")
    .in("kind", slugs)
    .is("deleted_at", null);
  if (error) {
    throw new Error(`Failed to resolve kind definitions: ${error.message}`);
  }
  const bySlug = new Map((defs ?? []).map((d) => [d.kind, d]));

  const saved: SavedMessageInstance[] = [];
  for (const block of blocks) {
    const def = bySlug.get(block.kind);
    if (!def) {
      // Registry-visible but not RLS-readable as a row — skip honestly.
      continue;
    }
    const result = await storeKindRecord({
      kindDefinitionId: def.id,
      kindVersion: def.version,
      value: block.value,
      organizationId: args.organizationId,
      titleKey: kindTitleKeyFromMetadata(def.metadata),
      provenance: {
        conversationId: args.conversationId ?? null,
        messageId: args.messageId ?? null,
        fingerprint: block.fingerprint,
      },
    });
    saved.push({
      ...result,
      kind: def.kind,
      label: def.label,
      provenanceWarning: result.provenanceWarning,
    });
  }
  if (saved.length === 0) {
    throw new Error(
      "The shape blocks in this message resolved in the registry but their kind definitions were not readable — nothing was saved.",
    );
  }
  return saved;
}
