/**
 * A singleton window publishes its own overlay id in the instance slot of its
 * address (`?panels=quick_data:quickDataWindow`). Reloading that address must
 * restore the window from its own state — the token is never forwarded into the
 * window's data as if it named a record. Until 2026-10-01 the quick-data
 * hydrator did exactly that, and the reload asked `custom.where_tables_live`
 * for the table "quickDataWindow" (Postgres 22P02, invalid uuid).
 *
 * The guard walks EVERY registered window address, so a new hydrator that
 * forwards its raw id fails here by name.
 */
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";
import {
  getRestorableUuid,
  initUrlHydration,
} from "../url-sync/initUrlHydration";
import { getHydrator } from "../url-sync/UrlPanelRegistry";

jest.mock(
  "@/features/agents/redux/execution-system/thunks/load-conversation.thunk",
  () => ({
    loadConversation: jest.fn((args: unknown) => ({
      type: "test/loadConversation",
      payload: args,
    })),
  }),
);
jest.mock(
  "@/features/agents/runtime-reconnect/follow-what-is-still-in-flight",
  () => ({ followWhatIsStillInFlight: jest.fn() }),
);

function valuesOf(value: unknown, out: unknown[] = []): unknown[] {
  if (value && typeof value === "object") {
    for (const v of Object.values(value as Record<string, unknown>)) valuesOf(v, out);
  } else out.push(value);
  return out;
}

describe("a window identity is never a resource id", () => {
  beforeAll(() => initUrlHydration());

  it("reloading `quick_data:quickDataWindow` opens the window with no table selected", () => {
    const dispatch = jest.fn();
    getHydrator("quick_data")?.(dispatch, "quickDataWindow", {});
    const action = dispatch.mock.calls[0]?.[0] as { payload: { data: unknown } };
    expect(action.payload.data).toBeNull();
  });

  it("a real table id still deep-links", () => {
    const id = "522c3ff1-7229-439c-be00-5b20492cc328";
    const dispatch = jest.fn();
    getHydrator("quick_data")?.(dispatch, id, {});
    const action = dispatch.mock.calls[0]?.[0] as { payload: { data: unknown } };
    expect(action.payload.data).toEqual({ selectedTable: id });
  });

  it("no window forwards its own overlay id into its data", () => {
    const offenders: string[] = [];
    for (const entry of ALL_WINDOW_STATIC_METADATA) {
      const key = entry.urlSync?.key;
      const hydrator = key ? getHydrator(key) : undefined;
      if (!key || !hydrator) continue;
      const dispatch = jest.fn();
      hydrator(dispatch, entry.overlayId, {});
      for (const [action] of dispatch.mock.calls) {
        const data = (action as { payload?: { data?: unknown } })?.payload?.data;
        if (valuesOf(data).includes(entry.overlayId)) {
          offenders.push(`${key} -> ${entry.overlayId}`);
        }
      }
    }
    expect(offenders).toEqual([]);
  });

  it("a non-uuid never reaches a uuid door", () => {
    expect(getRestorableUuid("quickDataWindow", "quickDataWindow")).toBeNull();
    expect(getRestorableUuid("not-a-uuid")).toBeNull();
  });
});
