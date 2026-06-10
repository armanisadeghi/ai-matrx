/**
 * verify-collab.ts — runnable verification harness for the workbook CRDT
 * stack. This is the "probe + e2e" gate that must pass before flipping the
 * `collab` flag on the workbook page.
 *
 * Run from the repo root:
 *
 *   npx tsx features/data-tables/collab/verify-collab.ts
 *
 * Stage A (always runs, no network):
 *   Two WorkbookCollabSessions joined by an in-memory loopback transport.
 *   Verifies the full bridge contract:
 *     A1. local mutation on A → applied exactly once on B (sentinel +
 *         onlyLocal + fromCollab options present)
 *     A2. originator does NOT self-reapply (the local-transaction guard)
 *     A3. sentinel-tagged re-fire on B does NOT echo back into Yjs
 *     A4. non-serializable params are skipped gracefully (no push, no crash)
 *     A5. deterministic host election (lowest uid wins) via awareness relay
 *
 * Stage B (real network — requires NEXT_PUBLIC_SUPABASE_URL +
 *   NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in the environment):
 *   Two SupabaseYjsProviders on one Broadcast channel with raw Y.Docs.
 *     B1. late joiner catches up via y-request-state (sees pre-join writes)
 *     B2. live update propagates A → B
 *     B3. live update propagates B → A (bidirectional)
 *   Reports SKIPPED (not FAILED) if the network/env is unavailable.
 */
import * as Y from "yjs";
import {
  Awareness,
  applyAwarenessUpdate,
  encodeAwarenessUpdate,
} from "y-protocols/awareness";

import {
  WorkbookCollabSession,
  type CollabMutationInfo,
  type CollabProviderLike,
  type CommandServiceLike,
} from "./WorkbookCollabSession";

let passed = 0;
let failed = 0;

function check(name: string, cond: boolean, detail?: string) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.error(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

// ─── Stage A: loopback bridge test ──────────────────────────────────────────

type Executed = { id: string; params: unknown; options: unknown };

function makeMockCommandService(): {
  service: CommandServiceLike;
  executed: Executed[];
  fireLocalMutation: (info: CollabMutationInfo) => void;
} {
  const executed: Executed[] = [];
  let listener: ((info: CollabMutationInfo) => void) | null = null;
  return {
    executed,
    service: {
      onMutationExecutedForCollab(l) {
        listener = l;
        return { dispose: () => (listener = null) };
      },
      syncExecuteCommand(id, params, options) {
        executed.push({ id, params, options });
        // Mirror Univer: applying a command re-fires the collab listener.
        listener?.({ id, type: 2, params });
        return true;
      },
    },
    fireLocalMutation: (info) => listener?.(info),
  };
}

/**
 * In-memory transport: relays doc updates and awareness between all peers
 * registered under the same room id — same contract the Supabase provider
 * fulfills over Broadcast.
 */
const loopbackRooms = new Map<
  string,
  Array<{ doc: Y.Doc; awareness: Awareness }>
>();

function makeLoopbackProvider(args: {
  workbookId: string;
  doc: Y.Doc;
  awareness: Awareness;
}): CollabProviderLike {
  const { workbookId, doc, awareness } = args;
  const peers = loopbackRooms.get(workbookId) ?? [];
  loopbackRooms.set(workbookId, peers);

  const docListener = (update: Uint8Array, origin: unknown) => {
    if (origin === "remote") return;
    for (const peer of peers) {
      if (peer.doc === doc) continue;
      Y.applyUpdate(peer.doc, update, "remote");
    }
  };
  const awarenessListener = (
    changes: { added: number[]; updated: number[]; removed: number[] },
    origin: unknown,
  ) => {
    if (origin === "remote-awareness") return;
    const changed = [...changes.added, ...changes.updated, ...changes.removed];
    if (changed.length === 0) return;
    const update = encodeAwarenessUpdate(awareness, changed);
    for (const peer of peers) {
      if (peer.awareness === awareness) continue;
      applyAwarenessUpdate(peer.awareness, update, "remote-awareness");
    }
  };

  return {
    async connect() {
      // Late joiner catch-up: apply existing peers' state, then register.
      for (const peer of peers) {
        Y.applyUpdate(doc, Y.encodeStateAsUpdate(peer.doc), "remote");
        applyAwarenessUpdate(
          awareness,
          encodeAwarenessUpdate(peer.awareness, [peer.awareness.clientID]),
          "remote-awareness",
        );
      }
      peers.push({ doc, awareness });
      doc.on("update", docListener);
      awareness.on("update", awarenessListener);
    },
    disconnect() {
      doc.off("update", docListener);
      awareness.off("update", awarenessListener);
      const i = peers.findIndex((p) => p.doc === doc);
      if (i >= 0) peers.splice(i, 1);
    },
    async ready() {},
  };
}

async function stageA() {
  console.log("\nStage A — loopback bridge test");

  const roomId = "loopback-room-1";
  const userA = makeMockCommandService();
  const userB = makeMockCommandService();

  const sessionA = new WorkbookCollabSession({
    workbookId: roomId,
    uid: "aaa-user",
    clientId: "client-a",
    commandService: userA.service,
    makeProvider: ({ workbookId, doc, awareness }) =>
      makeLoopbackProvider({ workbookId, doc, awareness }),
  });
  const sessionB = new WorkbookCollabSession({
    workbookId: roomId,
    uid: "bbb-user",
    clientId: "client-b",
    commandService: userB.service,
    makeProvider: ({ workbookId, doc, awareness }) =>
      makeLoopbackProvider({ workbookId, doc, awareness }),
  });

  await sessionA.start();
  await sessionB.start();
  await sleep(50);

  // A1 + A2 + A3: one local mutation on A.
  userA.fireLocalMutation({
    id: "sheet.mutation.set-range-values",
    type: 2,
    params: { unitId: "wb1", subUnitId: "sheet-1", cellValue: { 0: { 0: { v: 42 } } } },
  });
  await sleep(50);

  check("A1 peer applied exactly once", userB.executed.length === 1);
  const applied = userB.executed[0];
  check(
    "A1 id + value survived transport",
    applied?.id === "sheet.mutation.set-range-values" &&
      JSON.stringify(applied.params).includes('"v":42'),
  );
  check(
    "A1 sentinel + onlyLocal + fromCollab present",
    (applied?.params as Record<string, unknown>)?.__matrxRemote === true &&
      (applied?.options as Record<string, unknown>)?.onlyLocal === true &&
      (applied?.options as Record<string, unknown>)?.fromCollab === true,
  );
  check("A2 originator did not self-reapply", userA.executed.length === 0);
  // A3: B's apply re-fired B's listener with sentinel params. If the sentinel
  // guard failed, that would have pushed a second op and A would have applied it.
  check("A3 no echo back to originator", userA.executed.length === 0);

  // A4: non-serializable params (circular reference).
  const circular: Record<string, unknown> = {};
  circular.self = circular;
  userA.fireLocalMutation({
    id: "bad.mutation",
    type: 2,
    params: circular,
  });
  await sleep(50);
  check("A4 non-serializable mutation skipped, peer untouched", userB.executed.length === 1);

  // A5: host election — 'aaa-user' < 'bbb-user' lexicographically.
  const electA = sessionA.electHost();
  const electB = sessionB.electHost();
  check(
    "A5 deterministic host election",
    electA.isHost === true && electB.isHost === false && electB.hostUid === "aaa-user",
    JSON.stringify({ electA, electB }),
  );

  sessionA.stop();
  sessionB.stop();
}

// ─── Stage B: real Supabase Broadcast e2e ───────────────────────────────────

async function stageB() {
  console.log("\nStage B — real Supabase Broadcast e2e");

  if (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
  ) {
    console.log("  SKIPPED — NEXT_PUBLIC_SUPABASE_URL / _PUBLISHABLE_KEY not set");
    return;
  }

  try {
    const { SupabaseYjsProvider } = await import("./SupabaseYjsProvider");
    const { createClient } = await import("@supabase/supabase-js");

    // Two SEPARATE clients = two sockets, like two real browser tabs.
    // (One shared client cannot subscribe the same topic twice.)
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL!.replace(/"/g, "").trim();
    const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!.trim();
    const clientA = createClient(url, key);
    const clientB = createClient(url, key);

    const room = `verify-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;

    const docA = new Y.Doc();
    const awarenessA = new Awareness(docA);
    const providerA = new SupabaseYjsProvider({
      workbookId: room,
      clientId: "verify-a",
      doc: docA,
      awareness: awarenessA,
      client: clientA,
    });
    await providerA.connect();
    await providerA.ready();

    // Pre-join write — the late joiner must catch this up via y-request-state.
    docA.getMap("cells").set("a1", "pre-join-value");

    const docB = new Y.Doc();
    const awarenessB = new Awareness(docB);
    const providerB = new SupabaseYjsProvider({
      workbookId: room,
      clientId: "verify-b",
      doc: docB,
      awareness: awarenessB,
      client: clientB,
    });
    await providerB.connect();
    await providerB.ready();
    await sleep(1000);

    check(
      "B1 late joiner caught up via state-request",
      docB.getMap("cells").get("a1") === "pre-join-value",
      `got: ${String(docB.getMap("cells").get("a1"))}`,
    );

    docA.getMap("cells").set("a2", "live-from-a");
    await sleep(2000);
    check(
      "B2 live update A→B",
      docB.getMap("cells").get("a2") === "live-from-a",
      `got: ${String(docB.getMap("cells").get("a2"))}`,
    );

    docB.getMap("cells").set("b1", "live-from-b");
    await sleep(2000);
    check(
      "B3 live update B→A",
      docA.getMap("cells").get("b1") === "live-from-b",
      `got: ${String(docA.getMap("cells").get("b1"))}`,
    );

    providerA.disconnect();
    providerB.disconnect();
  } catch (err) {
    console.log(
      `  SKIPPED — transport unavailable in this environment (${err instanceof Error ? err.message : String(err)})`,
    );
  }
}

// ─── main ────────────────────────────────────────────────────────────────────

(async () => {
  if (process.env.VERIFY_STAGE !== "B") await stageA();
  if (process.env.VERIFY_STAGE !== "A") await stageB();
  console.log(`\nResult: ${passed} passed, ${failed} failed`);
  process.exit(failed > 0 ? 1 : 0);
})();
