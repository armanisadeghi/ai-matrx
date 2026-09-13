/**
 * A SUCCESSFUL REBUILD MUST NOT LEAVE AN OLDER FAILURE ON SCREEN
 * (Bugbot, 2026-09-13).
 *
 * Two doors mint a Rulebook's stand-in, and only one of them records what
 * happened. `refreshUnderstudyTracked` writes the staleness ledger the card
 * renders from; the raw `refreshUnderstudy` mints and says nothing.
 *
 * The card's self-heal called the raw one. So the sequence a real Expert hits
 * — a `pokeUnderstudy` fails during a save, she opens a Rulebook with no
 * stand-in, the free self-heal mints one successfully — ended with the card
 * showing the amber "the last rebuild did not go through" over a stand-in that
 * had just come up. Nothing was wrong, and the screen said something was.
 *
 * The fix is structural rather than a convention: the raw door is now
 * module-internal, so the ledger cannot be bypassed from outside this module
 * at all. This guard pins the BEHAVIOUR that fix exists for, so it survives
 * any future refactor of who calls what.
 */
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
  refreshUnderstudyTracked,
} from "../understudy/refresh";

const RULEBOOK = "cccccccc-cccc-4ccc-8ccc-cccccccccccc";

beforeEach(() => {
  dispatched.length = 0;
});

/**
 * 🚨 THE CARD'S OWN CHOICE OF DOOR, asserted statically.
 *
 * The test below proves the LEDGER behaves — but the ledger was never the
 * broken part. The defect was the card reaching past it, so the behavioural
 * test alone would have passed on the broken code. This is the case that
 * actually fails on the original: the self-heal must name the tracked door.
 */
it("heals through the door that records the outcome", () => {
  const { readFileSync } = require("fs") as typeof import("fs");
  const { join } = require("path") as typeof import("path");
  const source = readFileSync(
    join(__dirname, "..", "understudy", "UnderstudyCard.tsx"),
    "utf8",
  );
  const code = source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => !line.startsWith("*") && !line.startsWith("//"));

  // Every mint the card starts goes through the tracked door — the self-heal
  // and the manual retry alike.
  const calls = code.filter((l) => l.includes("refreshUnderstudy"));
  expect(calls.length).toBeGreaterThan(0);
  for (const call of calls) {
    expect(call).toContain("refreshUnderstudyTracked");
  }
});

it("clears an earlier failure when a later rebuild lands", async () => {
  // 1. A poke fails — the ledger holds the failure, which is what puts the
  //    amber banner on the card.
  const failing = refreshUnderstudyTracked(RULEBOOK).catch(() => undefined);
  dispatched[0].resolve({ error: { message: "the server refused" } });
  await failing;

  const afterFailure = getUnderstudyRefreshState(RULEBOOK);
  expect(afterFailure.failed).toBe(true);
  expect(afterFailure.message).toBeTruthy();

  // 2. The self-heal mints the stand-in, successfully. 🚨 THE DEFECT: while
  //    this went through the untracked door, the ledger never heard about it
  //    and the failure above stayed on screen over a working stand-in.
  const healing = refreshUnderstudyTracked(RULEBOOK);
  dispatched[1].resolve({
    data: { rulebook_version: 7, approved_rules: 12, unconfirmed_rules: 0 },
  });
  await healing;

  const afterHeal = getUnderstudyRefreshState(RULEBOOK);
  expect(afterHeal.failed).toBe(false);
  expect(afterHeal.message).toBeNull();
  expect(afterHeal.result?.rulebook_version).toBe(7);
});

it("does not export a door that mints without recording", () => {
  // The structural half: nothing outside the module can mint a stand-in and
  // leave the ledger untouched, which is the only way the above can regress.
  const refresh = require("../understudy/refresh") as Record<string, unknown>;
  expect(refresh.refreshUnderstudyTracked).toBeDefined();
  expect(refresh.refreshUnderstudy).toBeUndefined();
});
