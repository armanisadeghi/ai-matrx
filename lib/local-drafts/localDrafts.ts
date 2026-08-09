// lib/local-drafts/localDrafts.ts
//
// THE LAST-RESORT COPY of unsaved in-memory work, in this browser.
//
// Nothing here is a persistence path — every feature still owns its real save.
// This exists for the moment the app is about to LOSE in-memory edits and has
// no way to persist them: the tab is being hard-stopped (auth identity drift),
// the page is unloading, or a feature's saves have been failing so long that
// the buffer is the only copy that exists. Snapshot first, block second.
//
// Written because of D132 (2026-08-08): a domain-wide auth cookie rotated
// under an open /notes tab, ~14h of autosaves were RLS-filtered to 0 rows, and
// the "Account Changed" overlay then forced a reload that threw the in-memory
// buffer away. One note never reached the DB at all and is unrecoverable.
//
// Rules:
// - A draft is offered back ONLY to the same `ownerId` that wrote it.
// - Storage is best-effort: quota errors, private mode, and disabled storage
//   degrade to "no draft", never to a thrown error on a save path.
// - Drafts expire (7 days) and are capped, oldest-first, so this can never
//   grow into a shadow database.

import type { DraftSource, LocalDraft, LocalDraftInput } from "./types";

const STORAGE_KEY = "matrx.local-drafts.v1";

/** Drafts older than this are dropped on the next read/write. */
const DRAFT_TTL_MS = 7 * 24 * 60 * 60 * 1000;
/** A single draft larger than this is stored truncated (with a marker). */
const MAX_DRAFT_CHARS = 400_000;
/** Total budget across all drafts; the oldest are dropped to fit. */
const MAX_TOTAL_CHARS = 1_500_000;

const TRUNCATION_MARKER =
  "\n\n[… truncated by the local draft store — the note was too large to snapshot in full]";

// ── Sources ────────────────────────────────────────────────────────────────

const sources = new Map<string, DraftSource>();
let unloadListenerAttached = false;

/**
 * Register a collector for one feature's unsaved work. Re-registering the same
 * id replaces the previous collector (remounts are safe); the returned
 * unregister only removes the entry if it is still the one it installed.
 */
export function registerDraftSource(id: string, collect: DraftSource): () => void {
  sources.set(id, collect);
  attachUnloadListener();
  return () => {
    if (sources.get(id) === collect) sources.delete(id);
  };
}

function attachUnloadListener(): void {
  if (unloadListenerAttached || typeof window === "undefined") return;
  unloadListenerAttached = true;
  // `pagehide` fires in cases `beforeunload` does not (bfcache, mobile Safari).
  window.addEventListener("pagehide", () => {
    captureDrafts("unload");
  });
}

// ── Capture ────────────────────────────────────────────────────────────────

/**
 * Walk every registered source and persist what they hand back.
 * Returns the drafts written (empty when nothing is unsaved).
 *
 * Call this BEFORE anything that discards in-memory state — a forced reload,
 * a blocking overlay, a hard sign-out.
 */
export function captureDrafts(reason: string): LocalDraft[] {
  if (typeof window === "undefined") return [];

  const collected: LocalDraftInput[] = [];
  for (const [id, collect] of sources) {
    try {
      collected.push(...collect());
    } catch (err) {
      console.error("[LocalDrafts] draft source failed:", id, err);
    }
  }
  if (collected.length === 0) return [];

  const now = Date.now();
  const written: LocalDraft[] = collected.map((input) => ({
    ...input,
    content:
      input.content.length > MAX_DRAFT_CHARS
        ? input.content.slice(0, MAX_DRAFT_CHARS) + TRUNCATION_MARKER
        : input.content,
    key: draftKey(input.namespace, input.entityId),
    capturedAt: now,
    reason,
  }));

  const existing = readAll().filter(
    (d) => !written.some((w) => w.key === d.key),
  );
  writeAll([...written, ...existing]);

  console.warn(
    `[LocalDrafts] snapshotted ${written.length} unsaved item(s) to this browser (reason: ${reason}).`,
    written.map((d) => `${d.key} (${d.content.length} chars)`),
  );
  return written;
}

// ── Read / discard ─────────────────────────────────────────────────────────

/** Every live draft in a namespace that belongs to `ownerId`, newest first. */
export function listDrafts(namespace: string, ownerId: string | null): LocalDraft[] {
  if (!ownerId) return [];
  return readAll()
    .filter((d) => d.namespace === namespace && d.ownerId === ownerId)
    .sort((a, b) => b.capturedAt - a.capturedAt);
}

/** The draft for one entity, if it belongs to `ownerId`. */
export function getDraft(
  namespace: string,
  entityId: string,
  ownerId: string | null,
): LocalDraft | null {
  if (!ownerId) return null;
  const key = draftKey(namespace, entityId);
  return (
    readAll().find((d) => d.key === key && d.ownerId === ownerId) ?? null
  );
}

/** Drop one draft (restored, discarded by the user, or its entity saved). */
export function discardDraft(namespace: string, entityId: string): void {
  const key = draftKey(namespace, entityId);
  const all = readAll();
  const next = all.filter((d) => d.key !== key);
  if (next.length !== all.length) writeAll(next);
}

// ── Storage ────────────────────────────────────────────────────────────────

function draftKey(namespace: string, entityId: string): string {
  return `${namespace}:${entityId}`;
}

function readAll(): LocalDraft[] {
  if (typeof window === "undefined") return [];
  let raw: string | null = null;
  try {
    raw = window.localStorage.getItem(STORAGE_KEY);
  } catch {
    return []; // storage disabled / private mode — no drafts, never a throw
  }
  if (!raw) return [];
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    const cutoff = Date.now() - DRAFT_TTL_MS;
    return parsed.filter(isLocalDraft).filter((d) => d.capturedAt >= cutoff);
  } catch {
    return [];
  }
}

function writeAll(drafts: LocalDraft[]): void {
  if (typeof window === "undefined") return;
  const cutoff = Date.now() - DRAFT_TTL_MS;
  const fresh = drafts
    .filter((d) => d.capturedAt >= cutoff)
    .sort((a, b) => b.capturedAt - a.capturedAt);

  // Newest-first budget: keep taking drafts until the char budget runs out.
  const kept: LocalDraft[] = [];
  let total = 0;
  for (const draft of fresh) {
    if (total + draft.content.length > MAX_TOTAL_CHARS && kept.length > 0) {
      console.warn(
        "[LocalDrafts] draft budget exhausted — dropping older draft",
        draft.key,
      );
      continue;
    }
    kept.push(draft);
    total += draft.content.length;
  }

  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(kept));
  } catch (err) {
    // Quota exceeded: retry with only the newest draft before giving up —
    // one recovered note beats zero.
    console.error("[LocalDrafts] failed to persist drafts:", err);
    if (kept.length > 1) {
      try {
        window.localStorage.setItem(STORAGE_KEY, JSON.stringify([kept[0]]));
      } catch {
        /* storage is unusable — nothing more we can do here */
      }
    }
  }
}

function isLocalDraft(value: unknown): value is LocalDraft {
  if (typeof value !== "object" || value === null) return false;
  const d = value as Record<string, unknown>;
  return (
    typeof d.key === "string" &&
    typeof d.namespace === "string" &&
    typeof d.entityId === "string" &&
    typeof d.content === "string" &&
    typeof d.capturedAt === "number"
  );
}
