// features/rich-document/annotations/sidecarStore.ts
//
// ONE SOURCE'S ANNOTATIONS, KEPT BY RECORD — read once per tab, kept current by one ref-counted
// channel (the remount law, 2026-10-03).
//
// THE DEFECT THIS CLOSES. `useAnnotationSidecar` held the confirmed threads, highlights and links
// in its own `useState` and read them (`cmt_list` + `platform.associations`) in a mount effect, and
// opened its own two channels per mount. A board tile that slept and woke, a Remove + Undo, and a
// second view of the same note each read the whole sidecar again and re-joined both topics.
//
// THE SHAPE. One entry per source (`<token>:<id>`): the confirmed items, the collaboration-doors
// flag, may-edit, the older captured bodies the resolver maps through, and the read state. The
// first view reads; every later view — the same view after a wake or a remount included — renders
// the entry and reads nothing. A re-read happens only when something says the answer changed: a
// comment change or delete/restore notice on the source's channels, a reconnect (`onBackfill`), a
// write this tab made, or a Retry. Concurrent asks share the read in flight, and an answer that
// lands after a newer read was asked is dropped (the late-answer guard).
//
// LIVE FOR AS LONG AS ANYBODY HOLDS IT, AND A GRACE AFTER. The channels open on the first holder
// and close `SIDECAR_GRACE_MS` after the last one lets go, so a wake or an Undo inside the grace
// finds the entry current and the channels joined. Past the grace nothing watched the source, so
// the entry is marked stale and the next view reads it once.

import type { RealtimeManager } from "@ai-matrx/realtime";
import { getAssociationsStore } from "@/features/scopes/host/associationsStore";
import { createEchoLedger, type EchoLedger } from "./echo";
import { canEditSource, listCommentThreads, listEdgeItems } from "./service";
import type { AnnotationItem, AnnotationSource } from "./types";

/** How long a source's channels and kept answer outlive its last view. */
export const SIDECAR_GRACE_MS = 60_000;

export interface SidecarSnapshot {
  confirmed: AnnotationItem[];
  loading: boolean;
  /** A read failure — shown, never turned into an empty list. */
  error: string | null;
  doors: boolean;
  canEdit: boolean;
  /** Older captured bodies by content version (one read per version, kept). */
  capturedBodies: Record<number, string | null>;
}

interface Entry {
  snapshot: SidecarSnapshot;
  /** A read has answered (and nothing has made it stale since). */
  fresh: boolean;
  /** Late-answer guard: only the newest read writes its answer. */
  seq: number;
  inflight: Promise<void> | null;
  /** This tab's own writes, so their realtime echoes are not news (shared by every view). */
  ledger: EchoLedger;
  refreshTimer: ReturnType<typeof setTimeout> | null;
  holders: number;
  closeLive: (() => void) | null;
  liveManager: RealtimeManager | null;
  graceTimer: ReturnType<typeof setTimeout> | null;
  versionsAsked: Set<number>;
  /** The source the last read was for — what a re-read asked from outside the views reads. */
  source: AnnotationSource | null;
}

const EMPTY: SidecarSnapshot = {
  confirmed: [],
  loading: true,
  error: null,
  doors: false,
  canEdit: false,
  capturedBodies: {},
};

const entries = new Map<string, Entry>();
const listeners = new Set<() => void>();

function notify(): void {
  for (const listener of listeners) listener();
}

export function subscribeSidecars(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function sidecarKey(source: Pick<AnnotationSource, "token" | "id"> | null): string | null {
  return source ? `${source.token}:${source.id}` : null;
}

function entryOf(key: string): Entry {
  let entry = entries.get(key);
  if (!entry) {
    entry = {
      snapshot: EMPTY,
      fresh: false,
      seq: 0,
      inflight: null,
      ledger: createEchoLedger(),
      refreshTimer: null,
      holders: 0,
      closeLive: null,
      liveManager: null,
      graceTimer: null,
      versionsAsked: new Set(),
      source: null,
    };
    entries.set(key, entry);
  }
  return entry;
}

/** The kept snapshot for `key` (stable until it changes). */
export function sidecarSnapshot(key: string | null): SidecarSnapshot {
  return (key ? entries.get(key)?.snapshot : undefined) ?? EMPTY;
}

/** This tab's echo ledger for the source (every view of it shares one). */
export function sidecarLedger(key: string): EchoLedger {
  return entryOf(key).ledger;
}

function patch(entry: Entry, next: Partial<SidecarSnapshot>): void {
  entry.snapshot = { ...entry.snapshot, ...next };
  notify();
}

function failureText(e: unknown): string {
  return e instanceof Error ? e.message : typeof e === "string" ? e : "The read failed.";
}

/**
 * Read the source's annotations — unless they are already kept and current (`force` reads anyway:
 * a change notice, a reconnect, a write, a Retry). A read already running is joined unless forced;
 * a forced read supersedes it and the older answer is dropped when it lands.
 */
export function loadSidecar(
  key: string,
  source: AnnotationSource,
  options: { force?: boolean; describe?: (e: unknown) => string } = {},
): Promise<void> {
  const entry = entryOf(key);
  entry.source = source;
  if (!options.force) {
    if (entry.inflight) return entry.inflight;
    if (entry.fresh) return Promise.resolve();
  }
  const seq = ++entry.seq;
  const describe = options.describe ?? failureText;
  if (entry.snapshot.error) patch(entry, { error: null });
  // The two halves load independently: a refused edge read must never hide the comment threads
  // (or the reverse). Each failure is shown by name.
  const titles = getAssociationsStore().titles;
  const request = (async () => {
    const [threads, edges, editable] = await Promise.allSettled([
      listCommentThreads(source),
      // org-filter: default-for-new the store's organization serves create paths only; this edge read carries none
      listEdgeItems(source, (token, ids) => titles.fetch(token, ids)),
      source.save ? canEditSource(source) : Promise.resolve(false),
    ]);
    if (seq !== entry.seq) return;
    const next: AnnotationItem[] = [];
    const errors: string[] = [];
    let doors = entry.snapshot.doors;
    if (threads.status === "fulfilled") {
      next.push(...threads.value.items);
      doors = threads.value.collaborationDoors;
    } else errors.push(describe(threads.reason));
    if (edges.status === "fulfilled") next.push(...edges.value.highlights, ...edges.value.links);
    else errors.push(describe(edges.reason));
    // A failed half is never kept as an answer: the next view asks again.
    entry.fresh = errors.length === 0;
    patch(entry, {
      confirmed: next,
      doors,
      canEdit: editable.status === "fulfilled" && editable.value === true,
      error: errors.length ? errors.join(" ") : null,
      loading: false,
    });
  })().finally(() => {
    if (entry.inflight === request) entry.inflight = null;
  });
  entry.inflight = request;
  return request;
}

/** A change notice: one re-read 250 ms after the last of a burst. */
export function scheduleSidecarReload(key: string, source: () => AnnotationSource | null): void {
  const entry = entryOf(key);
  if (entry.refreshTimer) clearTimeout(entry.refreshTimer);
  entry.refreshTimer = setTimeout(() => {
    entry.refreshTimer = null;
    const src = source();
    if (src) void loadSidecar(key, src, { force: true });
  }, 250);
}

/**
 * A write to a record's threads that this tab learned of from somewhere other than realtime — an
 * agent's `comment_reply` receipt in the chat. Every kept view of that record (any signed-in
 * person's key) reads again now; one nobody is holding is only marked stale, so its next view reads.
 *
 * WHY: the panel learned of a reply written server-side ONLY through the postgres_changes INSERT.
 * Live 2026-10-08 realtime's replication pool dropped (`PoolingReplicationError`) 0.6 s after the
 * agent's reply landed on Arman's comment c2; the INSERT never arrived, the kept snapshot stayed
 * "fresh", and the reply was invisible in the panel while cmt_list returned it.
 */
export function refreshRecordThreads(token: string, id: string): void {
  const record = `${token}:${id}`;
  for (const [key, entry] of entries) {
    if (key !== record && !key.endsWith(`|${record}`)) continue;
    entry.fresh = false;
    if (entry.source && (entry.holders > 0 || entry.closeLive)) {
      scheduleSidecarReload(key, () => entry.source);
    }
  }
}

/** Older captured bodies the resolver maps through — each version read once per source. */
export function ensureCapturedBodies(key: string, source: AnnotationSource, versions: number[]): void {
  if (!source.readVersionBody) return;
  const entry = entryOf(key);
  const wanted = versions.filter((v) => v !== source.contentVersion && !entry.versionsAsked.has(v));
  if (wanted.length === 0) return;
  for (const v of wanted) entry.versionsAsked.add(v);
  void Promise.all(
    wanted.map(async (v) => [v, await source.readVersionBody!(v).catch(() => null)] as const),
  ).then((pairs) => {
    patch(entry, { capturedBodies: { ...entry.snapshot.capturedBodies, ...Object.fromEntries(pairs) } });
  });
}

/**
 * Hold the source's live half: `open` runs on the first holder (on this manager) and its close runs
 * `SIDECAR_GRACE_MS` after the last holder lets go. Returns the release.
 */
export function holdSidecarLive(key: string, manager: RealtimeManager, open: () => () => void): () => void {
  const entry = entryOf(key);
  if (entry.graceTimer) {
    clearTimeout(entry.graceTimer);
    entry.graceTimer = null;
  }
  if (entry.closeLive && entry.liveManager !== manager) {
    // The provider rebuilt its manager (a new client or person); the old one's channels are gone.
    entry.closeLive();
    entry.closeLive = null;
  }
  if (!entry.closeLive) {
    entry.closeLive = open();
    entry.liveManager = manager;
  }
  entry.holders += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    entry.holders -= 1;
    if (entry.holders > 0) return;
    entry.graceTimer = setTimeout(() => {
      entry.graceTimer = null;
      if (entry.holders > 0) return;
      entry.closeLive?.();
      entry.closeLive = null;
      entry.liveManager = null;
      // Nothing watched the source from here on: the next view reads it once.
      entry.fresh = false;
    }, SIDECAR_GRACE_MS);
  };
}

/** Tests only: forget every kept source (closing any live half). */
export function resetSidecarStoreForTests(): void {
  for (const entry of entries.values()) {
    if (entry.graceTimer) clearTimeout(entry.graceTimer);
    if (entry.refreshTimer) clearTimeout(entry.refreshTimer);
    entry.closeLive?.();
  }
  entries.clear();
  notify();
}
