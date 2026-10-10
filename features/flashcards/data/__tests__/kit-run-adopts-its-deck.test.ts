/**
 * GUARD — a kit run whose tab died after the deck was created adopts that deck.
 *
 * The bug (2026-10-09): the kit-creation page hot-reloaded between the deck's
 * create and its kit member edge; the deck (fc_set 497aca32…) was left outside
 * its kit, and a resumed run would have made a second one. A segmented run has
 * no single conversation, so its identity is the plan's run key, stamped on the
 * deck; the resumed run finds the deck by it, and the generator then writes the
 * (idempotent) kit edge.
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

const KEY = "kit-1:1000|deck:abc:3:10";
const CARDS = [
  { front: "Q1", back: "A1" },
  { front: "Q2", back: "A2" },
];
const made = { id: "set-made", name: "Biology", organization_id: "org-1", metadata: { run_key: KEY } } as unknown as FcSetRow;

function fcSetReturning(rows: unknown[]) {
  const chain: Record<string, unknown> = {};
  for (const m of ["from", "select", "eq", "is", "in", "neq", "order", "limit"]) chain[m] = jest.fn(() => chain);
  chain.then = (resolve: (v: unknown) => unknown) => resolve({ data: rows, error: null });
  (supabase.schema as jest.Mock).mockReturnValue(chain);
  return chain;
}

afterEach(() => jest.restoreAllMocks());

describe("a resumed kit run adopts the deck it already made", () => {
  it("returns the existing deck and creates nothing", async () => {
    const chain = fcSetReturning([made]);
    jest.spyOn(fcService, "getSetWithCards").mockResolvedValue({
      data: { set: made, cards: [{ id: "c1" }, { id: "c2" }] } as unknown as SetWithCards,
      error: null,
    });
    const create = jest.spyOn(fcService, "createSetWithCards");
    const res = await fcService.createGeneratedSetForConversation(null, { name: "Biology" }, CARDS, { runKey: KEY });
    expect(res.data?.set.id).toBe("set-made");
    expect(create).not.toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith("metadata->>run_key", KEY);
  });

  it("finishes a deck whose create stopped halfway", async () => {
    fcSetReturning([made]);
    jest.spyOn(fcService, "getSetWithCards").mockResolvedValue({
      data: { set: made, cards: [{ id: "c1", version: 1 }] } as unknown as SetWithCards,
      error: null,
    });
    const cont = jest.spyOn(fcService, "continueGeneratedSet").mockResolvedValue({
      data: { set: made, cards: [] } as unknown as SetWithCards,
      error: null,
    });
    const create = jest.spyOn(fcService, "createSetWithCards");
    await fcService.createGeneratedSetForConversation(null, { name: "Biology" }, CARDS, { runKey: KEY });
    expect(cont).toHaveBeenCalledTimes(1);
    expect(create).not.toHaveBeenCalled();
  });

  it("first time: creates the deck stamped with the run key", async () => {
    fcSetReturning([]);
    const create = jest.spyOn(fcService, "createSetWithCards").mockResolvedValue({
      data: { set: made, cards: [] } as unknown as SetWithCards,
      error: null,
    });
    await fcService.createGeneratedSetForConversation(null, { name: "Biology" }, CARDS, { runKey: KEY });
    expect(create.mock.calls[0][0].metadata).toMatchObject({ run_key: KEY, generation: "surface_save" });
  });
});
