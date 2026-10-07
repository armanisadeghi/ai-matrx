/**
 * 🚨 "WHAT THE LIVE AGENT SAW" OPENS THIS PAIR'S OWN RUN — never the newest run
 * in a chat two pairs share.
 *
 * Live 2026-10-03: two `run_mandate` pairs of candidate 61012f12… ran in one
 * conversation (149532f1…). The lookup read the conversation's NEWEST request,
 * so both pairs' Live buttons opened the same chat — the owner was shown the
 * wrong run. Each pair records its run's own `chat.user_request` id; the unit
 * is that run's newest `chat.request`. Only an older pair whose id names no
 * request falls back to the conversation, and then says the chat holds several
 * runs instead of silently picking one.
 *
 * Red proof: run against the pre-fix `transcripts.ts` (conversation-only
 * lookup), both pairs answer the same unit.
 */

type Row = Record<string, unknown>;
const tables: Record<string, Row[]> = {};

/** The slice of supabase-js the lookup uses, over in-memory rows. */
function query(table: string) {
  let rows = [...(tables[table] ?? [])];
  let countOnly = false;
  const chain = {
    select: (_cols: string, opts?: { count?: string; head?: boolean }) => {
      countOnly = Boolean(opts?.head);
      return chain;
    },
    eq: (col: string, value: unknown) => {
      rows = rows.filter((r) => r[col] === value);
      return chain;
    },
    is: (col: string, value: unknown) => {
      rows = rows.filter((r) => (r[col] ?? null) === value);
      return chain;
    },
    order: (col: string, opts: { ascending: boolean }) => {
      rows.sort((a, b) => String(a[col]).localeCompare(String(b[col])) * (opts.ascending ? 1 : -1));
      return chain;
    },
    limit: (n: number) => {
      rows = rows.slice(0, n);
      return chain;
    },
    maybeSingle: async () => ({ data: rows[0] ?? null, error: null }),
    then: (resolve: (v: unknown) => unknown) =>
      resolve(countOnly ? { count: rows.length, error: null } : { data: rows, error: null }),
  };
  return chain;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: (table: string) => query(table) }) },
}));

import { findTranscriptUnit } from "../transcripts";

const SHARED_CHAT = "149532f1-120a-441d-aba5-89632d0536a3";

beforeEach(() => {
  tables.user_request = [
    { id: "ur-first", conversation_id: SHARED_CHAT },
    { id: "ur-second", conversation_id: SHARED_CHAT },
  ];
  tables.request = [
    { id: "req-first-1", user_request_id: "ur-first", conversation_id: SHARED_CHAT, created_at: "2026-10-03T22:20:01Z" },
    { id: "req-first-2", user_request_id: "ur-first", conversation_id: SHARED_CHAT, created_at: "2026-10-03T22:20:02Z" },
    { id: "req-second-1", user_request_id: "ur-second", conversation_id: SHARED_CHAT, created_at: "2026-10-03T22:25:01Z" },
  ];
  tables.message = [];
});

it("two pairs sharing one chat open two different runs — each its own last call", async () => {
  const first = await findTranscriptUnit({ requestId: "ur-first", conversationId: SHARED_CHAT });
  const second = await findTranscriptUnit({ requestId: "ur-second", conversationId: SHARED_CHAT });
  expect(first).toEqual({ state: "ready", unit: { unitKind: "agent_request", unitId: "req-first-2" } });
  expect(second).toEqual({ state: "ready", unit: { unitKind: "agent_request", unitId: "req-second-1" } });
});

it("an older pair whose id names no request falls back to the chat and says it holds several runs", async () => {
  const older = await findTranscriptUnit({ requestId: "not-a-request", conversationId: SHARED_CHAT });
  expect(older).toEqual({
    state: "ready",
    unit: { unitKind: "agent_request", unitId: "req-second-1" },
    runsInChat: 2,
  });
});

it("a chat with one run falls back without a note", async () => {
  tables.user_request = tables.user_request.slice(0, 1);
  const older = await findTranscriptUnit({ requestId: null, conversationId: SHARED_CHAT });
  expect(older).toMatchObject({ state: "ready" });
  expect((older as { runsInChat?: number }).runsInChat).toBeUndefined();
});
