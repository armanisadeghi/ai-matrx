/**
 * reconcileArtifacts — the on-load safety net for materialization.
 *
 * The stream-end commit materializes artifacts live, but a stream can die, a
 * tab can close, and historical messages predate the pipeline entirely. On
 * conversation load we scan the hydrated assistant messages and materialize any
 * that still carry RAW artifact markup (no artifact_ref yet). Because
 * materialization is idempotent on the `(source_message_id, artifact_index)`
 * key and `cx_message_edit` archives the original into `content_history`, this
 * is safe to re-run and fully recoverable.
 *
 * A cheap string pre-filter avoids running the block splitter over every
 * message on every load; only messages that look like they contain a
 * materializable block are considered, capped per load to avoid write storms.
 */

import type { CxContentBlock } from "@/features/public-chat/types/cx-tables";
import { materializeMessageArtifacts } from "./materializeMessageArtifacts";

/**
 * Cheap markers that indicate a message MIGHT contain a materializable block.
 * Intentionally inclusive — the authoritative decision is planMaterialization;
 * this only avoids splitting clearly-plain messages.
 */
const MATERIALIZABLE_MARKERS = [
  "<flashcards",
  "<artifact",
  "quiz_title",
  "<timeline",
  "progress_tracker",
  "<troubleshooting",
  "<resources",
  "<research",
  "decision_tree",
  '"diagram"',
  '"comparison"',
  "comparison_table",
  "math_problem",
  "<presentation",
  "<cooking_recipe",
  "```mermaid",
  "```mmd",
];

export function mightContainMaterializable(content: unknown): boolean {
  if (!content) return false;
  const s = typeof content === "string" ? content : JSON.stringify(content);
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
