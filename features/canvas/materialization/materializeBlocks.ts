/**
 * materializeBlocks — THE any-surface materialization primitive (v1, idempotent).
 *
 * Generalization of the chat-only rewrite transaction: given ANY source
 * record's committed content blocks, this:
 *   1. plans the materialization (pure — planMaterialization),
 *   2. upserts each artifact into `canvas_items` (idempotent on the
 *      `(source_system, source_id, artifact_index)` natural key; chat sources
 *      go through the exact historical cx_canvas_upsert RPC),
 *   3. serializes each new artifact into its canonical id-bearing text form
 *      `<artifact type id version>body</artifact>` (vision R1), and
 *   4. persists the rewritten content back to the source via the caller's
 *      `persistRewrite` (chat: the owner-checked cx_message_set_content RPC).
 *
 * It returns the rewritten content so the caller can update its in-memory
 * state to match the DB (the three mutations that must agree: canvas_items
 * write, source-record write, store update).
 *
 * SAFETY (invariants carried over from materializeMessageArtifacts verbatim):
 *  - If ANY artifact fails to persist, the whole rewrite is skipped (we never
 *    rewrite a block to a dangling ref and lose its raw content).
 *    Successfully-persisted rows are harmless — the upsert is idempotent, so
 *    the reconciliation pass on next load retries the failures and only then
 *    rewrites. Nothing is ever lost; the worst case is a retry.
 *  - Materialize against REAL source ids only — a non-UUID id (client-temp,
 *    optimistic, "artifact_1") is skipped entirely; reconcile runs once the
 *    real server id exists.
 *  - Adapter (domain-record) + discovery-index writes are NON-BLOCKING: a
 *    failure there never aborts the artifact or the rewrite — the canvas row
 *    already persisted and the link backfills on a later pass.
 *  - When `persistRewrite` is omitted, artifacts persist but NO rewrite is
 *    attempted — the caller owns persisting the returned content (or has no
 *    rewritable body at all).
 *
 * This is NOT atomic across the canvas writes and the source write (the
 * browser can't open a multi-statement transaction). Idempotency + the
 * reconcile-on-load pass make that acceptable for v1.
 */

import type { CxContentBlock, CxTextContent } from "@/features/public-chat/types/cx-tables";
import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { getArtifactDef } from "@/features/canvas/artifact-types/artifact-type-registry";
import { getAdapter } from "@/features/canvas/artifact-types/persistence/artifact-adapters";
import { isMaterializedArtifactId } from "@/features/canvas/artifact-types/artifactId";
import {
  planMaterialization,
  isArtifactPending,
  type PlannedArtifact,
} from "./planMaterialization";
import { wrapArtifactText } from "./artifactWire";

/** Known source systems; open (string & {}) so new surfaces need no union edit. */
export type SourceSystem =
  | "cx_message"
  | "note"
  | "transcript"
  | "ctx_task"
  | (string & {});

export interface MaterializeSource {
  system: SourceSystem;
  /** REAL persisted record id (UUID) — never a client-temp/optimistic id. */
  id: string;
  /** Chat conversation, when the source lives in one. */
  conversationId?: string | null;
  /** Optional scope hints for future scope-stamping (unused by v1 writes). */
  scope?: {
    organizationId?: string | null;
    projectId?: string | null;
    taskId?: string | null;
  };
}

export type PersistRewrite = (
  rewritten: CxContentBlock[],
) => Promise<{ ok: boolean; error?: string }>;

export interface MaterializeBlocksParams {
  source: MaterializeSource;
  /** The committed content array (cx_message.content shape). */
  content: CxContentBlock[];
  /**
   * Writes the rewritten content back to the source record (all-or-nothing —
   * called once, only after EVERY artifact persisted). Omit for sources
   * without a rewritable body; the caller then owns the returned content.
   */
  persistRewrite?: PersistRewrite;
}

export interface MaterializeBlocksResult {
  materializedCount: number;
  /** The rewritten content to mirror into the caller's store, or null when unchanged/aborted. */
  rewrittenContent: CxContentBlock[] | null;
  errors: string[];
}

/**
 * A source id is REAL when it is a persisted UUID. Generalizes the historical
 * client-temp guard ("client-"/"temp-" prefixes): any non-UUID id is treated
 * as not-yet-persisted and skipped.
 */
export function isRealSourceId(id: string | null | undefined): boolean {
  return isMaterializedArtifactId(id);
}

export async function materializeBlocks(
  params: MaterializeBlocksParams,
): Promise<MaterializeBlocksResult> {
  const { source, content, persistRewrite } = params;

  // Never materialize against a temp/optimistic id — the upsert keys on
  // (source_system, source_id); a temp id would orphan the row. Reconcile
  // runs once the real server id exists.
  if (!source.id || !isRealSourceId(source.id)) {
    return { materializedCount: 0, rewrittenContent: null, errors: [] };
  }

  const plan = planMaterialization(content);
  if (!plan.hasChanges) {
    return { materializedCount: 0, rewrittenContent: null, errors: [] };
  }

  const errors: string[] = [];
  const idByIndex = new Map<number, { id: string; version: number }>();
  const isChat = source.system === "cx_message";

  for (const artifact of plan.artifacts) {
    const saved = await canvasArtifactService.upsertForSource({
      source,
      artifactIndex: artifact.artifactIndex,
      type: artifact.canvasType,
      title: artifact.title,
      content: artifact.content,
      structured: artifact.structured,
      metadata: artifact.metadata,
      conversationId: source.conversationId ?? null,
      sourceType: "model_direct",
    });
    if (saved) {
      idByIndex.set(artifact.artifactIndex, {
        id: saved.id,
        version: saved.version,
      });

      // Custom-system linkage: create + link the domain record (flashcards →
      // education.fc_*, html → html_pages, …). Idempotent (adapters dedupe on
      // the source natural key) so reconcile re-runs are safe.
      // NON-BLOCKING (D2): a domain-write failure must not abort the artifact or
      // the rewrite — the canvas_items row already persisted and the link
      // backfills on a later load. Generic types have no onMaterialize.
      const def = getArtifactDef(artifact.canvasType);
      const adapter = getAdapter(def?.adapter);
      if (adapter.onMaterialize) {
        try {
          const link = await adapter.onMaterialize({
            artifactId: saved.id,
            canvasType: artifact.canvasType,
            title: artifact.title,
            rawContent: artifact.content,
            structured: artifact.structured ?? null,
            source: { system: source.system, id: source.id },
            sourceMessageId: isChat ? source.id : undefined,
            conversationId: source.conversationId ?? null,
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

      // Discovery-index write: register a cx_artifact row pointing back to
      // this canvas_items row so materialized artifacts appear in the /artifacts
      // library. NON-BLOCKING — a failure here must never abort the rewrite.
      try {
        await canvasArtifactService.upsertDiscoveryIndex({
          canvasId: saved.id,
          canvasType: artifact.canvasType,
          title: artifact.title ?? null,
          source: { system: source.system, id: source.id },
          conversationId: source.conversationId ?? null,
        });
      } catch (err) {
        errors.push(
          `artifact #${artifact.artifactIndex} (${artifact.canvasType}) discovery-index write failed: ${String(err)}`,
        );
      }
    } else {
      errors.push(
        `artifact #${artifact.artifactIndex} (${artifact.canvasType}) failed to persist`,
      );
    }
  }

  // Partial (or total) failure → skip the rewrite entirely. The raw content
  // stays on the source record; reconcile retries. Never rewrite to a
  // dangling ref.
  if (idByIndex.size !== plan.artifacts.length) {
    return {
      materializedCount: idByIndex.size,
      rewrittenContent: null,
      errors: [
        ...errors,
        "partial artifact persistence — rewrite skipped, will retry on reload",
      ],
    };
  }

  // Assemble the canonical R1 content: each pending marker becomes its
  // id-bearing `<artifact>` tag, merged INLINE with surrounding prose into text
  // blocks (so the model reads one natural text run); non-text blocks flush the
  // run and pass through. This is the single stored form — UI renders by id,
  // model reads the text, archive is durable.
  const artifactsByIndex = new Map<number, PlannedArtifact>();
  for (const a of plan.artifacts) artifactsByIndex.set(a.artifactIndex, a);

  const rewritten: CxContentBlock[] = [];
  let run = "";
  const appendRun = (s: string) => {
    if (!s) return;
    run = run.length > 0 ? `${run}\n\n${s}` : s;
  };
  const flushRun = () => {
    if (run.length > 0) {
      rewritten.push({ type: "text", text: run } as CxTextContent);
      run = "";
    }
  };

  for (const b of plan.rewrittenBlocks) {
    if (isArtifactPending(b)) {
      const got = idByIndex.get(b.artifactIndex);
      const a = artifactsByIndex.get(b.artifactIndex);
      if (got && a) {
        appendRun(
          wrapArtifactText({
            canvasType: a.canvasType,
            id: got.id,
            version: got.version,
            title: a.title,
            body: a.content,
          }),
        );
      }
      continue;
    }
    if ((b as { type?: string }).type === "text") {
      appendRun((b as CxTextContent).text ?? "");
      continue;
    }
    flushRun();
    rewritten.push(b as CxContentBlock);
  }
  flushRun();

  // No rewriter → the caller owns persisting (or the source has no rewritable
  // body). Artifacts are persisted either way.
  if (!persistRewrite) {
    return {
      materializedCount: idByIndex.size,
      rewrittenContent: rewritten,
      errors,
    };
  }

  const res = await persistRewrite(rewritten);
  if (!res.ok) {
    // canvas_items rows persisted fine; only the source rewrite failed.
    // Leave the source raw — reconcile re-runs (upserts are idempotent) and
    // rewrites then. Loud, not silent.
    return {
      materializedCount: idByIndex.size,
      rewrittenContent: null,
      errors: [...errors, `source rewrite failed: ${res.error ?? "unknown error"}`],
    };
  }

  return {
    materializedCount: idByIndex.size,
    rewrittenContent: rewritten,
    errors,
  };
}
