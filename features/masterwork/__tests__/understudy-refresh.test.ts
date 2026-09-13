// features/masterwork/__tests__/understudy-refresh.test.ts
//
// THE STAND-IN NEVER LIES ABOUT WHAT IT KNOWS (trial 12, 2026-09-12) — the two
// ways the Understudy card could still lie after the ledger landed:
//
//   1. A rebuild that ACTUALLY SUCCEEDED left the amber "this stand-in is
//      behind your rules" banner up, because `behind` compared the cached
//      workflow row (loaded before the save) with the bumped Rulebook version
//      and nothing reloaded the row. The success payload already carries the
//      version it built, so the card must believe it.
//   2. The staleness ledger had no generation token, so two in-flight pokes —
//      the NORMAL case here, the review wizard saves once per rule (95 pokes
//      in two hours on 2026-09-12) — could settle out of order and let an
//      older outcome overwrite a newer one, in either direction.

const dispatched: Array<{
  resolve: (value: unknown) => void;
  reject: (reason: unknown) => void;
}> = [];

jest.mock("@/lib/api/call-api", () => ({
  callApi: (config: unknown) => config,
}));

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    dispatch: () =>
      new Promise((resolve, reject) => {
        dispatched.push({ resolve, reject });
      }),
  }),
}));

import {
  getUnderstudyRefreshState,
  readUnderstudyStandIn,
  refreshUnderstudyTracked,
  type UnderstudyRefreshResult,
} from "../understudy/refresh";

/** The workflow row as the page loaded it, before the save bumped the version. */
const STALE_ROW = {
  rulebook_version: 4,
  approved: 8,
  unconfirmed: 5,
  refreshed_at: "2026-09-12T00:00:00.000Z",
};

function okPayload(version: number): { data: UnderstudyRefreshResult } {
  return {
    data: {
      workflow_id: "wf-1",
      created: false,
      approved_rules: 12,
      unconfirmed_rules: 3,
      rulebook_version: version,
    },
  };
}

/** Settle the Nth dispatch (0-based) with a successful API result. */
function settleOk(index: number, version: number): void {
  dispatched[index].resolve(okPayload(version));
}

/** Settle the Nth dispatch with the shape `callApi` returns on failure. */
function settleFail(index: number, message: string): void {
  dispatched[index].resolve({ error: { message } });
}

beforeEach(() => {
  dispatched.length = 0;
});

describe("a successful rebuild clears the behind state with no host reload", () => {
  it("believes the refresh payload's version over the stale workflow row", async () => {
    const rulebookId = "rb-success";
    // The save bumped the Rulebook to 5 and poked the Understudy.
    expect(
      readUnderstudyStandIn(getUnderstudyRefreshState(rulebookId), STALE_ROW, 5)
        .behind,
    ).toBe(true);

    const inFlight = refreshUnderstudyTracked(rulebookId);
    settleOk(0, 5);
    await inFlight;

    // Nothing reloaded the row — the card must still be honest.
    const standIn = readUnderstudyStandIn(
      getUnderstudyRefreshState(rulebookId),
      STALE_ROW,
      5,
    );
    expect(standIn.behind).toBe(false);
    expect(standIn.builtFromVersion).toBe(5);
    expect(standIn.approved).toBe(12);
    expect(standIn.unconfirmed).toBe(3);
  });

  it("still reports behind when the rebuild landed an older version", async () => {
    const rulebookId = "rb-still-behind";
    const inFlight = refreshUnderstudyTracked(rulebookId);
    settleOk(0, 5);
    await inFlight;

    // A later save bumped the Rulebook to 6; that poke has not landed yet.
    const standIn = readUnderstudyStandIn(
      getUnderstudyRefreshState(rulebookId),
      STALE_ROW,
      6,
    );
    expect(standIn.behind).toBe(true);
    expect(standIn.builtFromVersion).toBe(5);
  });
});

describe("overlapping refreshes never clobber the ledger", () => {
  it("a stale failure settling after a newer success does not overwrite it", async () => {
    const rulebookId = "rb-stale-failure";
    const older = refreshUnderstudyTracked(rulebookId);
    const newer = refreshUnderstudyTracked(rulebookId);

    settleOk(1, 7); // the newer poke lands first
    await newer;
    settleFail(0, "boom"); // the older poke fails afterwards
    await expect(older).rejects.toThrow();

    const state = getUnderstudyRefreshState(rulebookId);
    expect(state.failed).toBe(false);
    expect(state.message).toBeNull();
    expect(state.pending).toBe(false);
    expect(
      readUnderstudyStandIn(state, STALE_ROW, 7).behind,
    ).toBe(false);
  });

  it("a stale success settling after a newer failure does not overwrite it", async () => {
    const rulebookId = "rb-stale-success";
    const older = refreshUnderstudyTracked(rulebookId);
    const newer = refreshUnderstudyTracked(rulebookId);

    settleFail(1, "the server refused the rebuild");
    await expect(newer).rejects.toThrow();
    settleOk(0, 9); // the older poke succeeds afterwards
    await older;

    const state = getUnderstudyRefreshState(rulebookId);
    expect(state.failed).toBe(true);
    expect(state.message).toContain("refresh the Understudy");
    // And the card must not claim the stand-in is current off that stale win.
    expect(
      readUnderstudyStandIn(state, STALE_ROW, 9).behind,
    ).toBe(true);
  });
});
