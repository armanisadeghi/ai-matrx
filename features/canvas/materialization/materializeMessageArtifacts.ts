/**
 * materializeMessageArtifacts — the rewrite transaction (v1, idempotent).
 *
 * Given a committed assistant message's content, this:
 *   1. plans the materialization (pure),
 *   2. upserts each artifact into `canvas_items` (cx_canvas_upsert — idempotent
 *      on the `(source_message_id, artifact_index)` natural key),
 *   3. fills the `artifact_id`/`version` into the rewritten content's
 *      `artifact_ref` blocks, and
 *   4. persists the rewritten content back to `cx_message` (owner-checked RPC),
 *      archiving the original raw content into `content_history`.
 *
 * It returns the rewritten content so the caller can update the in-memory
 * messages slice to match the DB (the three mutations that must agree:
 * canvas_items write, cx_message write, Redux update).
 *
 * SAFETY: if ANY artifact fails to persist, the whole message rewrite is
 * skipped (we never rewrite a block to a dangling ref and lose its raw
 * content). Successfully-persisted rows are harmless — the upsert is
 * idempotent, so the reconciliation pass on next load retries the failures
 * and only then rewrites. Nothing is ever lost; the worst case is a retry.
 *
 * This is NOT atomic across the canvas writes and the message write (the
 * browser can't open a multi-statement transaction). Idempotency + the
 * reconcile-on-load pass make that acceptable for v1; the atomic
 * `cx_artifact_materialize` RPC is the planned hardening.
 */

import { supabase } from "@/utils/supabase/client";
import type { Json } from "@/types/database.types";
import type {
  CxContentBlock,
  CxArtifactRefContent,
} from "@/features/public-chat/types/cx-tables";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { getAdapter } from "@/features/canvas/artifact-types/persistence/artifact-adapters";
import { planMaterialization } from "./planMaterialization";

export interface MaterializeParams {
  /** REAL cx_message.id (never a client-temp id). */
  messageId: string;
  conversationId: string;
  /** The committed assistant content array (cx_message.content shape). */
  content: CxContentBlock[];
}

export interface MaterializeResult {
  materializedCount: number;
  /** The rewritten content to mirror into Redux, or null when unchanged/aborted. */
  rewrittenContent: CxContentBlock[] | null;
  errors: string[];
}

function isClientTempId(id: string): boolean {
  return id.startsWith("client-") || id.startsWith("temp-");
}

export async function materializeMessageArtifacts(
  params: MaterializeParams,
): Promise<MaterializeResult> {
  const { messageId, conversationId, content } = params;

  // Never materialize against an optimistic/temp id — cx_canvas_upsert keys on
  // source_message_id; a temp id would orphan the row. Reconcile-on-load runs
  // once the real server id exists.
  if (!messageId || isClientTempId(messageId)) {
    return { materializedCount: 0, rewrittenContent: null, errors: [] };
  }

  const plan = planMaterialization(content);
  if (!plan.hasChanges) {
    return { materializedCount: 0, rewrittenContent: null, errors: [] };
  }

  const errors: string[] = [];
  const idByIndex = new Map<number, { id: string; version: number }>();

  for (const artifact of plan.artifacts) {
    const saved = await canvasArtifactService.upsert({
      messageId,
      artifactIndex: artifact.artifactIndex,
      type: artifact.canvasType,
      title: artifact.title,
      content: artifact.content,
      metadata: artifact.metadata,
      conversationId,
      sourceType: "model_direct",
    });
    if (saved) {
      idByIndex.set(artifact.artifactIndex, {
        id: saved.id,
        version: saved.version,
      });

      // Custom-system linkage: create + link the domain record (flashcards →
      // user_flashcard_sets, tasks → ctx_tasks, …). Idempotent (adapters dedupe
      // on source_message_id / natural key) so reconcile re-runs are safe.
      // NON-BLOCKING (D2): a domain-write failure must not abort the artifact or
      // the message rewrite — the canvas_items row already persisted and the
      // link backfills on a later load. Generic types have no onMaterialize.
      const def = getArtifactDef(artifact.canvasType);
      const adapter = getAdapter(def?.adapter);
      if (adapter.onMaterialize) {
        try {
          const link = await adapter.onMaterialize({
            artifactId: saved.id,
            canvasType: artifact.canvasType,
            title: artifact.title,
            rawContent: artifact.content,
            sourceMessageId: messageId,
            conversationId,
          });
          if (link && (link.externalSystem || link.externalId)) {
            await canvasArtifactService.setExternalLink(saved.id, link);
          }
        } catch (err) {
          errors.push(
            `artifact #${artifact.artifactIndex} (${artifact.canvasType}) domain link failed: ${String(err)}`,
          );
        }
      }
    } else {
      errors.push(
        `artifact #${artifact.artifactIndex} (${artifact.canvasType}) failed to persist`,
      );
    }
  }

  // Partial (or total) failure → skip the rewrite entirely. The raw content
  // stays in the message; reconcile-on-load retries. Never rewrite to a
  // dangling ref.
  if (idByIndex.size !== plan.artifacts.length) {
    return {
      materializedCount: idByIndex.size,
      rewrittenContent: null,
      errors: [
        ...errors,
        "partial artifact persistence — message rewrite skipped, will retry on reload",
      ],
    };
  }

  const rewritten: CxContentBlock[] = plan.rewrittenBlocks.map((b) => {
    if ((b as { type?: string }).type === "artifact_ref") {
      const ref = b as CxArtifactRefContent;
      const got = idByIndex.get(ref.artifact_index);
      if (got) {
        return { ...ref, artifact_id: got.id, version: got.version };
      }
    }
    return b;
  });

  // Status-preserving rewrite (NOT cx_message_edit, which marks the message
  // 'edited' — materialization is a system rewrite, not a user edit). Archives
  // the original into content_history so it's fully reversible.
  const { error } = await supabase.rpc("cx_message_set_content", {
    p_message_id: messageId,
    p_new_content: rewritten as unknown as Json,
  });

  if (error) {
    // canvas_items rows persisted fine; only the message rewrite failed.
    // Leave the message raw — reconcile-on-load re-runs (upserts are
    // idempotent) and rewrites then. Loud, not silent.
    return {
      materializedCount: idByIndex.size,
      rewrittenContent: null,
      errors: [...errors, `message rewrite failed: ${error.message}`],
    };
  }

  return {
    materializedCount: idByIndex.size,
    rewrittenContent: rewritten,
    errors,
  };
}
