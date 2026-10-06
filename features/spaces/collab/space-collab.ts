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
// RESYNC. Realtime has no replay. After a reconnect the provider is rebuilt (a fresh state request pulls
// the peers' edits) and this member's whole state is re-sent (the peers merge what they missed). Yjs
// merges are idempotent, so a resync that was not needed costs one frame and changes nothing.

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
const RESEND = "spaces-resend";
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
  async start(snapshot: SpaceDoc, othersHere: () => boolean): Promise<void> {
    this.provider = this.makeProvider();
    await this.provider.connect();
    await this.provider.ready();
    for (let ask = 0; ask < EXTRA_STATE_ASKS && !this.disposed && this.fragment.length === 0 && othersHere(); ask++) {
      // Someone is on the page but no state arrived in time: ask again with a fresh provider.
      await this.rebuildProvider();
    }
    if (this.disposed) return;
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

  /**
   * After a reconnect: pull the peers' state and re-send ours (see RESYNC above).
   * WORKAROUND for a provider defect (owner's, features/data-tables/collab/SupabaseYjsProvider.ts):
   * `handleStateResponse` drops every `y-state` after the first ("first answer wins"), so its own
   * `onBackfill` re-request is answered and ignored, and nobody asks for this member's offline edits.
   * Rebuilding the provider makes a fresh request; the `updateV2` emit pushes our state. Remove once the
   * provider applies late state answers (Yjs applies are idempotent) and re-sends its own state on backfill.
   */
  async resync(): Promise<void> {
    if (this.disposed || !this.provider) return;
    await this.rebuildProvider();
    if (this.disposed) return;
    // The provider broadcasts what `updateV2` carries; this member's whole state goes out once.
    (this.doc as unknown as { emit(name: string, args: unknown[]): void }).emit("updateV2", [Y.encodeStateAsUpdateV2(this.doc), RESEND, this.doc, null]);
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
    const provider = this.provider;
    this.provider = null;
    // The provider flushes awareness on a 50 ms throttle: give the leave notice that long to go out.
    window.setTimeout(() => {
      provider?.disconnect();
      this.awareness.destroy();
      this.doc.destroy();
    }, 120);
  }
}
