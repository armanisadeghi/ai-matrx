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
//   3. "Rebuilt <time>" dated the SURVIVING successful build by `at`, the time
//      the last ATTEMPT finished — cleared when a new poke starts and rewritten
//      when one fails. So after a failed follow-up the card kept the successful
//      version and counts and stamped them with the failure's clock.
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

describe("lag is judged on the rules, not on the version number", () => {
  // Cold walk 23 (friction): after only a rename and a "Keep mine" the card
  // said "This stand-in is behind your rules … version 10 (0 approved rules)
  // … now at version 13" — a rename bumps the Rulebook's version without
  // touching a rule the stand-in performs from.
  const BUILT_AT_10 = {
    rulebook_version: 10,
    approved: 0,
    unconfirmed: 6,
    refreshed_at: null,
  };

  it("a version bumped by a rename is not lag", () => {
    const standIn = readUnderstudyStandIn(
      getUnderstudyRefreshState("rb-rename"),
      BUILT_AT_10,
      13,
      { approved: 0, unconfirmed: 6 },
    );
    expect(standIn.behind).toBe(false);
    // …but the stamp is old, so an editor's card refreshes it (free).
    expect(standIn.stampOutdated).toBe(true);
  });

  it("a newly approved rule is lag", () => {
    const standIn = readUnderstudyStandIn(
      getUnderstudyRefreshState("rb-approved"),
      BUILT_AT_10,
      13,
      { approved: 1, unconfirmed: 5 },
    );
    expect(standIn.behind).toBe(true);
    expect(standIn.stampOutdated).toBe(false);
  });

  it("with no account of the current rules, the version is all there is", () => {
    expect(
      readUnderstudyStandIn(
        getUnderstudyRefreshState("rb-unknown"),
        BUILT_AT_10,
        13,
        null,
      ).behind,
    ).toBe(true);
  });
});

describe("a successful rebuild clears the behind state with no host reload", () => {
  it("believes the refresh payload's version over the stale workflow row", async () => {
    const rulebookId = "rb-success";
    // The save bumped the Rulebook to 5 and poked the Understudy.
    expect(
      readUnderstudyStandIn(getUnderstudyRefreshState(rulebookId), STALE_ROW, 5, null)
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
      null,
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
      null,
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
      readUnderstudyStandIn(state, STALE_ROW, 7, null).behind,
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
    // 🚨 THE SERVER'S OWN ACCOUNT, NOT THE WRAPPER'S (fifteenth cold walk,
    // blocking C). This used to assert `operationFailed`'s sentence — "We
    // couldn't refresh the Understudy." — which is exactly what buried the
    // server's reason on the card: on 2026-09-20 aidream answered with "this
    // part of the server was built wrong and cannot run… trying again will
    // fail the same way until it is fixed" and the Expert read a retry prompt
    // instead. The ledger now carries what the SERVER said, read through
    // `serverRefusal`.
    expect(state.message).toContain("the server refused the rebuild");
    expect(state.retryIsPointless).toBe(false);
    // And the card must not claim the stand-in is current off that stale win.
    expect(
      readUnderstudyStandIn(state, STALE_ROW, 9, null).behind,
    ).toBe(true);
  });
});

describe("the rebuild time belongs to the build, not to the last attempt", () => {
  it("a failure after a success keeps the success's own timestamp", async () => {
    const rulebookId = "rb-rebuilt-at";
    // A real clock can hand both settles the same millisecond, which would let
    // the defect pass by luck. Drive it by hand so the two moments differ.
    const clock = jest
      .spyOn(Date, "now")
      .mockReturnValue(Date.parse("2026-09-12T23:40:00.000Z"));
    const first = refreshUnderstudyTracked(rulebookId);
    settleOk(0, 6);
    await first;

    const afterSuccess = readUnderstudyStandIn(
      getUnderstudyRefreshState(rulebookId),
      STALE_ROW,
      6,
      null,
    );
    expect(afterSuccess.rebuiltAt).not.toBeNull();

    // Time moves on, then a later poke fails.
    clock.mockReturnValue(Date.parse("2026-09-13T02:15:00.000Z"));
    const second = refreshUnderstudyTracked(rulebookId);
    settleFail(1, "the server refused the rebuild");
    await expect(second).rejects.toThrow();

    const afterFailure = readUnderstudyStandIn(
      getUnderstudyRefreshState(rulebookId),
      STALE_ROW,
      6,
      null,
    );
    // The stand-in still performs from the build that landed, so the card must
    // still name that build — and date it to when it landed, not to the moment
    // a later attempt gave up.
    expect(afterFailure.builtFromVersion).toBe(6);
    expect(afterFailure.rebuiltAt).toBe(afterSuccess.rebuiltAt);
    expect(afterFailure.rebuiltAt).toBe("2026-09-12T23:40:00.000Z");
    expect(getUnderstudyRefreshState(rulebookId).failed).toBe(true);
    clock.mockRestore();
  });

  it("a rebuild still in flight does not lose the last build's timestamp", async () => {
    const rulebookId = "rb-rebuilt-at-pending";
    const first = refreshUnderstudyTracked(rulebookId);
    settleOk(0, 6);
    await first;
    const landed = readUnderstudyStandIn(
      getUnderstudyRefreshState(rulebookId),
      STALE_ROW,
      6,
      null,
    ).rebuiltAt;

    // A new save pokes again; nothing has settled yet.
    void refreshUnderstudyTracked(rulebookId);
    const whilePending = readUnderstudyStandIn(
      getUnderstudyRefreshState(rulebookId),
      STALE_ROW,
      6,
      null,
    );
    expect(whilePending.rebuiltAt).toBe(landed);
  });
});

describe("the counts it performs from follow the rules live (cold walk 24)", () => {
  // After "Turn this into rules" took the panel from 25 to 41 rules, the card
  // still said "16 approved, 25 still in review" until a reload: the server
  // had rebuilt the stand-in, and nothing told the page.
  const BAKED_AT_32 = {
    rulebook_version: 32,
    approved: 16,
    unconfirmed: 25,
    refreshed_at: null,
  };

  it("flags counts that disagree with today's rules, whatever the version says", () => {
    expect(
      readUnderstudyStandIn(getUnderstudyRefreshState("rb-w24"), BAKED_AT_32, 32, {
        approved: 16,
        unconfirmed: 41,
      }).countsDiffer,
    ).toBe(true);
    expect(
      readUnderstudyStandIn(getUnderstudyRefreshState("rb-w24b"), BAKED_AT_32, 33, {
        approved: 16,
        unconfirmed: 25,
      }).countsDiffer,
    ).toBe(false);
  });

  it("an editor's card rebuilds once per set of counts and believes the rebuild", () => {
    const { readFileSync } = jest.requireActual<typeof import("node:fs")>("node:fs");
    const { resolve } = jest.requireActual<typeof import("node:path")>("node:path");
    const card = readFileSync(
      resolve(__dirname, "../understudy/UnderstudyCard.tsx"),
      "utf8",
    );
    const at = card.indexOf("const countsDiffer = standIn.countsDiffer;");
    expect(at).toBeGreaterThan(-1);
    const effect = card.slice(at, at + 700);
    expect(effect).toContain("if (!countsDiffer || !canEdit || refreshPending) return;");
    expect(effect).toContain("`${rulebookId}:${approvedCount}:${draftCount}`");
    expect(effect).toContain("refreshUnderstudyTracked(rulebookId)");
  });
});

describe("no raw clock on a Masterwork screen (cold walk 24)", () => {
  // "rebuilt 10/1/2026, 1:19:54 AM" — a date with seconds, in a line of prose.
  // The app's one formatter is `@/utils/datetime` (`formatRelativeTime`).
  it("never renders new Date(…).toLocaleString()", () => {
    const { readFileSync, readdirSync, statSync } =
      jest.requireActual<typeof import("node:fs")>("node:fs");
    const { join, resolve } = jest.requireActual<typeof import("node:path")>("node:path");
    const root = resolve(__dirname, "..");
    const offenders: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) {
          if (name !== "__tests__" && name !== "node_modules") walk(path);
        } else if (path.endsWith(".tsx")) {
          const src = readFileSync(path, "utf8");
          if (/new Date\((?:[^()]|\([^()]*\))*\)\s*\.toLocaleString\(\)/.test(src)) {
            offenders.push(path.slice(root.length + 1));
          }
        }
      }
    };
    walk(root);
    expect(offenders).toEqual([]);
  });
});
