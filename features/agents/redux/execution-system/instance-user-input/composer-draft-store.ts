// features/agents/redux/execution-system/instance-user-input/composer-draft-store.ts
//
// ============================================================================
//  THE COMPOSER DRAFT SURVIVES THE TAB. THE STORAGE HALF.
// ============================================================================
//
// `input-draft-protection.ts` makes the composer untouchable by anything
// happening INSIDE the session. It could not do anything about the session
// ending: the slice is in-memory, so a reload took the draft with it. Measured
// live 2026-09-17 on a brand-new Rulebook — 198 characters typed into the
// interview composer, reload, field empty, nothing said (FOUND_DEFECTS,
// "A typed-but-unsent chat message does not survive a reload").
//
// This module is the durable half, and it is a PLATFORM primitive, not a
// Masterwork one: it is driven by one middleware over the conversation state
// every composer already writes, so /chat, the Scout interview room, the
// Conductor, agent run and every embedded agent conversation inherit it.
//
// SCOPE: `sessionStorage`, per browser tab, same as the dialog draft keeper in
// `lib/drafts/useTextDraft.ts` (whose TTL this reuses). A crash net, never a
// synced store: a draft is not a message and never reaches the server.
//
// ── TWO KEYS, BECAUSE A ROOM CAN CHANGE ITS MIND ABOUT ITS ID ───────────────
//
// The natural key is the conversation id, and for a conversation that exists it
// is the right one. But a room the person has not spoken in yet mints a
// CLIENT-ONLY id that is deliberately never persisted (see
// `ScoutInterviewPanel`'s launcher note) — reload and the room mints a
// different one, so a conversation-keyed draft would be orphaned in exactly the
// situation the defect describes. Measured live 2026-09-17 in the Conductor.
//
// So a surface may register an ALIAS — a key that is stable for that surface
// and that record, e.g. `masterwork-conduct:<rulebookId>`. Every write, every
// tombstone and every clear is mirrored to it, and a restore falls back to it
// when the conversation key holds nothing. The alias is never a second source
// of truth: it holds the same bytes, dies at the same moment, and carries the
// same tombstone.
//
// ── THE RESURRECTION HAZARD (the reason for `gen`) ──────────────────────────
//
// A restore that lands AFTER a send would put the sent message back in the box
// and the user would send it twice. That is the exact class
// `input-draft-protection.ts` exists to guard, re-opened from the other side.
// So every record carries a SUBMIT GENERATION:
//
//   • `markComposerDraftSent` bumps the generation and writes a TOMBSTONE
//     ({ sent: true }) BEFORE the request goes out — clear-before-send. The
//     tombstone is a positive record of "this conversation's draft was sent",
//     not an absence that a stale write could refill.
//   • Every write carries the generation it was composed under and is REFUSED
//     if the stored record already holds a newer one.
//   • A restore is a two-step compare-and-apply: `peekComposerDraft` hands back
//     a sealed token; `applyComposerDraft` (the thunk) re-reads and refuses
//     unless the record AND the conversation's generation are still exactly
//     what was peeked. A send, another tab or a destroy in between invalidates
//     the token instead of resurrecting a sent message.
//
// The generation is seeded from storage on first touch, so it survives the
// reload it exists to protect.
// ============================================================================

import { DRAFT_TTL_MS } from "@/lib/drafts/useTextDraft";

const PREFIX = "matrx.composer-draft.";
const ALIAS_PREFIX = "matrx.composer-draft.surface.";

/** Below this a lost value costs the user nothing worth restoring or announcing. */
export const COMPOSER_DRAFT_MIN_CHARS = 2;

export type ComposerDraftRecord = {
  /** The draft text. Empty on a tombstone. */
  v: string;
  /** Written-at epoch ms — drives the TTL. */
  at: number;
  /** Submit generation this record was written under. */
  gen: number;
  /** True when this records a SEND, not a draft. Never restorable. */
  sent?: boolean;
};

/** A sealed read. `applyComposerDraft` refuses it once anything has moved. */
export type ComposerDraftToken = {
  conversationId: string;
  /** The exact storage key it came from — conversation key or surface alias. */
  key: string;
  value: string;
  /** The record's generation at peek time. */
  gen: number;
  /** The live conversation's generation at peek time. */
  conversationGen: number;
};

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.sessionStorage;
    // Touch it: a blocked store throws here rather than at the first write.
    const probe = `${PREFIX}__probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    return s;
  } catch {
    return null;
  }
}

/** False when the browser refuses storage — the composer must SAY drafts are off. */
export function isComposerDraftStorageAvailable(): boolean {
  return storage() !== null;
}

export function composerDraftKey(conversationId: string): string {
  return PREFIX + conversationId;
}

export function composerDraftAliasKey(alias: string): string {
  return ALIAS_PREFIX + alias;
}

// ── Surface aliases ─────────────────────────────────────────────────────────

const aliases = new Map<string, string>();

/**
 * Give this conversation a surface-stable second key. Registered by the
 * composer on mount, BEFORE any keystroke, so every write is mirrored.
 */
export function registerComposerDraftAlias(
  conversationId: string,
  alias: string,
): void {
  aliases.set(conversationId, composerDraftAliasKey(alias));
}

export function unregisterComposerDraftAlias(conversationId: string): void {
  aliases.delete(conversationId);
}

function keysFor(conversationId: string): string[] {
  const alias = aliases.get(conversationId);
  return alias
    ? [composerDraftKey(conversationId), alias]
    : [composerDraftKey(conversationId)];
}

// ── Records ─────────────────────────────────────────────────────────────────

function readAt(key: string): ComposerDraftRecord | null {
  const s = storage();
  if (!s) return null;
  try {
    const raw = s.getItem(key);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<ComposerDraftRecord>;
    if (!parsed || typeof parsed.v !== "string") return null;
    if (typeof parsed.at !== "number" || typeof parsed.gen !== "number") {
      return null;
    }
    if (Date.now() - parsed.at > DRAFT_TTL_MS) {
      s.removeItem(key);
      return null;
    }
    return {
      v: parsed.v,
      at: parsed.at,
      gen: parsed.gen,
      sent: parsed.sent === true,
    };
  } catch {
    return null;
  }
}

function writeAt(key: string, record: ComposerDraftRecord): boolean {
  const s = storage();
  if (!s) return false;
  try {
    s.setItem(key, JSON.stringify(record));
    return true;
  } catch {
    return false;
  }
}

function removeAt(key: string): void {
  const s = storage();
  if (!s) return;
  try {
    s.removeItem(key);
  } catch {
    /* nothing to clear is not a failure */
  }
}

// ── Submit generations ──────────────────────────────────────────────────────
// In-memory per conversation, seeded from storage so it survives the reload.

const generations = new Map<string, number>();

export function currentGeneration(conversationId: string): number {
  const held = generations.get(conversationId);
  if (held !== undefined) return held;
  const seeded = readAt(composerDraftKey(conversationId))?.gen ?? 0;
  generations.set(conversationId, seeded);
  return seeded;
}

function bumpGeneration(conversationId: string): number {
  const next = currentGeneration(conversationId) + 1;
  generations.set(conversationId, next);
  return next;
}

/**
 * Keep the draft for `conversationId` (and its surface alias, if any). Returns
 * false when the browser refuses storage — the caller must SAY so — or when the
 * write is stale, i.e. another writer has already advanced the generation past
 * ours, which is what a send racing a queued keystroke looks like.
 */
export function writeComposerDraft(
  conversationId: string,
  value: string,
): boolean {
  if (!isComposerDraftStorageAvailable()) return false;
  const gen = currentGeneration(conversationId);
  const live = readAt(composerDraftKey(conversationId));
  // A newer generation in storage means a send (this tab or another) has
  // already happened. Refuse rather than re-open the resurrection hazard.
  if (live && live.gen > gen) {
    generations.set(conversationId, live.gen);
    return false;
  }
  if (value.length < COMPOSER_DRAFT_MIN_CHARS) {
    // Nothing worth keeping — but do not delete a live tombstone, which is a
    // record of a send and must outlive an empty composer.
    if (live?.sent) return true;
    clearComposerDraft(conversationId);
    return true;
  }
  const record: ComposerDraftRecord = { v: value, at: Date.now(), gen };
  let ok = true;
  for (const key of keysFor(conversationId)) {
    ok = writeAt(key, record) && ok;
  }
  return ok;
}

/**
 * CLEAR-BEFORE-SEND. Called the instant the user submits, before the request
 * leaves: bumps the generation and lays a tombstone on every key, so nothing
 * written or peeked under the old generation can put the sent message back.
 */
export function markComposerDraftSent(conversationId: string): void {
  const gen = bumpGeneration(conversationId);
  const tombstone: ComposerDraftRecord = {
    v: "",
    at: Date.now(),
    gen,
    sent: true,
  };
  for (const key of keysFor(conversationId)) writeAt(key, tombstone);
}

/** Drop the records entirely (instance destroyed / explicit clear). */
export function clearComposerDraft(conversationId: string): void {
  for (const key of keysFor(conversationId)) removeAt(key);
}

/**
 * Step 1 of the restore. Returns a sealed token, or null when there is nothing
 * restorable (no record, a tombstone, too short, expired). The conversation's
 * own key wins; the surface alias is the fallback for a room that re-mints its
 * conversation id on every mount.
 */
export function peekComposerDraft(
  conversationId: string,
  alias?: string,
): ComposerDraftToken | null {
  const conversationGen = currentGeneration(conversationId);
  const candidates = [composerDraftKey(conversationId)];
  if (alias) candidates.push(composerDraftAliasKey(alias));
  for (const key of candidates) {
    const record = readAt(key);
    if (!record || record.sent) continue;
    if (record.v.length < COMPOSER_DRAFT_MIN_CHARS) continue;
    return {
      conversationId,
      key,
      value: record.v,
      gen: record.gen,
      conversationGen,
    };
  }
  return null;
}

/**
 * Step 2's storage half: is this token still exactly the live record, and has
 * the conversation not sent anything since it was peeked? False on either.
 */
export function isComposerDraftTokenLive(token: ComposerDraftToken): boolean {
  if (currentGeneration(token.conversationId) !== token.conversationGen) {
    return false;
  }
  const record = readAt(token.key);
  if (!record || record.sent) return false;
  return record.gen === token.gen && record.v === token.value;
}

/** Test seam ONLY — drops the in-memory generations and aliases, as a reload would. */
export function __resetComposerDraftGenerationsForTest(): void {
  generations.clear();
  aliases.clear();
}
