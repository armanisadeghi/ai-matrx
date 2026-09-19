/**
 * 🚨 A FIXTURE WHOSE CLOCK IS FROZEN IS A TEST THAT EXPIRES.
 *
 * THE DEFECT THIS CLOSES (whole-suite census, 2026-09-19). Both Google-workspace
 * row fixtures shipped with absolute `2026-09-18T…` timestamps, and the surfaces
 * that read them measure against `new Date()`:
 *
 *   - `AgendaPanel` renders TODAY and TOMORROW. An event pinned to 2026-09-18
 *     left the agenda on 2026-09-19, so `every-person-at-an-address-is-a-door`
 *     asserted two attendee names against the sentence "Nothing on your
 *     calendar."
 *   - `GoogleDocumentPanel` refreshes on open when `synced_at` is older than
 *     `google.refresh.on_open_min_age_seconds`. A `synced_at` pinned to
 *     2026-09-18 made every mount spend a real refresh call from the next
 *     morning on, and `the-last-two-actions-are-real` read that call as the one
 *     its confirm dialog had just made — three assertions red.
 *
 * Both suites were GREEN on the day they were written and red every day after,
 * and nothing said so: the whole jest battery runs only in a release gate that
 * `release.sh` invokes `--advisory || true`.
 *
 * WHAT IT ASSERTS, AND WHY NOT A THRESHOLD. "Within N days of now" cannot catch
 * this class — the fixture that broke three suites was ONE DAY stale. The exact
 * property is that the fixture DERIVES its times from the clock: move the clock
 * and every time column must move with it. A frozen literal does not move, and
 * that is the whole defect, measured directly.
 *
 * It reads the fixtures' OUTPUT, never their source text, so any honest way of
 * computing the dates passes — and a suite that genuinely wants a stale or
 * distant row still overrides the column BY NAME at its own call site, which is
 * the only place a reader can see that staleness was intended.
 */

import { calendarEventRow } from "../calendar/__tests__/fixtures";
import { googleDocumentRow } from "../documents/__tests__/fixtures";

type Row = Record<string, unknown>;

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/;
const JUMP_MS = 7 * 24 * 60 * 60 * 1000;

const REMEDY =
  "Derive it from `Date.now()` in the fixture (see the fixture header). A suite " +
  "that wants a stale or distant row overrides the column by name at its own " +
  "call site — that is where a reader can tell staleness was intended.";

function timeColumns(row: Row): string[] {
  return Object.entries(row)
    .filter(([, value]) => typeof value === "string" && ISO.test(value))
    .map(([column]) => column);
}

/** Call `make` at two clock positions JUMP_MS apart; return the columns that did NOT move. */
function frozenColumns(make: (overrides?: Record<string, unknown>) => unknown): string[] {
  const base = Date.now();
  const now = jest.spyOn(Date, "now");
  try {
    now.mockReturnValue(base);
    const first = make() as Row;
    now.mockReturnValue(base + JUMP_MS);
    const second = make() as Row;
    return timeColumns(first).filter(
      (column) => String(first[column]) === String(second[column]),
    );
  } finally {
    now.mockRestore();
  }
}

const FIXTURES: Array<[string, (overrides?: Record<string, unknown>) => unknown]> = [
  ["calendarEventRow()", (o) => calendarEventRow(o as never)],
  ["googleDocumentRow()", (o) => googleDocumentRow(o as never)],
];

describe("the Google-workspace row fixtures are derived from the clock", () => {
  it("the reader finds time columns at all — a census of nothing is not a pass", () => {
    for (const [label, make] of FIXTURES) {
      const count = timeColumns(make() as Row).length;
      expect(`${label}: ${count >= 4}`).toBe(`${label}: true`);
    }
  });

  it.each(FIXTURES)("%s moves every time column when the clock moves", (label, make) => {
    const frozen = frozenColumns(make);
    if (frozen.length) {
      throw new Error(
        `${label} returns the same value for ${frozen
          .map((c) => `\`${c}\``)
          .join(", ")} a week apart — a frozen calendar date. Every surface that ` +
          "reads these rows compares against `new Date()`, so the suites using " +
          `this fixture pass on one day and fail on the next. ${REMEDY}`,
      );
    }
    expect(frozen).toEqual([]);
  });

  it("is falsifiable — a fixture with one frozen column is named", () => {
    // The guard's own proof, run in place rather than claimed in a comment: the
    // exact shape both fixtures held until 2026-09-19. If this can come back
    // empty, the assertions above are decoration.
    const planted = () => ({
      ...(calendarEventRow() as unknown as Row),
      synced_at: "2026-09-18T12:00:00Z",
    });
    expect(frozenColumns(planted)).toEqual(["synced_at"]);
  });
});
