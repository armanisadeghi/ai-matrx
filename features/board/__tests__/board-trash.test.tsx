// Deleted boards: the /board/all Archived filter, Restore through Trash's one door, and ONE home
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
jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationContext: jest.fn(),
  isOrganizationSelectionCancelled: () => false,
}));
jest.mock("@/utils/auth/getUserId", () => ({ requireUserId: () => "u1", getUserId: () => "u1" }));
const restoreFromTrash = jest.fn<Promise<void>, [string, string]>(async () => {});
jest.mock("@/features/trash/service", () => ({
  restoreFromTrash: (token: string, id: string) => restoreFromTrash(token, id),
}));

import { BOARD_TOKEN, boardRowHref, pickHomeId, restoreBoard } from "../persistence/boardsService";
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

describe("pickHomeId — one home board per person", () => {
  const r = (id: string, created: string, home: boolean, deleted: string | null = null) => ({
    id,
    created_at: created,
    deleted_at: deleted,
    settings: home ? { home: true } : {},
  });

  it("is the oldest LIVE flagged row, the same row getHomeBoard opens", () => {
    expect(pickHomeId([r("new", "2026-09-02", true), r("old", "2026-09-01", true), r("x", "2026-08-01", false)])).toBe("old");
  });

  it("never names a deleted row, and is null when no live row is flagged", () => {
    expect(pickHomeId([r("gone", "2026-08-01", true, "2026-09-01"), r("live", "2026-09-01", true)])).toBe("live");
    expect(pickHomeId([r("gone", "2026-08-01", true, "2026-09-01")])).toBeNull();
  });
});

describe("restoreBoard", () => {
  it("restores through Trash's one door (entity_undelete via restoreFromTrash)", async () => {
    respond = (calls) =>
      has(calls, "eq", "id", "b1") && has(calls, "maybeSingle")
        ? { data: { id: "b1", settings: {}, deleted_at: "2026-09-01" }, error: null }
        : { data: [], error: null };
    await expect(restoreBoard("b1")).resolves.toEqual({ id: "b1", is_home: false });
    expect(restoreFromTrash).toHaveBeenCalledWith(BOARD_TOKEN, "b1");
    expect(BOARD_TOKEN).toBe("board");
  });

  it("a deleted HOME board restored while another home is live loses its flag BEFORE it comes back", async () => {
    const order: string[] = [];
    respond = (calls) => {
      if (has(calls, "maybeSingle")) {
        return { data: { id: "h1", settings: { home: true, theme: "dark" }, deleted_at: "2026-09-01" }, error: null };
      }
      if (has(calls, "neq", "id", "h1")) return { data: [{ id: "h2" }], error: null };
      if (calls.some(([m]) => m === "update")) {
        order.push("unflag");
        return { data: [{ id: "h1" }], error: null };
      }
      return { data: [], error: null };
    };
    restoreFromTrash.mockImplementationOnce(async () => {
      order.push("restore");
    });
    await expect(restoreBoard("h1")).resolves.toEqual({ id: "h1", is_home: false });
    const update = queries.find((q) => q.some(([m]) => m === "update"));
    expect(update?.find(([m]) => m === "update")?.[1]).toEqual({ settings: { theme: "dark" } });
    expect(order).toEqual(["unflag", "restore"]);
  });

  it("a deleted home board with no other live home comes back as the home", async () => {
    respond = (calls) =>
      has(calls, "maybeSingle")
        ? { data: { id: "h1", settings: { home: true }, deleted_at: "2026-09-01" }, error: null }
        : { data: [], error: null };
    await expect(restoreBoard("h1")).resolves.toEqual({ id: "h1", is_home: true });
    expect(queries.some((q) => q.some(([m]) => m === "update"))).toBe(false);
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

describe("/board/all Archived filter", () => {
  const row = (id: string, archived: boolean): BoardListRow => ({
    id,
    title: id,
    organization_id: "o1",
    is_home: false,
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
    expect(boardRowHref({ id: "h", is_home: true, archived: false })).toBe("/board");
    await expect(boardListConfig.edit!.save(row("gone", true), { title: "x" })).rejects.toThrow("This board is deleted.");
  });

  it("the delete confirm says the board can be restored", () => {
    expect(deleteConsequence({ title: "Vendor review" })).toBe(
      'This moves "Vendor review" to Trash. It leaves this list, and you can restore it from Trash.',
    );
  });
});
