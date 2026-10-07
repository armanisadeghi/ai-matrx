/**
 * SupabaseYjsProvider — the two defects the Spaces lanes reported, driven through the REAL
 * `@ai-matrx/realtime` manager over a fake broadcast network (no sockets).
 *
 *  1. Late state answers: every `y-state` addressed to this provider must be merged, not only the
 *     first. Otherwise the provider's own reconnect catch-up (`onBackfill` → `y-request-state`) is
 *     answered and thrown away, and edits made by peers during the gap never arrive. The catch-up
 *     must also push this member's own state, or its offline edits never reach the peers.
 *  2. Teardown: `disconnect()` must deliver the pending awareness "leave" itself. It used to clear
 *     the throttled queue unsent, which forced the Spaces session to defer `disconnect()` 120 ms —
 *     and during that window the old screen's provider kept applying the room's frames (including a
 *     same-tab successor's) to the doc its unmounted editor was bound to (the RangeError). And a
 *     destroyed doc must never be written into: the provider detaches when its doc is destroyed.
 */
import * as Y from "yjs";
import { Awareness, removeAwarenessStates } from "y-protocols/awareness";
import {
  createInertEnvironment,
  createRealtimeManager,
  type RealtimeManager,
} from "@ai-matrx/realtime";

import { SupabaseYjsProvider } from "@/lib/collab/SupabaseYjsProvider";

type Listener = (payload: { event: string; payload?: unknown }) => void;

/** One broadcast network. A "client" is one browser tab; `down` drops frames to/from it. */
class FakeNetwork {
  private channels = new Set<FakeChannel>();
  readonly down = new Set<FakeClient>();
  register(c: FakeChannel) {
    this.channels.add(c);
  }
  unregister(c: FakeChannel) {
    this.channels.delete(c);
  }
  deliver(from: FakeChannel, event: string, payload: unknown) {
    if (this.down.has(from.client)) return;
    for (const c of this.channels) {
      if (c === from || c.topic !== from.topic || this.down.has(c.client)) continue;
      // Supabase delivers asynchronously; a microtask keeps ordering per sender.
      queueMicrotask(() => c.emit(event, payload));
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
    // Every manager in one process shares the package's per-tab session id (a global slot), so
    // stamp the envelope with this fake TAB's id — otherwise echo suppression drops every frame.
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

const flush = async (ms = 0) => {
  for (let i = 0; i < 20; i++) await Promise.resolve();
  if (ms) await new Promise((r) => setTimeout(r, ms));
  for (let i = 0; i < 20; i++) await Promise.resolve();
};

const managers: RealtimeManager[] = [];
function tab(network: FakeNetwork) {
  const client = new FakeClient(network);
  const manager = createRealtimeManager({
    client: client as never,
    environment: createInertEnvironment(),
    diagnostics: () => undefined,
  } as never);
  managers.push(manager);
  return { client, manager };
}
afterEach(() => {
  for (const m of managers.splice(0)) m.dispose();
});

function member(manager: RealtimeManager, room = "room-1") {
  const doc = new Y.Doc();
  const awareness = new Awareness(doc);
  const provider = new SupabaseYjsProvider({
    workbookId: room,
    channelPrefix: "test",
    clientId: crypto.randomUUID(),
    doc,
    awareness,
    manager,
  });
  return { doc, awareness, provider, text: () => doc.getText("t").toString() };
}

async function join(m: ReturnType<typeof member>) {
  await m.provider.connect();
  await m.provider.ready();
}

describe("SupabaseYjsProvider — late state answers (defect 1)", () => {
  it("the reconnect catch-up delivers what a peer wrote during the gap, both ways", async () => {
    const net = new FakeNetwork();
    const ta = tab(net);
    const tb = tab(net);
    const a = member(ta.manager);
    const b = member(tb.manager);
    await join(a);
    a.doc.getText("t").insert(0, "hello");
    await flush();
    await join(b); // first answer: B learns "hello"
    expect(b.text()).toBe("hello");

    // B drops off the network; both keep editing.
    net.down.add(tb.client);
    a.doc.getText("t").insert(5, " world");
    b.doc.getText("t").insert(0, ">");
    await flush();
    expect(b.text()).toBe(">hello");

    // Back online: the package runs B's backfill (the catch-up).
    net.down.delete(tb.client);
    tb.manager.backfillAll("network-restored");
    await flush(20);

    expect(b.text()).toBe(">hello world"); // A's gap edit reached B (the late answer was merged)
    expect(a.text()).toBe(">hello world"); // B's offline edit reached A
    a.provider.disconnect();
    b.provider.disconnect();
  });
});

describe("SupabaseYjsProvider — teardown (defect 2)", () => {
  it("disconnect() delivers the pending awareness leave itself — no deferred disconnect needed", async () => {
    const net = new FakeNetwork();
    const a = member(tab(net).manager);
    const b = member(tab(net).manager);
    await join(a);
    await join(b);
    a.awareness.setLocalStateField("user", { name: "A" });
    await flush(80);
    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(true);

    // The Spaces session's leave: remove our state, then disconnect AT ONCE.
    removeAwarenessStates(a.awareness, [a.doc.clientID], "leave");
    a.provider.disconnect();
    await flush(80);

    expect(b.awareness.getStates().has(a.doc.clientID)).toBe(false);
    b.provider.disconnect();
  });

  it("a remounted screen's successor in the same tab never writes into the old screen's doc after disconnect", async () => {
    const t = tab(new FakeNetwork());
    const old = member(t.manager);
    await join(old);
    old.doc.getText("t").insert(0, "v1");
    old.provider.disconnect();

    const next = member(t.manager);
    await join(next);
    next.doc.getText("t").insert(0, "v2 ");
    await flush(20);
    expect(old.text()).toBe("v1");
    next.provider.disconnect();
  });

  it("a destroyed doc is never written into: the provider detaches when its doc is destroyed", async () => {
    const net = new FakeNetwork();
    const a = member(tab(net).manager);
    const b = member(tab(net).manager);
    await join(a);
    await join(b);

    a.doc.destroy();
    b.doc.getText("t").insert(0, "after");
    await flush(20);

    // Read straight off the store: a destroyed doc has no observers left to tell us.
    expect(a.doc.getText("t").toString()).toBe("");
    b.provider.disconnect();
  });
});
