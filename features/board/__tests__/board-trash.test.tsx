// Deleted boards: the /board Archived filter, Restore through Trash's one door, 
// board per person after a restore. Each case fails when the behaviour it names breaks.

type Call = [method: string, ...args: unknown[]];
type Responder = (calls: Call[]) => { data: unknown; error: unknown };

const queries: Call[][] = [];
let respond: Responder = () => ({ data: null, error: null });

/** A PostgREST builder stand-in: records every chained call, answers when awaited. */
function builder(): unknown {
  const calls: Call[] = [];
  queries.push(calls);
  const target = {
    then: (ok: (v: unknown) => unknown, bad: (e: unknown) => unknown) =>
      Promise.resolve(respond(calls)).then(ok, bad),
  };
  const proxy: unknown = new Proxy(target, {
    get(t, prop) {
      if (prop === "then") return t.then;
      return (...args: unknown[]) => {
        calls.push([String(prop), ...args]);
        if (prop === "maybeSingle" || prop === "single") {
          return { then: t.then };
        }
        return proxy;
      };
    },
  });
  return proxy;
}

jest.mock("@/utils/supabase/client", () => ({
  supabase: { schema: () => ({ from: () => builder() }), rpc: jest.fn() },
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: jest.fn(),
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "u1", getUserId: () => "u1" }));
const restoreFromTrash = jest.fn<Promise<void>, [string, string]>(async () => {});
jest.mock("@/features/trash/service", () => ({
  restoreFromTrash: (token: string, id: string) => restoreFromTrash(token, id),
}));

import { BOARD_TOKEN, boardRowHref, pickLastOpenedId, restoreBoard } from "../persistence/boardsService";
import { createBoardListService } from "../boards/listService";
import { deleteConsequence } from "../boards/useBoardRowActions";
import { boardListConfig } from "../boards/listConfig";
import type { BoardListRow } from "../persistence/boardsService";

const has = (calls: Call[], method: string, ...args: unknown[]) =>
  calls.some(([m, ...a]) => m === method && JSON.stringify(a) === JSON.stringify(args));

beforeEach(() => {
  queries.length = 0;
  restoreFromTrash.mockClear();
});

describe("pickLastOpenedId — the board \"add to my board\" opens", () => {
  const r = (id: string, opened: string | null, updated: string, deleted: string | null = null, settings: object = {}) => ({
    id,
    updated_at: updated,
    last_opened_at: opened,
    deleted_at: deleted,
    settings,
  });

  it("is the most recently OPENED live board, whatever was edited last", () => {
    expect(pickLastOpenedId([r("a", "2026-09-01", "2026-09-30"), r("b", "2026-09-10", "2026-09-02"), r("c", null, "2026-08-01")])).toBe("b");
  });

  it("a board never opened counts by its last edit", () => {
    expect(pickLastOpenedId([r("a", "2026-09-01", "2026-09-01"), r("n", null, "2026-09-20")])).toBe("n");
  });

  it("skips deleted boards and a meeting's own board, and is null when none is left", () => {
    expect(pickLastOpenedId([r("gone", "2026-09-20", "2026-09-20", "2026-09-21"), r("m", "2026-09-19", "2026-09-19", null, { meeting_id: "m1" }), r("ok", "2026-09-01", "2026-09-01")])).toBe("ok");
    expect(pickLastOpenedId([r("gone", "2026-09-20", "2026-09-20", "2026-09-21")])).toBeNull();
    expect(pickLastOpenedId([])).toBeNull();
  });

  it("a board an older build flagged home is an ordinary board", () => {
    expect(pickLastOpenedId([r("h", "2026-09-20", "2026-09-20", null, { home: true }), r("o", "2026-09-01", "2026-09-01")])).toBe("h");
  });
});

describe("restoreBoard", () => {
  it("restores through Trash's one door (entity_undelete via restoreFromTrash)", async () => {
    respond = (calls) =>
      has(calls, "eq", "id", "b1") && has(calls, "maybeSingle")
        ? { data: { id: "b1", settings: {}, deleted_at: "2026-09-01" }, error: null }
        : { data: [], error: null };
    await expect(restoreBoard("b1")).resolves.toEqual({ id: "b1" });
    expect(restoreFromTrash).toHaveBeenCalledWith(BOARD_TOKEN, "b1");
    expect(BOARD_TOKEN).toBe("board");
  });

  it("a deleted board an older build flagged home comes back as an ordinary board, its settings untouched", async () => {
    respond = (calls) =>
      has(calls, "maybeSingle")
        ? { data: { id: "h1", settings: { home: true }, deleted_at: "2026-09-01" }, error: null }
        : { data: [], error: null };
    await expect(restoreBoard("h1")).resolves.toEqual({ id: "h1" });
    expect(queries.some((q) => q.some(([m]) => m === "update"))).toBe(false);
    expect(restoreFromTrash).toHaveBeenCalledWith(BOARD_TOKEN, "h1");
  });

  it("says the door's sentence when the restore is refused", async () => {
    respond = (calls) =>
      has(calls, "maybeSingle")
        ? { data: { id: "b1", settings: {}, deleted_at: "2026-09-01" }, error: null }
        : { data: [], error: null };
    restoreFromTrash.mockImplementationOnce(async () => {
      throw new Error("Restore was refused — you may no longer have edit access.");
    });
    await expect(restoreBoard("b1")).rejects.toThrow("Restore was refused");
  });
});

describe("/board Archived filter", () => {
  const row = (id: string, archived: boolean): BoardListRow => ({
    id,
    title: id,
    organization_id: "o1",
    archived,
    tile_count: 0,
    created_at: "2026-09-01",
    updated_at: "2026-09-01",
    last_opened_at: null,
  });
  const query = { scope: { kind: "mine" as const }, orgId: null, search: "", deep: false, filters: {}, page: 1 };
  const sort = { sort: "updated_at", direction: "desc" as const, favoritesFirst: false, pageSize: 25 };

  it("reads with the filter's value, so the default hides deleted boards and Archived shows them", async () => {
    const asked: string[] = [];
    const service = createBoardListService(async (archived) => {
      asked.push(archived);
      return archived === "archived" ? [row("gone", true)] : [row("live", false)];
    });
    const [active, archived] = await Promise.all([
      service.fetchPage({ ...query, archived: "active" }, sort),
      service.fetchPage({ ...query, archived: "archived" }, sort),
    ]);
    expect(asked.sort()).toEqual(["active", "archived"]);
    expect(active.rows.map((r) => r.id)).toEqual(["live"]);
    expect(archived.rows.map((r) => r.id)).toEqual(["gone"]);
  });

  it("the list carries the canonical Archived section, and a deleted row opens nowhere and cannot be renamed", async () => {
    expect(boardListConfig.supportsArchived).not.toBe(false);
    expect(boardListConfig.door?.hrefFor?.(row("gone", true))).toBeUndefined();
    expect(boardListConfig.door?.hrefFor?.(row("live", false))).toBe("/board/live");
    expect(boardRowHref({ id: "h", archived: false })).toBe("/board/h");
    await expect(boardListConfig.edit!.save(row("gone", true), { title: "x" })).rejects.toThrow("This board is deleted.");
  });

  it("the delete confirm says the board can be restored", () => {
    expect(deleteConsequence({ title: "Vendor review" })).toBe(
      'This moves "Vendor review" to Trash. It leaves this list, and you can restore it from Trash.',
    );
  });
});
