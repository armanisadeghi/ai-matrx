/**
 * Co-editing convergence (round 22, item 1): two members of one Space room type at the same time —
 * in the same paragraph and in different blocks — over the REAL SupabaseYjsProvider and the REAL
 * `@ai-matrx/realtime` manager, on a fake broadcast network that delivers every frame after a random
 * delay (so frames from the two members interleave and arrive out of order, as Supabase may deliver
 * them). When the typing stops and every frame has landed, both documents must be byte-identical in
 * content and hold no pending (undeliverable) updates.
 *
 * The fake network is the one in features/data-tables/collab/__tests__/supabase-yjs-provider.test.ts,
 * plus jitter and an optional drop rate.
 */
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createInertEnvironment, createRealtimeManager, type RealtimeManager } from "@ai-matrx/realtime";

import { SupabaseYjsProvider } from "@/features/data-tables/collab/SupabaseYjsProvider";

type Listener = (payload: { event: string; payload?: unknown }) => void;

class FakeNetwork {
  private channels = new Set<FakeChannel>();
  inFlight = 0;
  constructor(
    readonly rand: () => number,
    readonly maxDelayMs = 25,
    /** Probability that one y-update frame is lost on the way to one receiver. */
    readonly dropRate = 0,
  ) {}
  dropped = 0;
  register(c: FakeChannel) {
    this.channels.add(c);
  }
  unregister(c: FakeChannel) {
    this.channels.delete(c);
  }
  deliver(from: FakeChannel, event: string, payload: unknown) {
    for (const c of this.channels) {
      if (c === from || c.topic !== from.topic) continue;
      if (event === "y-update" && this.dropRate > 0 && this.rand() < this.dropRate) {
        this.dropped += 1;
        continue;
      }
      this.inFlight += 1;
      setTimeout(() => {
        this.inFlight -= 1;
        c.emit(event, payload);
      }, Math.floor(this.rand() * this.maxDelayMs));
    }
  }
}

class FakeChannel {
  private listeners = new Map<string, Listener[]>();
  constructor(
    readonly client: FakeClient,
    readonly topic: string,
  ) {}
  on(type: string, filter: { event: string }, cb: Listener) {
    if (type === "broadcast") {
      const list = this.listeners.get(filter.event) ?? [];
      list.push(cb);
      this.listeners.set(filter.event, list);
    }
    return this;
  }
  emit(event: string, payload: unknown) {
    for (const cb of this.listeners.get(event) ?? []) cb({ event, payload });
  }
  subscribe(cb?: (status: string) => void) {
    this.client.network.register(this);
    queueMicrotask(() => cb?.("SUBSCRIBED"));
    return this;
  }
  send(args: { event: string; payload?: unknown }) {
    const env = args.payload as Record<string, unknown> | undefined;
    const payload = env && typeof env === "object" && "cid" in env ? { ...env, cid: this.client.id } : env;
    this.client.network.deliver(this, args.event, payload);
    return Promise.resolve("ok");
  }
  track() {
    return Promise.resolve("ok");
  }
  untrack() {
    return Promise.resolve("ok");
  }
  presenceState() {
    return {};
  }
}

class FakeClient {
  readonly id = crypto.randomUUID();
  constructor(readonly network: FakeNetwork) {}
  channel(topic: string) {
    return new FakeChannel(this, topic);
  }
  removeChannel(c: FakeChannel) {
    this.network.unregister(c);
    return Promise.resolve("ok");
  }
}

/** Deterministic PRNG so a failure replays. */
function mulberry32(seed: number) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const managers: RealtimeManager[] = [];
afterEach(() => {
  for (const m of managers.splice(0)) m.dispose();
});

function member(network: FakeNetwork) {
  const client = new FakeClient(network);
  const manager = createRealtimeManager({ client: client as never, environment: createInertEnvironment(), diagnostics: () => undefined } as never);
  managers.push(manager);
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const provider = new SupabaseYjsProvider({ workbookId: "space-1", channelPrefix: "spaces", clientId: crypto.randomUUID(), doc, awareness, manager });
  return { doc, provider, manager };
}

/** A paragraph block shaped like BlockNote's: blockGroup > blockContainer > paragraph > text. */
function paragraph(text: string): Y.XmlElement {
  const container = new Y.XmlElement("blockContainer");
  const p = new Y.XmlElement("paragraph");
  p.insert(0, [new Y.XmlText(text)]);
  container.insert(0, [p]);
  return container;
}
const group = (doc: Y.Doc) => doc.getXmlFragment("document-store").get(0) as Y.XmlElement;
const textOf = (doc: Y.Doc, block: number) => ((group(doc).get(block) as Y.XmlElement).get(0) as Y.XmlElement).get(0) as Y.XmlText;

const pending = (doc: Y.Doc) => doc.store.pendingStructs !== null || doc.store.pendingDs !== null;

async function settle(net: FakeNetwork) {
  for (let i = 0; i < 400 && net.inFlight > 0; i++) await new Promise((r) => setTimeout(r, 10));
  await new Promise((r) => setTimeout(r, 30));
}

async function room(net: FakeNetwork) {
  const a = member(net);
  const b = member(net);
  await a.provider.connect();
  await a.provider.ready();
  a.doc.transact(() => {
    const g = new Y.XmlElement("blockGroup");
    a.doc.getXmlFragment("document-store").insert(0, [g]);
    g.insert(0, [paragraph("shared line"), paragraph("A's block"), paragraph("B's block")]);
  });
  await settle(net);
  await b.provider.connect();
  await b.provider.ready();
  expect(b.doc.getXmlFragment("document-store").toString()).toBe(a.doc.getXmlFragment("document-store").toString());
  return { a, b };
}

/** Each member types `keys` characters, one Yjs transaction per key, as a person does. */
async function typeTogether(a: Y.Doc, b: Y.Doc, rand: () => number, keys: number) {
  const step = (doc: Y.Doc, own: number) => {
    // Half the keys go into the shared line at a random spot, half into the member's own block;
    // one in eight is a backspace.
    const t = rand() < 0.5 ? textOf(doc, 0) : textOf(doc, own);
    const len = t.length;
    if (len > 0 && rand() < 0.125) t.delete(Math.floor(rand() * len), 1);
    else t.insert(Math.floor(rand() * (len + 1)), String.fromCharCode(97 + Math.floor(rand() * 26)));
  };
  for (let k = 0; k < keys; k++) {
    step(a, 1);
    step(b, 2);
    if (k % 7 === 0) await new Promise((r) => setTimeout(r, Math.floor(rand() * 8)));
  }
}

describe("Spaces co-editing convergence", () => {
  it.each([1, 2, 3, 4, 5])("two members typing at once in the same line and in their own blocks end identical (seed %i)", async (seed) => {
    const rand = mulberry32(seed);
    const net = new FakeNetwork(rand);
    const { a, b } = await room(net);
    await typeTogether(a.doc, b.doc, rand, 300);
    await settle(net);
    expect(pending(a.doc)).toBe(false);
    expect(pending(b.doc)).toBe(false);
    expect(a.doc.getXmlFragment("document-store").toJSON()).toBe(b.doc.getXmlFragment("document-store").toJSON());
    expect(Y.encodeStateVector(a.doc)).toEqual(Y.encodeStateVector(b.doc));
    a.provider.disconnect();
    b.provider.disconnect();
  });

  it("one y-update frame lost while both stay connected: the room still ends identical", async () => {
    // Broadcast is at-most-once: Supabase drops a frame under load (rate limit, a socket hiccup that
    // never becomes a disconnect). Yjs cannot apply anything that builds on a missing update, so the
    // receiver parks every later update from that member as pending — the documents differ for good
    // unless something re-exchanges state while connected.
    const rand = mulberry32(42);
    const net = new FakeNetwork(rand, 25, 0.02);
    const { a, b } = await room(net);
    await typeTogether(a.doc, b.doc, rand, 300);
    await settle(net);
    // Wait as long as a person would before calling the page broken.
    await new Promise((r) => setTimeout(r, 3000));
    await settle(net);
    expect(net.dropped).toBeGreaterThan(0);
    expect(pending(a.doc) || pending(b.doc)).toBe(false);
    expect(a.doc.getXmlFragment("document-store").toJSON()).toBe(b.doc.getXmlFragment("document-store").toJSON());
    a.provider.disconnect();
    b.provider.disconnect();
  }, 20_000);
});
