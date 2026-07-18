/**
 * Save-from-chat — extract REGISTERED `__kind` blocks from an assistant
 * message's text and persist them as `content_ir.kind_instance` rows through
 * the shared studio insert path (`saveKindInstance` — ONE write contract for
 * the Test tab and chat).
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
import { readEnvelope } from "../core/envelope-read";
import { reconstructRegionValue } from "../core/envelope-value";
import { readObjectKind } from "../core/kind-schema.types";
import { kindRegistry } from "../registry/kind-registry";
import {
  saveKindInstance,
  type KindInstanceWriteResult,
} from "./instance-service";
import { kindTitleKeyFromMetadata } from "./instance-title";
import { supabase } from "@/utils/supabase/client";

export interface ExtractedKindBlock {
  kind: string;
  /** The envelope's root value (zero-loss reconstruction) or the parsed root. */
  value: Record<string, unknown>;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * All REGISTERED kind blocks in the text, in document order. Warms the kind
 * registry first so DB user kinds resolve. Unregistered kinds are skipped.
 */
export async function extractRegisteredKindBlocks(
  text: string,
): Promise<ExtractedKindBlock[]> {
  await kindRegistry.ensureWarm();
  const out: ExtractedKindBlock[] = [];
  for (const sb of splitContentIntoBlocksV2(text)) {
    // Envelope route (the splitter ran the kind parser).
    const envelope = readEnvelope(sb.metadata);
    if (
      envelope &&
      envelope.root.kind &&
      envelope.root.kindState === "resolved" &&
      envelope.root.status === "complete"
    ) {
      if (kindRegistry.getDefinition(envelope.root.kind)) {
        out.push({
          kind: envelope.root.kind,
          value: reconstructRegionValue(envelope),
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
    if (!kind || !kindRegistry.getDefinition(kind)) continue;
    out.push({ kind, value: parsed });
  }
  return out;
}

export interface SavedMessageInstance extends KindInstanceWriteResult {
  kind: string;
  label: string;
}

/**
 * Persist every registered kind block found in `text` as an instance (shared
 * insert path — kind_definition resolved live for id/version). Throws when no
 * registered block is found or on any DB failure; the caller surfaces it.
 */
export async function saveKindInstancesFromMessage(args: {
  text: string;
  organizationId: string | null;
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
    const result = await saveKindInstance({
      kindDefinitionId: def.id,
      kindVersion: def.version,
      value: block.value,
      organizationId: args.organizationId,
      titleKey: kindTitleKeyFromMetadata(def.metadata),
    });
    saved.push({ ...result, kind: def.kind, label: def.label });
  }
  if (saved.length === 0) {
    throw new Error(
      "The shape blocks in this message resolved in the registry but their kind definitions were not readable — nothing was saved.",
    );
  }
  return saved;
}
