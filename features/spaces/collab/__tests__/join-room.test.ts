/**
 * ONE copy of the page in the room (round 28, item 1). A member joining a Space's room must never build
 * a second copy of the body beside the room's: two seeds of different stored versions are two independent
 * block groups, Yjs keeps both, and y-prosemirror then throws one away (content lost).
 *
 * The case: member A holds the room (its body built from stored version 41, then edited; the host saved
 * that as version 42). Member B opens the page while the network is slow (every frame takes 1.8 s, longer
 * than the provider's 1.5 s alone timer) and before presence has reported anyone. B must wait for the
 * room's body, never seed version 42 beside A's copy.
 *
 * Real SupabaseYjsProvider and @ai-matrx/realtime manager over the fake broadcast network of
 * convergence.test.ts (fixed delay here).
 */
import * as Y from "yjs";
import { Awareness } from "y-protocols/awareness";
import { createInertEnvironment, createRealtimeManager, type RealtimeManager } from "@ai-matrx/realtime";

import { SupabaseYjsProvider } from "@/lib/collab/SupabaseYjsProvider";

import { joinRoom } from "../join-room";

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
  /** Every frame any member put on the wire. */
  sent = 0;
  deliver(from: FakeChannel, event: string, payload: unknown) {
    this.sent += 1;
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
const providers: SupabaseYjsProvider[] = [];
afterEach(() => {
  for (const p of providers.splice(0)) p.disconnect();
  for (const m of managers.splice(0)) m.dispose();
});

const DELAY_MS = 1800;

function makeProvider(network: FakeNetwork, doc: Y.Doc) {
  const client = new FakeClient(network);
  const manager = createRealtimeManager({ client: client as never, environment: createInertEnvironment(), diagnostics: () => undefined } as never);
  managers.push(manager);
  const provider = new SupabaseYjsProvider({ workbookId: "space-1", channelPrefix: "spaces", clientId: crypto.randomUUID(), doc, awareness: new Awareness(doc), manager, antiEntropyIntervalMs: 60_000 });
  providers.push(provider);
  return provider;
}

/** A seed as space-collab.ts builds it: one block group, client id from (page, version). */
function seed(doc: Y.Doc, version: number, texts: string[]) {
  const scratch = new Y.Doc();
  scratch.clientID = 1000 + version;
  scratch.transact(() => {
    const group = new Y.XmlElement("blockGroup");
    scratch.getXmlFragment("document-store").insert(0, [group]);
    group.insert(
      0,
      texts.map((t, i) => {
        const c = new Y.XmlElement("blockContainer");
        c.setAttribute("id", `b${i}`);
        const p = new Y.XmlElement("paragraph");
        p.insert(0, [new Y.XmlText(t)]);
        c.insert(0, [p]);
        return c;
      }),
    );
  });
  Y.applyUpdateV2(doc, Y.encodeStateAsUpdateV2(scratch));
}

const text = (doc: Y.Doc) => doc.getXmlFragment("document-store").toString();

describe("joining a Space room", () => {
  it("a slow room and presence not reported yet: the joiner takes the room's body and never seeds a second copy", async () => {
    const net = new FakeNetwork(() => 1, DELAY_MS);
    const a = new Y.Doc();
    seed(a, 41, ["Plan", "Tasks"]);
    // A's edit after the seed (saved by the host as version 42).
    const groupA = a.getXmlFragment("document-store").get(0) as Y.XmlElement;
    const extra = new Y.XmlElement("blockContainer");
    extra.setAttribute("id", "b2");
    groupA.insert(2, [extra]);
    const pa = makeProvider(net, a);
    await pa.connect();

    const b = new Y.Doc();
    const fragment = b.getXmlFragment("document-store");
    let pb: SupabaseYjsProvider | null = null;
    const joinedAt = Date.now();
    // Presence reports A 2.5 s after B starts (the channel was slow to connect).
    const othersHere = () => (Date.now() - joinedAt < 2500 ? null : true);
    let seeded = 0;
    const result = await joinRoom({
      fragment,
      connect: async () => {
        pb = makeProvider(net, b);
        await pb.connect();
        await pb.ready();
      },
      reask: async () => {
        pb?.disconnect();
        pb = makeProvider(net, b);
        await pb.connect();
        await pb.ready();
      },
      othersHere,
      disposed: () => false,
      seed: () => {
        seeded++;
        seed(b, 42, ["Plan", "Tasks", ""]);
      },
      roomWaitMs: 8000,
    });
    // Every frame still in the air lands (A's answer included).
    await new Promise((r) => setTimeout(r, DELAY_MS * 2 + 200));

    // One block group — the room's — never the room's plus a seed beside it.
    expect(fragment.length).toBe(1);
    expect(text(b)).toBe(text(a));
    expect(seeded).toBe(0);
    expect(result).toBe("room");
  }, 30_000);

  it("nobody else on the page (presence says so): the joiner seeds once, without waiting for the room", async () => {
    const net = new FakeNetwork(() => 1, 10);
    const b = new Y.Doc();
    const fragment = b.getXmlFragment("document-store");
    const started = Date.now();
    let seeded = 0;
    const result = await joinRoom({
      fragment,
      connect: async () => {
        const p = makeProvider(net, b);
        await p.connect();
        await p.ready();
      },
      reask: async () => undefined,
      othersHere: () => false,
      disposed: () => false,
      seed: () => {
        seeded++;
        seed(b, 42, ["Plan"]);
      },
    });
    expect(result).toBe("seed");
    expect(seeded).toBe(1);
    expect(fragment.length).toBe(1);
    // Only the provider's own alone timer (1.5 s), no extra wait.
    expect(Date.now() - started).toBeLessThan(2500);
  }, 30_000);

  it("a block inserted right after the joiner seeded is in the room for the next member (and stays one copy)", async () => {
    const net = new FakeNetwork(() => 1, 300);
    const b = new Y.Doc();
    const fb = b.getXmlFragment("document-store");
    await joinRoom({
      fragment: fb,
      connect: async () => {
        const p = makeProvider(net, b);
        await p.connect();
        await p.ready();
      },
      reask: async () => undefined,
      othersHere: () => false,
      disposed: () => false,
      seed: () => seed(b, 42, ["Plan"]),
    });
    // Programmatic insert right after load (the "Database with AI" block).
    const db = new Y.XmlElement("blockContainer");
    db.setAttribute("id", "db-1");
    (fb.get(0) as Y.XmlElement).insert(1, [db]);

    const a = new Y.Doc();
    const fa = a.getXmlFragment("document-store");
    let seeded = 0;
    const result = await joinRoom({
      fragment: fa,
      connect: async () => {
        const p = makeProvider(net, a);
        await p.connect();
        await p.ready();
      },
      reask: async () => undefined,
      othersHere: () => true,
      disposed: () => false,
      seed: () => {
        seeded++;
        seed(a, 42, ["Plan"]);
      },
      roomWaitMs: 6000,
    });
    await new Promise((r) => setTimeout(r, 800));
    expect(result).toBe("room");
    expect(seeded).toBe(0);
    expect(fa.length).toBe(1);
    expect(fa.toString()).toContain('id="db-1"');
    expect(fa.toString()).toBe(fb.toString());
  }, 30_000);
});
