/**
 * reconcileArtifacts — the on-load safety net for materialization.
 *
 * The stream-end commit materializes artifacts live, but a stream can die, a
 * tab can close, and historical messages predate the pipeline entirely. On
 * conversation load we scan the hydrated assistant messages and materialize any
 * that still carry RAW artifact markup (a `<artifact>` without a real canvas
 * UUID, or a standalone fence). Already-materialized `<artifact id=uuid>` text
 * is recognized and skipped by planMaterialization (vision R3), so re-running is
 * idempotent — and the original is archived in `content_history`, so it's
 * fully recoverable.
 *
 * A cheap string pre-filter avoids running the block splitter over every
 * message on every load; only messages that look like they contain a
 * materializable block are considered, capped per load to avoid write storms.
 */

import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { ARTIFACT_TYPE_DEFS } from "../artifact-types/artifact-type-registry";
import { materializeMessageArtifacts } from "./materializeMessageArtifacts";

/**
 * Cheap markers that indicate a message MIGHT contain a materializable block.
 * Intentionally inclusive — the authoritative decision is planMaterialization;
 * this only avoids splitting clearly-plain messages.
 *
 * DERIVED FROM THE REGISTRY so a new materializable type is covered automatically
 * (the old hand-maintained list silently missed fence-style types like ```tasks,
 * so they never reconciled). For every type alias we match both the fence form
 * (```alias) and the XML-tag form (<alias). JSON-object types (quiz, diagram,
 * comparison, math_problem, decision_tree, presentation) are matched by their
 * JSON root key too, since those carry no fence/tag.
 */
const MATERIALIZABLE_MARKERS: string[] = (() => {
  const markers = new Set<string>(["<artifact", "```mmd"]);
  for (const def of ARTIFACT_TYPE_DEFS) {
    for (const alias of [...def.standaloneAliases, ...def.aliases]) {
      markers.add("```" + alias);
      markers.add("<" + alias);
    }
  }
  // JSON-root-key markers (no fence/tag) for object-payload types.
  for (const k of [
    "quiz_title",
    '"decision_tree"',
    '"diagram"',
    '"comparison"',
    "comparison_table",
    "math_problem",
    '"presentation"',
    "progress_tracker",
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
 * Pure-ish: it performs DB I/O via materializeMessageArtifacts but never
 * touches Redux directly (keeps the redux layer the caller's concern).
 */
export async function reconcileMessagesArtifacts(
  messages: ReconcileInput[],
  opts?: { max?: number },
): Promise<ReconcileResult[]> {
  const max = opts?.max ?? 25;
  const results: ReconcileResult[] = [];
  let processed = 0;

  for (const m of messages) {
    if (processed >= max) break;
    if (!mightContainMaterializable(m.content)) continue;
    if (!Array.isArray(m.content)) continue;

    processed++;
    try {
      const res = await materializeMessageArtifacts({
        messageId: m.id,
        conversationId: m.conversationId,
        content: m.content as CxContentBlock[],
      });
      if (res.rewrittenContent) {
        results.push({
          messageId: m.id,
          rewrittenContent: res.rewrittenContent,
        });
      }
      if (res.errors.length > 0) {
        console.error(
          `[reconcileArtifacts] issues materializing ${m.id}:`,
          res.errors,
        );
      }
    } catch (err) {
      console.error(`[reconcileArtifacts] threw for ${m.id}:`, err);
    }
  }

  return results;
}
