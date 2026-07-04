/**
 * reconcileArtifacts — the on-load safety net for materialization.
 *
 * The live commit materializes artifacts as they land, but a stream can die, a
 * tab can close, and historical records predate the pipeline entirely. On
 * load we scan the hydrated records and materialize any that still carry RAW
 * artifact markup (a `<artifact>` without a real canvas UUID, or a standalone
 * fence). Already-materialized `<artifact id=uuid>` text is recognized and
 * skipped by planMaterialization (vision R3), so re-running is idempotent —
 * and for chat the original is archived in `content_history`, so it's fully
 * recoverable.
 *
 * A cheap string pre-filter avoids running the block splitter over every
 * record on every load; only records that look like they contain a
 * materializable block are considered, capped per load to avoid write storms.
 *
 * `reconcileSourceBlocks` is the ANY-SURFACE core (the pre-filter + cap were
 * always source-agnostic); `reconcileMessagesArtifacts` is the chat
 * delegation its historical callers keep using.
 */

import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { ARTIFACT_TYPE_DEFS } from "../artifact-types/artifact-type-registry";
import {
  materializeBlocks,
  type MaterializeSource,
  type PersistRewrite,
} from "./materializeBlocks";
import { cxMessageContentRewriter } from "./materializeMessageArtifacts";

/**
 * Cheap markers that indicate a record MIGHT contain a materializable block.
 * Intentionally inclusive — the authoritative decision is planMaterialization;
 * this only avoids splitting clearly-plain content.
 *
 * DERIVED FROM THE REGISTRY so a new materializable type is covered automatically
 * (the old hand-maintained list silently missed fence-style types like ```tasks,
 * so they never reconciled). For every type alias we match both the fence form
 * (```alias) and the XML-tag form (<alias). JSON-object types (quiz, diagram,
 * comparison, math_problem, decision_tree, presentation) are matched by their
 * JSON root key too, since those carry no fence/tag. Structured kind blocks
 * are matched by the `__kind` discriminator itself.
 */
const MATERIALIZABLE_MARKERS: string[] = (() => {
  const markers = new Set<string>(["<artifact", "```mmd"]);
  for (const def of ARTIFACT_TYPE_DEFS) {
    for (const alias of [...def.standaloneAliases, ...def.aliases]) {
      markers.add("```" + alias);
      markers.add("<" + alias);
    }
  }
  // JSON-root-key markers (no fence/tag) for object-payload types, plus the
  // kind discriminator key for structured (kind-IR) blocks.
  for (const k of [
    "quiz_title",
    '"decision_tree"',
    '"diagram"',
    '"comparison"',
    "comparison_table",
    "math_problem",
    '"presentation"',
    "progress_tracker",
    '"__kind"',
  ]) {
    markers.add(k);
  }
  return [...markers];
})();

/**
 * Build the search string from RAW block text — NOT JSON.stringify, which
 * escapes inner quotes (`\"comparison\"`) and would defeat quote-wrapped markers
 * like `'"comparison"'` / `'"diagram"'`, silently skipping JSON-object artifacts.
 */
function toSearchString(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((b) => {
        if (typeof b === "string") return b;
        if (b && typeof b === "object" && typeof (b as { text?: unknown }).text === "string") {
          return (b as { text: string }).text;
        }
        return JSON.stringify(b);
      })
      .join("\n");
  }
  return JSON.stringify(content);
}

export function mightContainMaterializable(content: unknown): boolean {
  if (!content) return false;
  const s = toSearchString(content);
  return MATERIALIZABLE_MARKERS.some((m) => s.includes(m));
}

// ── Any-surface core ─────────────────────────────────────────────────────────

export interface SourceReconcileInput {
  source: MaterializeSource;
  content: unknown;
  /** Source-record rewrite writer; omit when the caller owns persistence. */
  persistRewrite?: PersistRewrite;
}

export interface SourceReconcileResult {
  source: MaterializeSource;
  rewrittenContent: CxContentBlock[];
}

/**
 * Materialize any records that still carry raw artifact markup. Returns the
 * rewrites for the caller to mirror into its store. Pure-ish: it performs DB
 * I/O via materializeBlocks but never touches Redux directly (the store layer
 * stays the caller's concern).
 */
export async function reconcileSourceBlocks(
  items: SourceReconcileInput[],
  opts?: { max?: number },
): Promise<SourceReconcileResult[]> {
  const max = opts?.max ?? 25;
  const results: SourceReconcileResult[] = [];
  let processed = 0;

  for (const item of items) {
    if (processed >= max) break;
    if (!mightContainMaterializable(item.content)) continue;
    if (!Array.isArray(item.content)) continue;

    processed++;
    try {
      const res = await materializeBlocks({
        source: item.source,
        content: item.content as CxContentBlock[],
        persistRewrite: item.persistRewrite,
      });
      if (res.rewrittenContent) {
        results.push({
          source: item.source,
          rewrittenContent: res.rewrittenContent,
        });
      }
      if (res.errors.length > 0) {
        console.error(
          `[reconcileArtifacts] issues materializing ${item.source.system}:${item.source.id}:`,
          res.errors,
        );
      }
    } catch (err) {
      console.error(
        `[reconcileArtifacts] threw for ${item.source.system}:${item.source.id}:`,
        err,
      );
    }
  }

  return results;
}

// ── Chat delegation (historical callers) ────────────────────────────────────

export interface ReconcileInput {
  id: string;
  conversationId: string;
  content: unknown;
}

export interface ReconcileResult {
  messageId: string;
  rewrittenContent: CxContentBlock[];
}

/**
 * Materialize any assistant messages that still carry raw artifact markup.
 * Returns the rewrites for the caller to mirror into the messages slice.
 */
export async function reconcileMessagesArtifacts(
  messages: ReconcileInput[],
  opts?: { max?: number },
): Promise<ReconcileResult[]> {
  const results = await reconcileSourceBlocks(
    messages.map((m) => ({
      source: {
        system: "cx_message" as const,
        id: m.id,
        conversationId: m.conversationId,
      },
      content: m.content,
      persistRewrite: cxMessageContentRewriter(m.id),
    })),
    opts,
  );
  return results.map((r) => ({
    messageId: r.source.id,
    rewrittenContent: r.rewrittenContent,
  }));
}
