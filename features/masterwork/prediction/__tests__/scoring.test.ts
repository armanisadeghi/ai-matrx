/**
 * @jest-environment node
 */
/**
 * THE GUARD for the Prediction Ledger's arithmetic.
 *
 * ## The breaks it catches, named before the body was written
 *
 * 1. `isCorrect` written with `>` instead of `>=` at 0.5. A call recorded at
 *    exactly "a coin flip" that COMES TRUE is a hit; with `>` it silently
 *    becomes a miss, and its reason is filed as a boundary finding instead of
 *    a rule candidate. Fixture row `coin-flip-hit` fails on `>` and on nothing
 *    else.
 * 2. `brierScore` losing the square, or subtracting in the wrong direction on
 *    a FALSE outcome (`(0 - c)**2` vs `(c - 0)**2` are equal, but `1 - c` is
 *    not) — rows with both outcomes at asymmetric confidences separate them.
 * 3. `calibrationBuckets` bucketing on the wrong edge (0.8 belongs to the
 *    80–90% decile, not the 70–80% one), emitting EMPTY deciles as zero-
 *    realized points, or averaging realized over ALL entries instead of the
 *    bucket's own.
 *
 * Every expected value below is worked by hand from the definitions in
 * `scoring.ts`'s header, never computed by the code under test.
 */
import {
  bucketIndex,
  brierScore,
  calibrationBuckets,
  confidenceWords,
  isCorrect,
  isResolved,
  openEntriesByUrgency,
  overallBrier,
  readLedger,
  tally,
  type PredictionEntry,
} from "../scoring";

function entry(
  id: string,
  confidence: number,
  outcome: boolean | null,
  due_at = "2026-10-01",
): PredictionEntry {
  return {
    id,
    case_label: `Case ${id}`,
    prediction: `Something happens on ${id}`,
    confidence,
    why: `Because of ${id}`,
    due_at,
    captured_by: "typed",
    created_at: "2026-09-01T00:00:00Z",
    created_by: "u1",
    outcome,
    outcome_note: "",
    resolved_at: outcome === null ? null : "2026-10-02T00:00:00Z",
    distilled_run_id: null,
  };
}

/**
 * The fixture table. Brier and correct are HAND-WORKED from the definitions,
 * so a rewrite of the functions cannot make the test agree with itself.
 */
const FIXTURES: {
  name: string;
  confidence: number;
  outcome: boolean;
  brier: number;
  correct: boolean;
}[] = [
  // (0.8 - 1)^2 = 0.04 ; 0.8 >= 0.5 and it happened → right
  { name: "confident-hit", confidence: 0.8, outcome: true, brier: 0.04, correct: true },
  // (0.8 - 0)^2 = 0.64 ; 0.8 >= 0.5 but it did not happen → wrong
  { name: "confident-miss", confidence: 0.8, outcome: false, brier: 0.64, correct: false },
  // (0.2 - 0)^2 = 0.04 ; 0.2 < 0.5 and it did not happen → right
  { name: "doubtful-hit", confidence: 0.2, outcome: false, brier: 0.04, correct: true },
  // (0.2 - 1)^2 = 0.64 ; 0.2 < 0.5 but it happened → wrong
  { name: "doubtful-miss", confidence: 0.2, outcome: true, brier: 0.64, correct: false },
  // 🚨 THE >= BOUNDARY. (0.5 - 1)^2 = 0.25 ; 0.5 >= 0.5 and it happened → RIGHT.
  // With `>` this row alone flips to correct=false.
  { name: "coin-flip-hit", confidence: 0.5, outcome: true, brier: 0.25, correct: true },
  // (0.5 - 0)^2 = 0.25 ; 0.5 >= 0.5 but it did not happen → wrong.
  { name: "coin-flip-miss", confidence: 0.5, outcome: false, brier: 0.25, correct: false },
  // (0.99 - 1)^2 = 0.0001 — the ceiling of the allowed range.
  { name: "near-certain-hit", confidence: 0.99, outcome: true, brier: 0.0001, correct: true },
  // (0.01 - 1)^2 = 0.9801 — the floor, called as wrong as it gets.
  { name: "near-impossible-miss", confidence: 0.01, outcome: true, brier: 0.9801, correct: false },
];

describe("one resolved entry's score", () => {
  it.each(FIXTURES)(
    "$name: brier $brier, correct $correct",
    ({ name, confidence, outcome, brier, correct }) => {
      const e = entry(name, confidence, outcome);
      if (!isResolved(e)) throw new Error("fixture is not resolved");
      expect(brierScore(e)).toBeCloseTo(brier, 10);
      expect(isCorrect(e)).toBe(correct);
    },
  );

  it("treats exactly 0.5 as leaning TOWARD it — the >= boundary", () => {
    // Stated on its own as well as in the table: this is THE line the class of
    // defect sits on, and a reader of this file must not have to find it in a
    // row of eight.
    const hit = entry("half-true", 0.5, true);
    const miss = entry("half-false", 0.5, false);
    if (!isResolved(hit) || !isResolved(miss)) throw new Error("bad fixture");
    expect(isCorrect(hit)).toBe(true);
    expect(isCorrect(miss)).toBe(false);
  });
});

describe("the overall score", () => {
  it("averages the Brier scores of resolved entries only", () => {
    // 0.04 + 0.64 + 0.25 = 0.93 over THREE resolved entries = 0.31.
    // The open entry must not drag the mean toward anything.
    const entries = [
      entry("a", 0.8, true),
      entry("b", 0.8, false),
      entry("c", 0.5, true),
      entry("open", 0.9, null),
    ];
    expect(overallBrier(entries)).toBeCloseTo(0.31, 10);
  });

  it("is null — never 0 — when nothing is resolved", () => {
    // 0 is the score of a PERFECT forecaster. Returning it for "we do not
    // know yet" is the lie the whole empty state exists to prevent.
    expect(overallBrier([entry("open", 0.7, null)])).toBeNull();
  });
});

describe("confidence deciles", () => {
  it("puts a confidence in the decile its first digit names", () => {
    expect(bucketIndex(0.01)).toBe(0);
    expect(bucketIndex(0.1)).toBe(1);
    expect(bucketIndex(0.79)).toBe(7);
    // The edge: 0.8 opens the 80–90% decile, it does not close 70–80%.
    expect(bucketIndex(0.8)).toBe(8);
    expect(bucketIndex(0.99)).toBe(9);
    // 1.0 is out of the allowed range but must never overflow to index 10.
    expect(bucketIndex(1)).toBe(9);
  });

  it("reports predicted vs realized per non-empty decile", () => {
    const entries = [
      // 80–90%: three calls at 0.8, two of which came true → realized 2/3.
      entry("h1", 0.8, true),
      entry("h2", 0.8, true),
      entry("h3", 0.8, false),
      // 20–30%: two calls, one at 0.2 and one at 0.25, neither came true →
      // predicted mean 0.225, realized 0.
      entry("l1", 0.2, false),
      entry("l2", 0.25, false),
      // Open — must not appear anywhere.
      entry("open", 0.6, null),
    ];
    const buckets = calibrationBuckets(entries);
    // Only TWO buckets: the 60–70% decile holds one OPEN entry and the other
    // seven deciles hold nothing. An empty decile drawn at realized=0 would
    // read as "nothing you said at that confidence ever came true".
    expect(buckets.map((b) => b.index)).toEqual([2, 8]);
    expect(buckets[0]).toEqual({
      index: 2,
      label: "20–30%",
      count: 2,
      predicted: 0.225,
      realized: 0,
    });
    expect(buckets[1].count).toBe(3);
    expect(buckets[1].label).toBe("80–90%");
    expect(buckets[1].predicted).toBeCloseTo(0.8, 10);
    expect(buckets[1].realized).toBeCloseTo(2 / 3, 10);
  });

  it("is empty when nothing is resolved", () => {
    expect(calibrationBuckets([entry("open", 0.7, null)])).toEqual([]);
  });
});

describe("the tally a screen leads with", () => {
  it("counts open, resolved, right, wrong and overdue against a given day", () => {
    const entries = [
      entry("right", 0.9, true),
      entry("wrong", 0.9, false),
      entry("open-future", 0.7, null, "2026-12-01"),
      entry("open-overdue", 0.7, null, "2026-08-01"),
      entry("open-today", 0.7, null, "2026-09-15"),
    ];
    expect(tally(entries, "2026-09-15")).toEqual({
      total: 5,
      open: 3,
      resolved: 2,
      wellCalibrated: 1,
      wrong: 1,
      // Due TODAY is not overdue — the answer may land this afternoon.
      overdue: 1,
      earliestOpenDue: "2026-08-01",
    });
  });

  it("orders open entries by how overdue they are, oldest first", () => {
    const entries = [
      entry("c", 0.7, null, "2026-12-01"),
      entry("a", 0.7, null, "2026-08-01"),
      entry("resolved", 0.7, true, "2026-01-01"),
      entry("b", 0.7, null, "2026-10-01"),
    ];
    expect(openEntriesByUrgency(entries).map((e) => e.id)).toEqual([
      "a",
      "b",
      "c",
    ]);
  });
});

describe("plain words for a confidence", () => {
  it("names the nearest rung", () => {
    expect(confidenceWords(0.5)).toBe("a coin flip");
    expect(confidenceWords(0.9)).toBe("almost certain");
    expect(confidenceWords(0.2)).toBe("doubtful");
    // Off-rung values still get a word rather than a number.
    expect(confidenceWords(0.83)).toBe("quite sure");
  });
});

describe("reading the ledger off a Rulebook's metadata", () => {
  it("reads a stored ledger back entry for entry", () => {
    const ledger = readLedger({
      intake: { goal: "unrelated" },
      prediction_ledger: {
        schema: 1,
        entries: [
          {
            id: "e1",
            case_label: "Claim #4821 — water damage, Tulsa",
            prediction: "This claim is fraudulent",
            confidence: 0.8,
            why: "Third claim in 18 months, all just under the inspection threshold.",
            due_at: "2026-10-01",
            captured_by: "voice",
            created_at: "2026-09-15T10:00:00Z",
            created_by: "u1",
            outcome: true,
            outcome_note: "Investigator confirmed.",
            resolved_at: "2026-10-03T09:00:00Z",
            distilled_run_id: "run-7",
          },
        ],
      },
    });
    expect(ledger.entries).toHaveLength(1);
    expect(ledger.entries[0].case_label).toBe(
      "Claim #4821 — water damage, Tulsa",
    );
    expect(ledger.entries[0].captured_by).toBe("voice");
    expect(ledger.entries[0].outcome).toBe(true);
    expect(ledger.entries[0].distilled_run_id).toBe("run-7");
  });

  it("returns an empty ledger for a Rulebook that has never had one", () => {
    expect(readLedger(null).entries).toEqual([]);
    expect(readLedger({}).entries).toEqual([]);
    expect(readLedger({ prediction_ledger: { schema: 1 } }).entries).toEqual([]);
  });

  it("keeps an unresolved outcome NULL rather than guessing false", () => {
    // `outcome: null` and `outcome: false` mean entirely different things —
    // "we do not know" vs "the call did not come true" — and coercing the
    // first into the second would score every open call as a miss.
    const ledger = readLedger({
      prediction_ledger: {
        schema: 1,
        entries: [
          { id: "e1", prediction: "x", confidence: 0.7, outcome: null },
        ],
      },
    });
    expect(ledger.entries[0].outcome).toBeNull();
    expect(isResolved(ledger.entries[0])).toBe(false);
  });
});
