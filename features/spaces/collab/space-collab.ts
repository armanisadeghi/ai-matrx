"use client";

// features/spaces/collab/space-collab.ts — live co-editing of one Space (H3): a Yjs document shared over
// Supabase broadcast through the workbook's provider (`features/data-tables/collab/SupabaseYjsProvider`,
// imported as-is, channel `yjs:spaces:<spaceId>`).
//
//   fragment "document-store" — the BlockNote body (BlockNote's own Yjs binding: characters, cursors).
//   map "meta"                — title, icon, cover, settings (last write wins per field).
//   awareness                 — BlockNote's cursor `user` {name, color} plus `uid` and `canEdit` (the election).
//
// THE SEED. The room has no server: its first member builds the Y document from the stored snapshot. Two
// people opening an empty room at once would each build it — and two independent builds of the same blocks
// are two copies of every block. So the seed is built in a scratch document whose Yjs client id is a hash of
// (page, stored version): every member seeding the same version writes byte-identical items, which Yjs
// merges into one. A member waits for the room's answer first (and asks again while the presence channel
// says someone else is here) and seeds only when nobody holds the page.
//
// THE HOST. Exactly one member writes snapshots: among members whose awareness says `canEdit`, still
// present on the page's presence channel, the lowest `uid:clientID` — and, inside one tab, only the
// room's tab leader. Recomputed on every awareness / presence change, so a host that leaves (or is killed:
// its presence entry drops) hands over at once.
//
// RESYNC. Realtime has no replay. The provider catches up by itself after a reconnect: it merges every
// state answer and pushes this member's own state (SupabaseYjsProvider, 2106b220f5), so nothing here
// rebuilds it.

import { BlockNoteEditor } from "@blocknote/core";
import { blocksToYXmlFragment, yXmlFragmentToBlocks } from "@blocknote/core/yjs";
import * as Y from "yjs";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";

import { SupabaseYjsProvider } from "@/features/data-tables/collab/SupabaseYjsProvider";

import type { SpaceDoc } from "../contract";
import { toEngine } from "../editor/convert";
import { spacesSchema } from "../editor/schema";

export const FRAGMENT = "document-store";
const META = "meta";
const META_KEYS = ["title", "icon", "cover", "settings"] as const;
export type SpaceMeta = Pick<SpaceDoc, (typeof META_KEYS)[number]>;

/** Origin of this member's own meta writes (the observer skips them: the page already shows them). */
const LOCAL_META = "spaces-local-meta";
const SEED = "spaces-seed";
/** While someone else is on the page, ask the room this many more times before building from the snapshot. */
const EXTRA_STATE_ASKS = 3;

/** Notion-like person colours: one per person, the same on every screen. */
const PALETTE = ["#2383e2", "#0f7b6c", "#d9730d", "#e03e3e", "#9065b0", "#ad1a72", "#dfab01", "#448361"];
export function personColor(userId: string): string {
  let h = 2166136261;
  for (let i = 0; i < userId.length; i++) {
    h ^= userId.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return PALETTE[Math.abs(h) % PALETTE.length];
}

function seedClientId(spaceId: string, version: number): number {
  let h = 2166136261;
  const s = `${spaceId}:${version}`;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  // Never 0 and never a value Yjs' random ids are likely to take twice.
  return (h >>> 0) || 1;
}

let headless: BlockNoteEditor | null = null;
/** One schema-only editor for building seeds (never mounted). */
function seedEditor(): BlockNoteEditor {
  headless ??= BlockNoteEditor.create({
    schema: spacesSchema,
    tables: { headers: true, splitCells: false, cellBackgroundColor: true, cellTextColor: true },
    trailingBlock: false,
  } as never) as unknown as BlockNoteEditor;
  return headless;
}

/** The page's Yjs seed for one stored version: identical bytes on every member that builds it. */
function seedUpdate(snapshot: SpaceDoc): Uint8Array {
  const scratch = new Y.Doc();
  scratch.clientID = seedClientId(snapshot.id, snapshot.version);
  // An empty page still gets its one empty line here: an editor mounted on an empty fragment would add
  // its own (a random id each), and two members would see two.
  const blocks = snapshot.blocks.length ? snapshot.blocks : [{ id: `${snapshot.id}-first`, type: "paragraph" as const }];
  scratch.transact(() => {
    blocksToYXmlFragment(seedEditor(), toEngine(blocks) as never, scratch.getXmlFragment(FRAGMENT));
    const meta = scratch.getMap(META);
    for (const k of META_KEYS) meta.set(k, (snapshot[k] ?? null) as never);
  });
  const update = Y.encodeStateAsUpdateV2(scratch);
  scratch.destroy();
  return update;
}

/** Every block id in the fragment, in document order (blockContainer `id` attributes, any depth). */
export function fragmentBlockIds(fragment: Y.XmlFragment): string[] {
  const out: string[] = [];
  const walk = (node: Y.XmlElement | Y.XmlFragment) => {
    for (const child of node.toArray()) {
      if (!(child instanceof Y.XmlElement)) continue;
      if (child.nodeName === "blockContainer" || child.nodeName === "columnList" || child.nodeName === "column") {
        const id = child.getAttribute("id");
        if (typeof id === "string") out.push(id);
      }
      walk(child);
    }
  };
  walk(fragment);
  return out;
}

/**
 * The room trace (round 28): when a page sets `window.__spacesCollabTrace = []` before load, every change
 * to the body's block list after joining is recorded — when, from where (seed / room / this editor), the
 * fragment's top-level shape, and which block ids came and went. Off (no array) costs nothing.
 */
function trace(entry: Record<string, unknown>): void {
  const log = (globalThis as { __spacesCollabTrace?: unknown[] }).__spacesCollabTrace;
  if (Array.isArray(log)) log.push({ t: Math.round(performance.now()), ...entry });
}
function countBlocks(blocks: ReadonlyArray<{ children?: unknown }>): number {
  let n = 0;
  for (const b of blocks) n += 1 + (Array.isArray(b.children) ? countBlocks(b.children as Array<{ children?: unknown }>) : 0);
  return n;
}
function traceOn(): boolean {
  return Array.isArray((globalThis as { __spacesCollabTrace?: unknown[] }).__spacesCollabTrace);
}

export interface SpaceCollabOptions {
  spaceId: string;
  userId: string;
  name: string;
  canEdit: boolean;
  /** Another member's meta change (or the seed) — the page shows it. */
  onMeta: (meta: Partial<SpaceMeta>) => void;
  /** Awareness or tab leadership changed: re-run the election. */
  onPeers: () => void;
}

export class SpaceCollabSession {
  readonly doc = new Y.Doc();
  readonly awareness = new Awareness(this.doc);
  readonly fragment = this.doc.getXmlFragment(FRAGMENT);
  /** What BlockNote's collaboration option reads (awareness only); stable across provider rebuilds. */
  readonly providerRef = { awareness: this.awareness };
  readonly user: { name: string; color: string };
  /** Whether this member's body came from the room (true) or was built from the stored snapshot (false). */
  fromRoom = false;
  /** When built from the snapshot: the body as the editor will read it (the save baseline). */
  seededBlocks: unknown[] | null = null;
  private provider: SupabaseYjsProvider | null = null;
  private disposed = false;
  private readonly meta = this.doc.getMap<unknown>(META);
  private readonly opts: SpaceCollabOptions;

  constructor(opts: SpaceCollabOptions) {
    this.opts = opts;
    this.user = { name: opts.name, color: personColor(opts.userId) };
    this.awareness.setLocalStateField("uid", opts.userId);
    this.awareness.setLocalStateField("canEdit", opts.canEdit);
    this.awareness.setLocalStateField("user", this.user);
    this.awareness.on("change", () => this.opts.onPeers());
    if (traceOn()) {
      let before = fragmentBlockIds(this.fragment);
      this.doc.on("afterTransaction", (tr: Y.Transaction) => {
        const ids = fragmentBlockIds(this.fragment);
        if (ids.join(",") === before.join(",")) return;
        const was = new Set(before);
        const now = new Set(ids);
        const o = tr.origin;
        trace({
          ev: "body",
          origin: o === SEED ? "seed" : typeof o === "string" ? o : o && typeof o === "object" ? (o.constructor?.name ?? "object") : String(o),
          local: tr.local,
          top: this.fragment.toArray().map((n) => (n instanceof Y.XmlElement ? n.nodeName : "text")),
          count: ids.length,
          added: ids.filter((id) => !was.has(id)).length,
          removed: before.filter((id) => !now.has(id)),
          dupes: ids.length - now.size,
        });
        before = ids;
      });
    }
    this.meta.observe((event) => {
      if (event.transaction.origin === LOCAL_META) return;
      const patch: Partial<SpaceMeta> = {};
      for (const k of event.keysChanged) {
        if ((META_KEYS as readonly string[]).includes(k)) (patch as Record<string, unknown>)[k] = this.meta.get(k) ?? null;
      }
      if (Object.keys(patch).length) this.opts.onMeta(patch);
    });
  }

  private makeProvider(): SupabaseYjsProvider {
    return new SupabaseYjsProvider({
      workbookId: this.opts.spaceId,
      channelPrefix: "spaces",
      clientId: crypto.randomUUID(),
      doc: this.doc,
      awareness: this.awareness,
      onLeaderChange: () => this.opts.onPeers(),
    });
  }

  /**
   * Join the room, then make sure the body exists: the room's copy when someone holds it, else the seed
   * built from `snapshot` (the latest stored version). `othersHere` reads the presence channel at call time.
   */
  async start(snapshot: SpaceDoc, othersHere: () => boolean, made = false): Promise<void> {
    if (made) {
      // A page this tab just made (new, duplicate): nobody can hold its room yet, so the body is the seed
      // now and the room is joined behind it — the page opens with its content, never blank while the
      // room answers. Seeds are identical for every member (client id from page + version).
      Y.applyUpdateV2(this.doc, seedUpdate(snapshot), SEED);
      this.seededBlocks = yXmlFragmentToBlocks(seedEditor(), this.fragment);
      this.provider = this.makeProvider();
      void this.provider.connect().catch((e: unknown) => console.error("[spaces] room join", e));
      return;
    }
    this.provider = this.makeProvider();
    await this.provider.connect();
    await this.provider.ready();
    for (let ask = 0; ask < EXTRA_STATE_ASKS && !this.disposed && this.fragment.length === 0 && othersHere(); ask++) {
      // Someone is on the page but no state arrived in time: ask again with a fresh provider.
      await this.rebuildProvider();
    }
    if (this.disposed) return;
    trace({ ev: "answer", version: snapshot.version, stored: countBlocks(snapshot.blocks), roomTop: this.fragment.length, room: fragmentBlockIds(this.fragment).length, othersHere: othersHere() });
    if (this.fragment.length > 0) {
      this.fromRoom = true;
      const meta: Partial<SpaceMeta> = {};
      for (const k of META_KEYS) if (this.meta.has(k)) (meta as Record<string, unknown>)[k] = this.meta.get(k) ?? null;
      this.opts.onMeta(meta);
      return;
    }
    Y.applyUpdateV2(this.doc, seedUpdate(snapshot), SEED);
    this.seededBlocks = yXmlFragmentToBlocks(seedEditor(), this.fragment);
  }

  private async rebuildProvider(): Promise<void> {
    this.provider?.disconnect();
    this.provider = this.makeProvider();
    await this.provider.connect();
    await this.provider.ready();
  }

  setMeta(patch: Partial<SpaceMeta>): void {
    this.doc.transact(() => {
      for (const [k, v] of Object.entries(patch)) {
        if ((META_KEYS as readonly string[]).includes(k)) this.meta.set(k, (v ?? null) as never);
      }
    }, LOCAL_META);
  }

  setCanEdit(canEdit: boolean): void {
    if (this.awareness.getLocalState()?.canEdit !== canEdit) this.awareness.setLocalStateField("canEdit", canEdit);
  }

  /**
   * Is this member the one that writes snapshots? `present` = user ids on the page's presence channel
   * (null when that channel is not connected: awareness alone decides).
   */
  isHost(present: ReadonlySet<string> | null): boolean {
    if (this.disposed) return false;
    const me = this.doc.clientID;
    const key = (uid: string, cid: number) => `${uid}:${String(cid).padStart(10, "0")}`;
    let best: string | null = null;
    this.awareness.getStates().forEach((s, cid) => {
      if (typeof s.uid !== "string" || s.canEdit !== true) return;
      if (cid !== me && present && !present.has(s.uid)) return;
      const k = key(s.uid, cid);
      if (best === null || k < best) best = k;
    });
    const leader = this.provider ? this.provider.isTabLeader() : true;
    return best === key(this.opts.userId, me) && leader;
  }

  /** Other members' cursors / names, for the top bar. */
  peers(): Array<{ uid: string; name: string; color: string }> {
    const out: Array<{ uid: string; name: string; color: string }> = [];
    this.awareness.getStates().forEach((s, cid) => {
      if (cid === this.doc.clientID || typeof s.uid !== "string") return;
      const u = s.user as { name?: string; color?: string } | undefined;
      out.push({ uid: s.uid, name: u?.name ?? "Someone", color: u?.color ?? personColor(s.uid) });
    });
    return out;
  }

  destroy(): void {
    if (this.disposed) return;
    this.disposed = true;
    // Tell the peers this member left now (they would otherwise wait out awareness' 30 s timeout).
    removeAwarenessStates(this.awareness, [this.doc.clientID], "leave");
    // The provider sends the leave notice before it disconnects (synchronous teardown, 2106b220f5).
    this.provider?.disconnect();
    this.provider = null;
    this.awareness.destroy();
    this.doc.destroy();
  }
}
