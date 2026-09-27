/**
 * AGENT STARS LIVE IN platform.user_entity_state (2026-09-27).
 *
 * A favorite is per-PERSON state. It lived twice — `agent.definition.is_favorite`
 * (one flag on the owner's row, so a shared agent could never be starred) and
 * `platform.user_entity_state` — and the two drifted. The column is retired:
 * every read overlays the caller's stars from one `ues_get_bulk`, every write
 * goes through `favoritesService.setFavorite`, and nothing sends `is_favorite`
 * to `agent.definition` again.
 *
 * RED against the column-backed code (the toggle UPDATEd agent.definition, the
 * list trusted the RPC's column, the converters mapped is_favorite), GREEN now.
 */

const getBulk = jest.fn();
const setFavorite = jest.fn();
jest.mock("@/features/scopes/service/favoritesService", () => ({
  favoritesService: {
    getBulk: (...a: unknown[]) => getBulk(...a),
    setFavorite: (...a: unknown[]) => setFavorite(...a),
  },
}));

const update = jest.fn();
const rpc = jest.fn();
const schema = jest.fn();
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    schema: (...a: unknown[]) => schema(...a),
  },
}));
jest.mock("@/utils/supabase/webDb", () => ({
  requireAuthenticatedSupabaseSession: jest.fn(async () => undefined),
}));

import { configureStore } from "@reduxjs/toolkit";
import { createSlimRootReducer } from "@/lib/redux/rootReducer";
import { mergePartialAgent } from "@/features/agents/redux/agent-definition/slice";
import { saveAgentField } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import {
  agentDefinitionToUpdate,
  dbRowToAgentDefinition,
} from "@/features/agents/redux/agent-definition/converters";
import { fetchAgentBrowsePage } from "../service";

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function store() {
  const s = configureStore({
    reducer: createSlimRootReducer(),
    middleware: (d) => d({ serializableCheck: false }),
  });
  s.dispatch(mergePartialAgent({ id: A, name: "Agent A", isFavorite: false }));
  return s;
}

beforeEach(() => {
  jest.resetAllMocks();
  const q: Record<string, unknown> = {};
  q.update = (...a: unknown[]) => {
    update(...a);
    return q;
  };
  q.eq = () => q;
  q.select = () => q;
  q.single = async () => ({ data: { version: 2, updated_at: "now" }, error: null });
  schema.mockReturnValue({ from: () => q });
});

describe("agent favorite writes go to user_entity_state only", () => {
  it("the star toggle calls favoritesService.setFavorite and never updates agent.definition", async () => {
    setFavorite.mockResolvedValue({ ok: true, data: null });
    const s = store();
    await s.dispatch(saveAgentField({ agentId: A, field: "isFavorite", value: true })).unwrap();

    expect(setFavorite).toHaveBeenCalledWith("agent", A, true);
    expect(update).not.toHaveBeenCalled();
    expect(selectAgentById(s.getState(), A)?.isFavorite).toBe(true);
    // Not a dirty field: the next full save must not carry it back to the table.
    expect(selectAgentById(s.getState(), A)?._dirtyFields?.isFavorite).toBeFalsy();
  });

  it("a refusal rolls the star back and is said in words", async () => {
    setFavorite.mockResolvedValue({
      ok: false,
      error: { code: "42501", message: "ues_set: you cannot open this agent" },
    });
    const s = store();
    await expect(
      s.dispatch(saveAgentField({ agentId: A, field: "isFavorite", value: true })).unwrap(),
    ).rejects.toMatchObject({ message: expect.stringMatching(/^Could not add this agent to your favorites\./) });
    expect(selectAgentById(s.getState(), A)?.isFavorite).toBe(false);
    expect(update).not.toHaveBeenCalled();
  });

  it("the update converter never sends is_favorite", () => {
    expect(agentDefinitionToUpdate({ isFavorite: true, name: "x" })).not.toHaveProperty("is_favorite");
  });

  it("a table row's is_favorite column is never read as the star", () => {
    const row = { id: A, name: "A", tags: [], is_favorite: true, messages: [], tools: [] };
    expect(dbRowToAgentDefinition(row as never).isFavorite).toBe(false);
  });
});

describe("agent list reads overlay user_entity_state", () => {
  it("the browse page takes its stars from one ues_get_bulk, never the RPC column", async () => {
    rpc.mockResolvedValue({
      data: [
        { id: A, name: "A", is_favorite: true, total_count: 2 },
        { id: B, name: "B", is_favorite: false, total_count: 2 },
      ],
      error: null,
    });
    getBulk.mockResolvedValue({
      ok: true,
      data: { items: [{ entityId: B, isFavorite: true }] },
    });

    const page = await fetchAgentBrowsePage(
      { scope: { kind: "mine" }, search: "", deep: false, archived: "active", filters: {}, page: 1 } as never,
      { sort: "updated_at", direction: "desc", favoritesFirst: false, pageSize: 50 },
    );

    expect(getBulk).toHaveBeenCalledTimes(1);
    expect(getBulk).toHaveBeenCalledWith("agent", [A, B]);
    expect(page.rows.find((r) => r.id === A)?.is_favorite).toBe(false);
    expect(page.rows.find((r) => r.id === B)?.is_favorite).toBe(true);
    expect(page.total).toBe(2);
  });
});
