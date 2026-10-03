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
 * Which records it acts on is decided by the SAME detector the live commit
 * uses (`holdsMaterializableContent` → `planMaterialization`), capped per load
 * to avoid write storms, and scanned OFF the critical path in time slices of
 * `RECONCILE_SLICE_MS`.
 *
 * `reconcileSourceBlocks` is the ANY-SURFACE core (the pre-filter + cap were
 * always source-agnostic); `reconcileMessagesArtifacts` is the chat
 * delegation its historical callers keep using.
 */

import type { CxContentBlock } from "@ai-matrx/chat/public-chat/types/cx-tables";
import { planMaterialization } from "./planMaterialization";
import {
  materializeBlocks,
  type MaterializeSource,
  type PersistRewrite,
} from "./materializeBlocks";
import { cxMessageContentRewriter } from "./materializeMessageArtifacts";

/**
 * Whether a record holds anything the safety net must act on: a NEW
 * materializable block, or an `<artifact id=uuid>` whose row it must verify.
 *
 * 🚨 Decided by THE detector the end-of-stream commit uses
 * (`planMaterialization` → the content-ir block splitter), never by a list of
 * marker strings. The old pre-filter matched fence/tag/JSON-key markers, so a
 * block the splitter detects WITHOUT a marker — a bare `├──` tree, a bare GFM
 * table — was skipped here and never reached canvas_items when the tab closed
 * before the end-of-stream commit (conversation a0355e5d, 2026-10-02).
 */
export function holdsMaterializableContent(content: unknown): boolean {
  if (!Array.isArray(content) || content.length === 0) return false;
  const plan = planMaterialization(content as CxContentBlock[]);
  return plan.hasChanges || plan.materializedArtifactIds.length > 0;
}

// ── Main-thread budget ───────────────────────────────────────────────────────

/**
 * The scan runs the block splitter on EVERY record, so on a long conversation
 * it is real work: measured 2026-10-02 on clone conversations, 14–38 ms for
 * 835–874 assistant messages in Node (more in a dev browser), all of it ONE
 * synchronous block inside the conversation-load thunk. It now never runs in
 * the caller's task and yields to the main thread whenever a slice exceeds
 * this budget, so no load ever carries a reconcile long task.
 */
export const RECONCILE_SLICE_MS = 8;

type SchedulerWithYield = { yield?: () => Promise<void> };

/** Give the main thread back: `scheduler.yield()` where it exists, else a macrotask. */
function yieldToMain(): Promise<void> {
  const scheduler = (globalThis as { scheduler?: SchedulerWithYield }).scheduler;
  if (typeof scheduler?.yield === "function") return scheduler.yield();
  return new Promise((resolve) => setTimeout(resolve, 0));
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

  // Never scan inside the caller's task (the load thunk is on the critical path).
  await yieldToMain();
  let sliceStart = performance.now();

  for (const item of items) {
    if (processed >= max) break;
    if (performance.now() - sliceStart >= RECONCILE_SLICE_MS) {
      await yieldToMain();
      sliceStart = performance.now();
    }
    if (!holdsMaterializableContent(item.content)) continue;

    processed++;
    try {
      const res = await materializeBlocks({
        source: item.source,
        content: item.content as CxContentBlock[],
        persistRewrite: item.persistRewrite,
      });
      // An unpersisted rewrite (artifacts persisted, source write failed) is
      // still what the screen should show — every id in it exists — and the
      // next reconcile retries the source write. The error below names it.
      const mirror = res.rewrittenContent ?? res.unpersistedRewrite;
      if (mirror) {
        results.push({
          source: item.source,
          rewrittenContent: mirror,
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
    // materializeBlocks awaited I/O — the thread was given back; a new slice starts.
    sliceStart = performance.now();
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
