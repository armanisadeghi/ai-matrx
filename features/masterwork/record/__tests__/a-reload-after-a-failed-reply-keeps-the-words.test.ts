/**
 * 🚨 "EVERYTHING YOU HAVE SAID IS ALREADY SAVED" HAS TO BE TRUE.
 *
 * ## The defect this guards (fifteenth cold walk, 2026-09-20, blocking D)
 *
 * The interview pre-flight promises, verbatim:
 *
 *   Stop whenever you like — everything you have said is already saved, and
 *   you can pick this interview up again later.
 *
 * An Expert sent three substantial answers, reloaded
 * `/masterwork/<id>/interview`, and got the PRE-FLIGHT AGAIN. No "pick up where
 * you left off", no transcript, and the Rulebook read "No interviews yet."
 *
 * Her words were never lost. aidream commits the user row with real content in
 * the end-of-turn coordinator flush, and that flush runs on `"error"` and
 * `"cancelled"` as well as `"stream_end"` — so the turn survives even the
 * AttributeError that crashed every reply that day.
 *
 * What was lost was the only thing the resume read looks at: the
 * `platform.associations` edge. The browser writes it, and only AFTER
 * `waitForConversationPersisted` — a poll of up to 180 seconds that dies with
 * the tab. Reload inside that window and no edge is ever written, so
 * `interviewConversationIds` answers `[]` and the panel, correctly reading
 * "this Rulebook has no interviews", drops her on "Before we start".
 *
 * ## Why this test is not self-congratulation
 *
 * It reproduces the sequence, not the fix: turn starts → reply fails → the
 * tab dies mid-poll (the module's in-flight set is reset, exactly as a reload
 * does) → the edge read comes back EMPTY, as production's did → and the run
 * has produced NO RULE, so the pre-existing provenance recovery cannot help.
 * It asserts on the observable answer the panel branches on — the interview
 * list — not on any internal of the fix.
 *
 * Proven failing against the shipped read (`interviewConversationIds` alone)
 * before the intent record existed, and passing after.
 */

const RULEBOOK_ID = "14328899-9a2c-4e9e-84d6-64b4af98246e";
const CONVERSATION_ID = "d3f6aa6c-e783-4ebe-9a65-db46ed38520b";

/** What the Expert actually typed, before the reply crashed. */
const HER_WORDS =
  "I never quote a replacement before I have the refrigerant charge and the " +
  "total external static pressure in front of me.";

/** Every edge read this test makes — production's answer was an empty list. */
const edges: { edges: { otherType: string; otherId: string; role: string }[] } =
  { edges: [] };

const addedEdges: { sourceId: string; targetId: string; role: string }[] = [];

jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: {
    listForEntity: jest.fn(async () => ({ ok: true, data: edges })),
    add: jest.fn(async (args: { sourceId: string; targetId: string; role: string }) => {
      addedEdges.push(args);
      return { ok: true, data: {} };
    }),
  },
}));

/** The conversation and message rows aidream really did commit. */
const conversationRows = [
  {
    id: CONVERSATION_ID,
    title: "Auto: expertise_interviewer",
    created_at: "2026-09-20T23:50:00.000Z",
    updated_at: "2026-09-20T23:52:00.000Z",
    message_count: 2,
  },
];

const messageRows = [
  {
    id: "3c1f0f6e-0000-4000-8000-000000000001",
    conversation_id: CONVERSATION_ID,
    position: 0,
    content: `Let's get started.\n${HER_WORDS}`,
    user_content: HER_WORDS,
    created_at: "2026-09-20T23:50:30.000Z",
  },
];

jest.mock("@/utils/supabase/client", () => {
  const table = (rows: unknown[]) => {
    const chain: Record<string, unknown> = {};
    for (const key of ["select", "in", "is", "eq", "order", "filter"]) {
      chain[key] = jest.fn(() => chain);
    }
    // Awaiting the builder resolves to the PostgREST answer.
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rows, error: null });
    return chain;
  };
  return {
    supabase: {
      schema: jest.fn(() => ({
        from: jest.fn((name: string) =>
          table(name === "conversation" ? conversationRows : messageRows),
        ),
      })),
    },
  };
});

/** The browser-resident poll. In the reload case it never gets to run at all
 *  — the tab is gone — so it is stubbed to the answer a dead tab gives. */
jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversation-persistence",
  () => ({ waitForConversationPersisted: jest.fn(async () => false) }),
);

jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => null,
}));

import {
  associateInterviewWhenPersisted,
  listRulebookInterviewsWithAccess,
  pendingInterviewConversationIds,
} from "../service";

describe("a reload after a failed reply still finds the Expert's words", () => {
  beforeEach(() => {
    window.localStorage.clear();
    edges.edges = [];
    addedEdges.length = 0;
  });

  it("records the intent the moment the turn starts, not when the poll lands", () => {
    // The panel calls this the instant the execution system creates the first
    // request. Nothing is awaited; the record must already be there.
    associateInterviewWhenPersisted({
      rulebookId: RULEBOOK_ID,
      conversationId: CONVERSATION_ID,
      rulebookName: "walk15-HVAC Repair or Replace Verdict",
      turnStarted: true,
    });

    expect(pendingInterviewConversationIds(RULEBOOK_ID)).toEqual([
      CONVERSATION_ID,
    ]);
  });

  it("does NOT record an untouched draft the Expert never sent a turn in", () => {
    associateInterviewWhenPersisted({
      rulebookId: RULEBOOK_ID,
      conversationId: CONVERSATION_ID,
      rulebookName: "walk15-HVAC Repair or Replace Verdict",
      turnStarted: false,
    });
    expect(pendingInterviewConversationIds(RULEBOOK_ID)).toEqual([]);
  });

  it("offers the interview on the first read after the reload", async () => {
    // 1. The turn starts.
    associateInterviewWhenPersisted({
      rulebookId: RULEBOOK_ID,
      conversationId: CONVERSATION_ID,
      rulebookName: "walk15-HVAC Repair or Replace Verdict",
      turnStarted: true,
    });

    // 2. The reply crashes and the Expert reloads. The association poll dies
    //    with the tab, so no edge is ever written — production's exact state.
    expect(edges.edges).toEqual([]);

    // 3. The panel asks what interviews this Rulebook has. No rule was ever
    //    written, so the provenance recovery has nothing to offer either.
    const { interviews, hiddenCount } = await listRulebookInterviewsWithAccess(
      RULEBOOK_ID,
      [],
    );

    // THE FAILING HALF before the fix: this was an empty list, and an empty
    // list is what put her back on "Before we start".
    expect(interviews).toHaveLength(1);
    expect(interviews[0]?.conversationId).toBe(CONVERSATION_ID);
    // And it is HER words the chooser will show, not the machine's cue.
    expect(JSON.stringify(interviews[0])).toContain("refrigerant charge");
    expect(JSON.stringify(interviews[0])).not.toContain("Let's get started");

    // It heals the edge while it is there, so this costs one round trip once.
    expect(addedEdges).toEqual([
      expect.objectContaining({
        sourceId: CONVERSATION_ID,
        targetId: RULEBOOK_ID,
        role: "interview",
      }),
    ]);
    // A healed pair is retired — it never heals twice.
    expect(pendingInterviewConversationIds(RULEBOOK_ID)).toEqual([]);

    // A pending pair is never reported as someone else's hidden interview.
    expect(hiddenCount).toBe(0);
  });

  it("claims nothing for a conversation that never committed", async () => {
    associateInterviewWhenPersisted({
      rulebookId: RULEBOOK_ID,
      conversationId: "00000000-0000-4000-8000-00000000dead",
      rulebookName: "walk15-HVAC Repair or Replace Verdict",
      turnStarted: true,
    });

    const { interviews, hiddenCount } = await listRulebookInterviewsWithAccess(
      RULEBOOK_ID,
      [],
    );

    // The conversation read answers with rows for the OTHER id only, so the
    // never-committed pair simply is not an interview — and is not counted as
    // one the viewer cannot see either.
    expect(
      interviews.some(
        (i) => i.conversationId === "00000000-0000-4000-8000-00000000dead",
      ),
    ).toBe(false);
    expect(hiddenCount).toBe(0);
  });
});
