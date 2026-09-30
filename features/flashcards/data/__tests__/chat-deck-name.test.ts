/**
 * The deck a chat flashcard set is saved as gets a real name.
 *
 * Real case (conversation 10d796b4…, 2026-09-30): the set arrived titled with
 * the platform's placeholder "Flashcards" and `education.fc_set.name` became
 * "Flashcards". The adapter must name the deck after the request that asked
 * for it — and must leave a real title exactly as written.
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

const REQUEST =
  "Make flashcards for all of the polyatomic ions covered in these notes, including all of the ones that are specifically mentioned.";

/**
 * Chainable PostgREST mock: a list read resolves the rows registered for its
 * table; `maybeSingle()` resolves the table's first row.
 */
function tablesReturning(rowsByTable: Record<string, unknown[]>) {
  return jest.fn(() => {
    let table = "";
    const chain: Record<string, unknown> = {};
    for (const m of ["select", "eq", "is", "in", "neq", "lt", "order", "limit"]) {
      chain[m] = jest.fn(() => chain);
    }
    chain.from = jest.fn((name: string) => {
      table = name;
      return chain;
    });
    chain.maybeSingle = jest.fn(async () => ({
      data: (rowsByTable[table] ?? [])[0] ?? null,
      error: null,
    }));
    chain.then = (resolve: (v: unknown) => unknown) =>
      resolve({ data: rowsByTable[table] ?? [], error: null });
    return chain;
  });
}

function chatWithRequest() {
  (supabase.schema as jest.Mock).mockImplementation(
    tablesReturning({
      fc_set: [],
      canvas_items: [],
      // One row serves both reads: the assistant message's position, and the
      // user message before it.
      message: [
        {
          conversation_id: "conv-1",
          position: 5,
          content: [{ type: "text", text: REQUEST }],
        },
      ],
    }),
  );
}

function mockCreate() {
  const created = {
    id: "set-new",
    name: "",
    organization_id: "org-1",
    metadata: {},
  } as unknown as FcSetRow;
  jest
    .spyOn(fcService, "findSurfaceSavedSetForConversation")
    .mockResolvedValue({ data: null, error: null });
  return jest.spyOn(fcService, "createSetWithCards").mockResolvedValue({
    data: { set: created, cards: [] } as unknown as SetWithCards,
    error: null,
  });
}

function polyatomicSet(title: string) {
  return {
    artifactId: "art-1",
    canvasType: "flashcards",
    title,
    rawContent: "",
    structured: {
      __kind: "flashcard_set",
      title,
      cards: [
        { __kind: "flashcard", front: "Polyatomic Ion", back: "A charged group of atoms." },
        { __kind: "flashcard", front: "Nitrate", back: "NO3-" },
      ],
    },
    source: { system: "cx_message", id: "msg-assistant" },
    conversationId: "conv-1",
    artifactIndex: 1,
  } as never;
}

afterEach(() => jest.restoreAllMocks());

describe("FLASHCARDS_CANONICAL_ADAPTER.onMaterialize — deck name", () => {
  it('names a placeholder-titled set after the request, not "Flashcards"', async () => {
    chatWithRequest();
    const createSetWithCards = mockCreate();

    await FLASHCARDS_CANONICAL_ADAPTER.onMaterialize?.(polyatomicSet("Flashcards"));

    expect(createSetWithCards).toHaveBeenCalledTimes(1);
    expect(createSetWithCards.mock.calls[0][0].name).toBe("Polyatomic Ions");
  });

  it("keeps a real title exactly as written", async () => {
    chatWithRequest();
    const createSetWithCards = mockCreate();

    await FLASHCARDS_CANONICAL_ADAPTER.onMaterialize?.(
      polyatomicSet("Ions I keep forgetting"),
    );

    expect(createSetWithCards.mock.calls[0][0].name).toBe("Ions I keep forgetting");
  });
});
