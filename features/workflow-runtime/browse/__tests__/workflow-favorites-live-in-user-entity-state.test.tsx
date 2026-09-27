/**
 * WORKFLOW STARS LIVE IN platform.user_entity_state (2026-09-27).
 *
 * A favorite is per-PERSON state; `workflow.definition.is_favorite` put it on
 * the owner's row. The column is retired: the list overlays the caller's stars
 * from one `ues_get_bulk`, and the star toggle writes through
 * `favoritesService.setFavorite` — it never sends `is_favorite` to
 * `workflow.definition`.
 *
 * RED against the column-backed code (the toggle called setWorkflowFlag with
 * `{ is_favorite }`, the list trusted the RPC's column), GREEN now.
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

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
jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    rpc: (...a: unknown[]) => rpc(...a),
    schema: () => ({
      from: () => {
        const q: Record<string, unknown> = {};
        q.update = (...a: unknown[]) => {
          update(...a);
          return q;
        };
        q.eq = () => q;
        q.select = async () => ({ data: [{ id: "x" }], error: null });
        return q;
      },
    }),
  },
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
const toastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => toastError(...a), success: jest.fn() },
  recordToast: { success: jest.fn() },
  dismissRecordToasts: jest.fn(),
}));
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));

import { useWorkflowRowActions, type WorkflowRowActionsHost } from "../useWorkflowRowActions";
import { fetchWorkflowBrowsePage } from "../service";
import type { WorkflowBrowseRow } from "../types";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const A = "11111111-1111-4111-8111-111111111111";
const B = "22222222-2222-4222-8222-222222222222";

function mountHost(patchRow: jest.Mock): WorkflowRowActionsHost {
  let host!: WorkflowRowActionsHost;
  function Harness() {
    host = useWorkflowRowActions({ patchRow, removeRow: jest.fn(), refresh: jest.fn() });
    return null;
  }
  const root = createRoot(document.createElement("div"));
  act(() => root.render(<Harness />));
  return host;
}

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });

beforeEach(() => jest.resetAllMocks());

describe("workflow favorite writes go to user_entity_state only", () => {
  it("the star toggle calls favoritesService.setFavorite and never updates workflow.definition", async () => {
    setFavorite.mockResolvedValue({ ok: true, data: null });
    const patchRow = jest.fn();
    const host = mountHost(patchRow);
    act(() => host.toggleFavorite({ id: A, is_favorite: false } as WorkflowBrowseRow));
    await flush();

    expect(setFavorite).toHaveBeenCalledWith("workflow", A, true);
    expect(update).not.toHaveBeenCalled();
    expect(patchRow).toHaveBeenCalledWith(A, { is_favorite: true });
  });

  it("a refusal rolls the star back and says why", async () => {
    setFavorite.mockResolvedValue({ ok: false, error: { code: "42501", message: "ues_set: you cannot open this workflow" } });
    const patchRow = jest.fn();
    const host = mountHost(patchRow);
    act(() => host.toggleFavorite({ id: A, is_favorite: false } as WorkflowBrowseRow));
    await flush();

    expect(patchRow).toHaveBeenLastCalledWith(A, { is_favorite: false });
    expect(toastError).toHaveBeenCalled();
    expect(update).not.toHaveBeenCalled();
  });
});

describe("workflow list reads overlay user_entity_state", () => {
  it("the browse page takes its stars from one ues_get_bulk, never the RPC column", async () => {
    rpc.mockResolvedValue({
      data: [
        { id: A, name: "A", is_favorite: true, total_count: 2 },
        { id: B, name: "B", is_favorite: false, total_count: 2 },
      ],
      error: null,
    });
    getBulk.mockResolvedValue({ ok: true, data: { items: [{ entityId: B, isFavorite: true }] } });

    const page = await fetchWorkflowBrowsePage(
      { scope: { kind: "mine" }, search: "", deep: false, archived: "active", filters: {}, page: 1 } as never,
      { sort: "updated_at", direction: "desc", favoritesFirst: false, pageSize: 50 },
    );

    expect(getBulk).toHaveBeenCalledTimes(1);
    expect(getBulk).toHaveBeenCalledWith("workflow", [A, B]);
    expect(page.rows.find((r) => r.id === A)?.is_favorite).toBe(false);
    expect(page.rows.find((r) => r.id === B)?.is_favorite).toBe(true);
  });
});
