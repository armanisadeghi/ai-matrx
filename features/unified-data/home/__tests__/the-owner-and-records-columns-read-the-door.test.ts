/**
 * THE OWNER AND RECORDS COLUMNS READ THE DOOR (DATA-HOME-3D).
 * Owner: "You" for the viewer's own rows, else `created_by_name`, else none. Records: the cells on
 * screen ask once, batched per organization, and the list never waits (`—` until an answer).
 */
import { ownerLabel } from "../dataHomeColumns";
import { buildDataHomeRows } from "../dataHomeRows";
import { createRecordCountStore } from "../dataHomeRecordCounts";
import { ORGS, row } from "./fixtures";

describe("owner", () => {
  it("says You, then the maker's name, then nothing", () => {
    expect(ownerLabel(row({ name: "Client Intake", mine: true, createdByName: "Dana Reyes" }))).toBe("You");
    expect(ownerLabel(row({ name: "Client Intake", createdByName: "Dana Reyes" }))).toBe("Dana Reyes");
    expect(ownerLabel(row({ name: "Client Intake", createdByName: null }))).toBeNull();
    expect(ownerLabel(row({ name: "Client Intake", createdByName: "  " }))).toBeNull();
  });

  it("is carried from the door's created_by_name onto the row", async () => {
    const answer = {
      tables: [
        {
          table_id: "t1", table_name: "Client Intake", organization_id: ORGS.harbor.id, organization_name: ORGS.harbor.name,
          member: true, visibility: "internal", updated_at: null, mine: false, shared_with_me: false, platform_owned: false,
          kind: "table", created_by: "u-dana", created_by_name: "Dana Reyes",
        },
      ],
      items: [],
      changed_by: [],
    } as never;
    const built = await buildDataHomeRows({
      client: {} as never,
      dataSource: {} as never,
      answer,
    }, [
      {
        id: "tables", title: "Tables",
        read: async () => ({
          ok: true,
          items: [{ id: "t1", title: "Client Intake", kind: "table", tableId: "t1", organizationId: ORGS.harbor.id, organizationName: ORGS.harbor.name, facts: [], href: "/x", tableName: null }],
        }),
      } as never,
    ]);
    expect(built.rows[0]?.createdByName).toBe("Dana Reyes");
  });
});

describe("records, lazily", () => {
  beforeEach(() => jest.useFakeTimers());
  afterEach(() => jest.useRealTimers());

  it("batches the cells on screen into one call per organization and fills them as the answer lands", async () => {
    const ask = jest.fn(async (_org: string, ids: string[]) => ({
      ok: true as const,
      data: ids.map((id, i) => ({ table_id: id, visible_rows: 10 + i })),
    }));
    const store = createRecordCountStore(ask, 100);
    store.want(ORGS.harbor.id, "a");
    store.want(ORGS.harbor.id, "b");
    store.want(ORGS.titanium.id, "c");
    store.want(ORGS.harbor.id, "a"); // already wanted: not asked twice
    expect(store.get("a")).toBeUndefined(); // `—` until the answer lands, never 0
    expect(ask).not.toHaveBeenCalled(); // debounced: the list is never blocked
    jest.advanceTimersByTime(100);
    expect(ask).toHaveBeenCalledTimes(2);
    expect(ask).toHaveBeenCalledWith(ORGS.harbor.id, ["a", "b"]);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(store.get("a")).toBe(10);
    expect(store.get("b")).toBe(11);
    store.want(ORGS.harbor.id, "a");
    jest.advanceTimersByTime(200);
    expect(ask).toHaveBeenCalledTimes(2); // an answered Table is never asked again
  });

  it("keeps — for a refused call or an unanswered Table, and asks again when the row returns", async () => {
    const ask = jest
      .fn()
      .mockResolvedValueOnce({ ok: false, error: { message: "refused" } })
      .mockResolvedValueOnce({ ok: true, data: [] });
    const store = createRecordCountStore(ask, 50);
    store.want(ORGS.harbor.id, "a");
    jest.advanceTimersByTime(50);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(store.get("a")).toBeUndefined();
    store.want(ORGS.harbor.id, "a");
    jest.advanceTimersByTime(50);
    await Promise.resolve(); await Promise.resolve(); await Promise.resolve();
    expect(ask).toHaveBeenCalledTimes(2);
    expect(store.get("a")).toBeUndefined();
  });
});
