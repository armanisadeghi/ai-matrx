/**
 * D-WP3 single-writer contract for agent-generated flashcard decks.
 *
 * A generation surface (from-topic / from-source / convert deck) and the
 * stream's render-block materialization (FLASHCARDS_CANONICAL_ADAPTER) are two
 * independent writers for the SAME deck. These tests pin the contract that
 * keeps them to ONE education.fc_set row, keyed by the headless run's
 * conversation id:
 *
 *   1. Surface save, adapter already won  → ADOPT the adapter's set (update
 *      name/topic/difficulty), never create a second one.
 *   2. Surface save, no adapter set yet   → create ONE set stamped
 *      metadata.source_system="cx_conversation" / source_id=<cid>.
 *   3. Adapter, surface already saved     → LINK to the surface's set,
 *      never create a twin.
 */

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: jest.fn(), rpc: jest.fn() },
}));
jest.mock("@/features/scopes/service/associationsService", () => ({
  associationsService: { add: jest.fn() },
}));
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: jest.fn(async (explicit?: string) => explicit ?? "org-1"),
}));

import { supabase } from "@/utils/supabase/client";
import { fcService } from "../fcService";
import { FLASHCARDS_CANONICAL_ADAPTER } from "@/features/canvas/artifact-types/persistence/flashcards-canonical-adapter";
import type { FcSetRow, SetWithCards } from "../types";

const CID = "conv-123";

const adapterSet = {
  id: "set-adapter",
  name: "Flashcards",
  organization_id: "org-1",
  metadata: {
    source_system: "cx_message",
    source_id: "msg-1",
    conversation_id: CID,
    generation: "chat_render_block",
  },
} as unknown as FcSetRow;

const surfaceSet = {
  id: "set-surface",
  name: "Volcanology",
  organization_id: "org-1",
  metadata: {
    source_system: "cx_conversation",
    source_id: CID,
    conversation_id: CID,
    generation: "surface_save",
  },
} as unknown as FcSetRow;

/** Chainable PostgREST query mock whose maybeSingle resolves per-call. */
function queryReturning(rows: Array<unknown | null>) {
  let call = 0;
  const chain: Record<string, jest.Mock> = {};
  for (const m of ["from", "select", "eq", "is", "limit"]) {
    chain[m] = jest.fn(() => chain);
  }
  chain.maybeSingle = jest.fn(async () => ({
    data: rows[Math.min(call++, rows.length - 1)] ?? null,
    error: null,
  }));
  return chain;
}

afterEach(() => jest.restoreAllMocks());

describe("fcService.createGeneratedSetForConversation (surface save)", () => {
  it("adopts the adapter's set when the adapter won the race — no second create", async () => {
    jest
      .spyOn(fcService, "findChatGeneratedSetForConversation")
      .mockResolvedValue({ data: adapterSet, error: null });
    const updateSet = jest
      .spyOn(fcService, "updateSet")
      .mockResolvedValue({ data: adapterSet, error: null });
    jest.spyOn(fcService, "getSetWithCards").mockResolvedValue({
      data: { set: adapterSet, cards: [] } as unknown as SetWithCards,
      error: null,
    });
    const createSetWithCards = jest.spyOn(fcService, "createSetWithCards");

    const res = await fcService.createGeneratedSetForConversation(
      CID,
      { name: "Volcanology", topic: "Volcanology", difficulty: "medium" },
      [{ front: "Q", back: "A" }],
    );

    expect(res.data?.set.id).toBe("set-adapter");
    expect(createSetWithCards).not.toHaveBeenCalled();
    expect(updateSet).toHaveBeenCalledWith("set-adapter", {
      name: "Volcanology",
      topic: "Volcanology",
      difficulty: "medium",
    });
  });

  it("creates ONE set stamped with the run's cx_conversation identity when no adapter set exists", async () => {
    jest
      .spyOn(fcService, "findChatGeneratedSetForConversation")
      .mockResolvedValue({ data: null, error: null });
    const createSetWithCards = jest
      .spyOn(fcService, "createSetWithCards")
      .mockResolvedValue({
        data: { set: surfaceSet, cards: [] } as unknown as SetWithCards,
        error: null,
      });

    const res = await fcService.createGeneratedSetForConversation(
      CID,
      { name: "Volcanology", topic: "Volcanology", difficulty: "medium" },
      [{ front: "Q", back: "A" }],
    );

    expect(res.data?.set.id).toBe("set-surface");
    expect(createSetWithCards).toHaveBeenCalledTimes(1);
    const input = createSetWithCards.mock.calls[0][0];
    expect(input.metadata).toMatchObject({
      source_system: "cx_conversation",
      source_id: CID,
      conversation_id: CID,
      generation: "surface_save",
    });
  });

  it("falls through to a plain stamped create when the run has no conversation id", async () => {
    const find = jest.spyOn(fcService, "findChatGeneratedSetForConversation");
    const createSetWithCards = jest
      .spyOn(fcService, "createSetWithCards")
      .mockResolvedValue({
        data: { set: surfaceSet, cards: [] } as unknown as SetWithCards,
        error: null,
      });

    await fcService.createGeneratedSetForConversation(
      null,
      { name: "Deck" },
      [],
    );

    expect(find).not.toHaveBeenCalled();
    const input = createSetWithCards.mock.calls[0][0];
    expect(input.metadata).toMatchObject({ generation: "surface_save" });
    expect(input.metadata).not.toHaveProperty("source_system");
  });
});

describe("FLASHCARDS_CANONICAL_ADAPTER.onMaterialize (chat materialization)", () => {
  it("links to the surface-saved set for the conversation instead of creating a twin", async () => {
    // The adapter's two direct source-dedupe queries (by source_id, then the
    // legacy source_message_id fallback) find nothing.
    (supabase.schema as jest.Mock).mockReturnValue(
      queryReturning([null, null]),
    );
    jest
      .spyOn(fcService, "findSurfaceSavedSetForConversation")
      .mockResolvedValue({ data: surfaceSet, error: null });
    const createSetWithCards = jest.spyOn(fcService, "createSetWithCards");

    const link = await FLASHCARDS_CANONICAL_ADAPTER.onMaterialize?.({
      artifactId: "art-1",
      canvasType: "flashcards",
      title: "Volcanology",
      rawContent: JSON.stringify({
        __kind: "flashcard_set",
        cards: [{ front: "Q", back: "A" }],
      }),
      structured: null,
      source: { system: "cx_message", id: "msg-1" },
      conversationId: CID,
    } as never);

    expect(link).toEqual({ externalSystem: "fc_set", externalId: "set-surface" });
    expect(createSetWithCards).not.toHaveBeenCalled();
  });
});
