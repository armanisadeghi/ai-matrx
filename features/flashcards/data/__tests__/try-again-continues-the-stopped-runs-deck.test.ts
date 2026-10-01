/**
 * GUARD — one run never yields two decks.
 *
 * The bug (2026-09-30, /education/flashcards/new): a deck was created for the
 * run's conversation while the deck was still being generated (the chat
 * renderer's materializer). The page reloaded mid-run; "Try again" started a
 * new run in a new conversation and saved a SECOND deck, leaving the first one
 * behind as an orphan.
 *
 * The rule: a retry passes the stopped run's conversations as `continues`.
 * The save then continues the deck made for them — its cards replaced by the
 * retry's, renamed, restamped with the retry's conversation — and creates
 * nothing new.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(), rpc: jest.fn() },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: jest.fn() },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn(async (explicit?: string) => explicit ?? "org-1"),
}));

import { supabase } from "@/utils/supabase/client";
import { fcService } from "../fcService";
import type { FcSetRow, SetWithCards } from "../types";

const FIRST = "conv-first";
const RETRY = "conv-retry";

const orphan = {
  id: "set-orphan",
  name: "Flashcards",
  organization_id: "org-1",
  metadata: {
    source_system: "cx_message",
    source_id: "msg-1",
    conversation_id: FIRST,
    generation: "chat_render_block",
  },
} as unknown as FcSetRow;

/** `schema().from("fc_set")…` resolves `rows` for any chain. */
function fcSetReturning(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is", "in", "neq", "order", "limit"]) {
    chain[m] = jest.fn(() => chain);
  }
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  (supabase.schema as jest.Mock).mockReturnValue(chain);
  return chain;
}

afterEach(() => jest.restoreAllMocks());

describe("Try again after a reload continues the stopped run's deck", () => {
  it("replaces the orphan's cards, names it, restamps it — and creates no second deck", async () => {
    const chain = fcSetReturning([orphan]);
    jest
      .spyOn(fcService, "findChatGeneratedSetForConversation")
      .mockResolvedValue({ data: null, error: null });
    jest.spyOn(fcService, "getSetWithCards").mockResolvedValue({
      data: {
        set: orphan,
        cards: [
          { id: "old-1", version: 1, front: "half", back: "done" },
          { id: "old-2", version: 3, front: "half", back: "two" },
        ],
      } as unknown as SetWithCards,
      error: null,
    });
    const deleteCard = jest.spyOn(fcService, "deleteCard").mockResolvedValue({ data: null, error: null });
    const addCards = jest.spyOn(fcService, "addCards").mockResolvedValue({ data: [], error: null });
    const updateSet = jest.spyOn(fcService, "updateSet").mockResolvedValue({ data: orphan, error: null });
    const merge = jest.spyOn(fcService, "mergeSetMetadata").mockResolvedValue({ data: null, error: null });
    const createSetWithCards = jest.spyOn(fcService, "createSetWithCards");

    const res = await fcService.createGeneratedSetForConversation(
      RETRY,
      { name: "Volcanology", topic: "Volcanology", difficulty: "medium", orgId: "org-1" },
      [{ front: "Q", back: "A" }],
      { continues: [FIRST] },
    );

    expect(res.data?.set.id).toBe("set-orphan");
    expect(createSetWithCards).not.toHaveBeenCalled();
    // Looked the earlier attempt up by its conversation.
    expect(chain.in).toHaveBeenCalledWith("metadata->>conversation_id", [FIRST]);
    // The half-made cards are archived, the retry's cards are the deck's cards.
    expect(deleteCard.mock.calls).toEqual([
      ["old-1", 1],
      ["old-2", 3],
    ]);
    expect(addCards).toHaveBeenCalledWith("set-orphan", [{ front: "Q", back: "A" }], { orgId: "org-1" });
    expect(updateSet).toHaveBeenCalledWith("set-orphan", {
      name: "Volcanology",
      topic: "Volcanology",
      difficulty: "medium",
    });
    // Restamped with the retry's identity, so the single-writer dedupe finds it.
    const next = merge.mock.calls[0][1]({ generation: "chat_render_block", conversation_id: FIRST });
    expect(next).toMatchObject({
      source_system: "cx_conversation",
      source_id: RETRY,
      conversation_id: RETRY,
      generation: "surface_save",
      continued_from: [FIRST],
    });
  });

  it("with no deck left by the stopped run, saves as before (one stamped create)", async () => {
    fcSetReturning([]);
    jest
      .spyOn(fcService, "findChatGeneratedSetForConversation")
      .mockResolvedValue({ data: null, error: null });
    const createSetWithCards = jest.spyOn(fcService, "createSetWithCards").mockResolvedValue({
      data: { set: { ...orphan, id: "set-new" }, cards: [] } as unknown as SetWithCards,
      error: null,
    });
    const res = await fcService.createGeneratedSetForConversation(
      RETRY,
      { name: "Volcanology" },
      [{ front: "Q", back: "A" }],
      { continues: [FIRST] },
    );
    expect(res.data?.set.id).toBe("set-new");
    expect(createSetWithCards).toHaveBeenCalledTimes(1);
  });
});
