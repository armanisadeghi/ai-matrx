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
jest.mock("@/lib/organizations/ensureOrgId", () => ({
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

/**
 * Chainable PostgREST mock for list reads: awaiting any chain resolves the rows
 * registered for the table it was built from (`from(table)`).
 */
function tablesReturning(rowsByTable: Record<string, unknown[]>) {
  return jest.fn(() => {
    let table = "";
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "neq", "order", "limit"]) {
      chain[m] = jest.fn(() => chain);
    }
    chain.from = jest.fn((name: string) => {
      table = name;
      return chain;
    });
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rowsByTable[table] ?? [], error: null });
    return chain;
  });
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
    (supabase.schema as jest.Mock).mockImplementation(
      tablesReturning({ fc_set: [], canvas_items: [] }),
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

describe("FLASHCARDS_CANONICAL_ADAPTER.onMaterialize — several sets in one message", () => {
  const message = { system: "cx_message", id: "msg-7" } as const;
  const baseInfo = {
    canvasType: "flashcards",
    title: "Polyatomic ions",
    rawContent: "",
    structured: {
      __kind: "flashcard_set",
      title: "Polyatomic ions",
      cards: [{ front: "Nitrate", back: "NO3-" }],
    },
    source: message,
    conversationId: null,
  };
  const created = {
    id: "set-new",
    name: "Polyatomic ions",
    organization_id: "org-1",
    metadata: {},
  } as unknown as FcSetRow;

  function mockCreate() {
    return jest.spyOn(fcService, "createSetWithCards").mockResolvedValue({
      data: { set: created, cards: [] } as unknown as SetWithCards,
      error: null,
    });
  }

  it("gives the second set in a message its own deck instead of the first set's", async () => {
    (supabase.schema as jest.Mock).mockImplementation(
      tablesReturning({
        fc_set: [
          { id: "set-first", metadata: { source_id: "msg-7", source_index: 1 } },
        ],
        canvas_items: [],
      }),
    );
    const createSetWithCards = mockCreate();

    const link = await FLASHCARDS_CANONICAL_ADAPTER.onMaterialize?.({
      ...baseInfo,
      artifactId: "art-2",
      artifactIndex: 2,
    } as never);

    expect(link).toEqual({ externalSystem: "fc_set", externalId: "set-new" });
    expect(createSetWithCards).toHaveBeenCalledTimes(1);
    expect(createSetWithCards.mock.calls[0][0].metadata).toMatchObject({
      source_id: "msg-7",
      source_index: 2,
    });
  });

  it("re-materializing the same artifact reuses its own deck", async () => {
    (supabase.schema as jest.Mock).mockImplementation(
      tablesReturning({
        fc_set: [
          { id: "set-first", metadata: { source_index: 1 } },
          { id: "set-second", metadata: { source_index: 2 } },
        ],
        canvas_items: [],
      }),
    );
    const createSetWithCards = mockCreate();

    const link = await FLASHCARDS_CANONICAL_ADAPTER.onMaterialize?.({
      ...baseInfo,
      artifactId: "art-2",
      artifactIndex: 2,
    } as never);

    expect(link).toEqual({ externalSystem: "fc_set", externalId: "set-second" });
    expect(createSetWithCards).not.toHaveBeenCalled();
  });

  it("never hands a pre-index deck that another artifact already links to a second artifact", async () => {
    (supabase.schema as jest.Mock).mockImplementation(
      tablesReturning({
        fc_set: [{ id: "set-legacy", metadata: { source_id: "msg-7" } }],
        canvas_items: [{ id: "art-1", external_id: "set-legacy" }],
      }),
    );
    const createSetWithCards = mockCreate();

    const link = await FLASHCARDS_CANONICAL_ADAPTER.onMaterialize?.({
      ...baseInfo,
      artifactId: "art-2",
      artifactIndex: 2,
    } as never);

    expect(link).toEqual({ externalSystem: "fc_set", externalId: "set-new" });
    expect(createSetWithCards).toHaveBeenCalledTimes(1);
  });

  it("still reuses an unclaimed pre-index deck (reconcile stays idempotent)", async () => {
    (supabase.schema as jest.Mock).mockImplementation(
      tablesReturning({
        fc_set: [{ id: "set-legacy", metadata: { source_id: "msg-7" } }],
        canvas_items: [],
      }),
    );
    const createSetWithCards = mockCreate();

    const link = await FLASHCARDS_CANONICAL_ADAPTER.onMaterialize?.({
      ...baseInfo,
      artifactId: "art-1",
      artifactIndex: 1,
    } as never);

    expect(link).toEqual({ externalSystem: "fc_set", externalId: "set-legacy" });
    expect(createSetWithCards).not.toHaveBeenCalled();
  });
});
