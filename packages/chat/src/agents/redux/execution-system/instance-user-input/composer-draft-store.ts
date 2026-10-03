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
// SCOPE: `localStorage`, this browser, per signed-in person (the record carries
// its owner and is never offered to anyone else — the rule `@ai-matrx/kit/drafts`
// `LocalDraft` was written under). TTL is the kit's `DRAFT_TTL_MS`; expired
// records are swept on first touch per page. A crash net, never a synced store:
// a draft is not a message and never reaches the server.
//
// It was `sessionStorage` until 2026-10-03, which only survives a reload of the
// SAME browser tab. Everything around the composer outlives that — the canvas
// remembers its Quick Chat tab in `localStorage`, the conversation is in the
// database — so a reload that came back in a fresh tab context (a restored
// session, a tab the browser discarded, a reopened window) brought the chat
// back with an empty box. The draft was the one thing that did not survive.
// Measured live 2026-10-03 on Quick Chat as admin@admin.com. Cross-tab is safe
// by construction: the submit generation below already refuses a write from a
// tab that has not seen the latest send.
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
// So a surface may register an ALIAS — a key that is stable for that surface,
// e.g. `masterwork-conduct:<rulebookId>` or `chat:<agentId>`. Every write,
// every tombstone and every clear is mirrored to it, and a restore falls back
// to it when the conversation key holds nothing. The alias is never a second
// source of truth: it holds the same bytes, dies at the same moment, and
// carries the same tombstone.
//
// 🚨 THE ALIAS IS ONLY FOR A CONVERSATION THAT DOES NOT EXIST YET. A surface
// key is stable per SURFACE, and some surfaces — `/chat` is the plain case —
// use one key for every conversation with that agent. Keyed on that alone, a
// draft left in conversation A would surface in conversation B. So
// `useComposerDraftRestore` registers and consults the alias ONLY while the
// conversation has no messages, and RELEASES it at the handoff (first turn),
// after which the conversation id is real, stable and the only key. Nothing
// with messages ever writes an alias record, so the worst an alias can hold is
// an unsent draft from an unstarted composer on that same surface, by this
// same person. (Known narrow edge, accepted: opening an EMPTY existing
// conversation on the same surface can adopt such a draft. It is the person's
// own unsent text, it is announced on screen, and it is never auto-sent.)
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

import { DRAFT_TTL_MS } from "@ai-matrx/kit/drafts";

const PREFIX = "matrx.composer-draft.";
const ALIAS_PREFIX = "matrx.composer-draft.surface.";

/** Below this a lost value costs the user nothing worth restoring or announcing. */
export const COMPOSER_DRAFT_MIN_CHARS = 2;

export type ComposerDraftRecord = {
  /** The draft text. Empty on a tombstone. */
  v: string;
  /** The user id it was typed as (null = signed out). Offered to no one else. */
  o?: string | null;
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

let swept = false;

function storage(): Storage | null {
  try {
    if (typeof window === "undefined") return null;
    const s = window.localStorage;
    // Touch it: a blocked store throws here rather than at the first write.
    const probe = `${PREFIX}__probe`;
    s.setItem(probe, "1");
    s.removeItem(probe);
    if (!swept) {
      swept = true;
      sweepExpired(s);
    }
    return s;
  } catch {
    return null;
  }
}

/**
 * `localStorage` never ends with the tab, and every fresh conversation id is a
 * new key — so expired records are dropped once per page instead of only when
 * that exact conversation is read again.
 */
function sweepExpired(s: Storage): void {
  const now = Date.now();
  const doomed: string[] = [];
  for (let i = 0; i < s.length; i += 1) {
    const key = s.key(i);
    if (!key || !key.startsWith(PREFIX)) continue;
    try {
      const parsed = JSON.parse(s.getItem(key) ?? "null") as
        | Partial<ComposerDraftRecord>
        | null;
      if (typeof parsed?.at !== "number" || now - parsed.at > DRAFT_TTL_MS) {
        doomed.push(key);
      }
    } catch {
      doomed.push(key);
    }
  }
  for (const key of doomed) s.removeItem(key);
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
/** Every live conversation holding each alias key. */
const aliasHolders = new Map<string, Set<string>>();

// 🚨 AN ALIAS HELD BY TWO LIVE COMPOSERS IS NOT A STABLE KEY. A page that
// mounts several composers under one surface key at once (every Agent Battle
// column, for one) would otherwise mirror column 1's draft to the alias, and
// after a reload every empty column adopted it — Submit all then sent column
// 1's text from all of them (measured live 2026-09-27, Request Mod, 5 columns).
// So the moment an alias is shared nothing writes it, its record is dropped,
// and no one restores from it. Each conversation keeps its own key.

function isAliasShared(aliasKey: string): boolean {
  return (aliasHolders.get(aliasKey)?.size ?? 0) > 1;
}

function dropAliasHolder(conversationId: string): void {
  const key = aliases.get(conversationId);
  aliases.delete(conversationId);
  if (!key) return;
  const holders = aliasHolders.get(key);
  holders?.delete(conversationId);
  if (holders && holders.size === 0) aliasHolders.delete(key);
}

/**
 * Give this conversation a surface-stable second key. Registered by the
 * composer on mount, BEFORE any keystroke, so every write is mirrored.
 */
export function registerComposerDraftAlias(
  conversationId: string,
  alias: string,
): void {
  dropAliasHolder(conversationId);
  const key = composerDraftAliasKey(alias);
  aliases.set(conversationId, key);
  const holders = aliasHolders.get(key) ?? new Set<string>();
  holders.add(conversationId);
  aliasHolders.set(key, holders);
  if (isAliasShared(key)) removeAt(key);
}

export function unregisterComposerDraftAlias(conversationId: string): void {
  dropAliasHolder(conversationId);
}

/**
 * THE HANDOFF. The conversation is real now (it has a turn), so its own id is
 * the only key it needs. Drop the alias registration, and drop the alias
 * RECORD when it is the tombstone this conversation's send laid down — the
 * conversation key already carries that fact, and leaving it behind would make
 * the surface look permanently "already sent" to the next unstarted composer.
 * A live draft under the alias is never touched: it belongs to whatever
 * unstarted composer wrote it.
 */
export function releaseComposerDraftAlias(conversationId: string): void {
  const key = aliases.get(conversationId);
  const shared = key ? isAliasShared(key) : false;
  dropAliasHolder(conversationId);
  if (!key || shared) return;
  if (readAt(key)?.sent) removeAt(key);
}

function keysFor(conversationId: string): string[] {
  const alias = aliases.get(conversationId);
  return alias && !isAliasShared(alias)
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
      o: typeof parsed.o === "string" ? parsed.o : null,
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
  ownerId: string | null = null,
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
  const record: ComposerDraftRecord = {
    v: value,
    o: ownerId,
    at: Date.now(),
    gen,
  };
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
  ownerId: string | null = null,
): ComposerDraftToken | null {
  const conversationGen = currentGeneration(conversationId);
  const candidates = [composerDraftKey(conversationId)];
  if (alias && !isAliasShared(composerDraftAliasKey(alias))) {
    candidates.push(composerDraftAliasKey(alias));
  }
  for (const key of candidates) {
    const record = readAt(key);
    if (!record || record.sent) continue;
    // Another person's unsent text on this browser is never theirs to see.
    if ((record.o ?? null) !== ownerId) continue;
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

/** Test seam ONLY — drops the in-memory generations, aliases and sweep flag, as a reload would. */
export function __resetComposerDraftGenerationsForTest(): void {
  swept = false;
  generations.clear();
  aliases.clear();
  aliasHolders.clear();
}
