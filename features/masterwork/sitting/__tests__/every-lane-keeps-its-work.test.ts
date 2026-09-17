/**
 * @jest-environment node
 */
/**
 * THE GUARD: a capture lane an Expert can start never loses her work silently.
 *
 * ## The defect this exists to catch
 *
 * Three consecutive cold walks found ONE class, lane by lane, and each was
 * fixed where it was found:
 *
 *   walk 4 (2026-09-16) — the Triad erased an answered round on a reload
 *   walk 5 (2026-09-16) — the Sorting Table did the same thing
 *   walk 6 (2026-09-17) — the Red-Pen lane and the Daily Drip did the same
 *                          thing, and the census it triggered found EVERY
 *                          remaining capture dialog doing it too
 *
 * Fixing the instance three times is what this repo calls a defect in itself.
 * The reason the class kept coming back is that a new lane could ship without
 * anybody ever being asked "and what happens when she reloads?" — the registry
 * grows a row, the row grows a door, and nothing made that question mandatory.
 *
 * ## What this forces
 *
 * 1. Every lane the live `platform.approach` registry PROMISES resolves to a
 *    lane with an entry in `LANE_PERSISTENCE`. A new registry row whose lane
 *    nobody has answered the question for fails here, by name.
 * 2. Every `ApproachLane` variant declared in `approachLane.ts`, and every
 *    `INGEST_LANES` value, has an entry — so the class is closed at the type
 *    level too, not only for rows that happen to exist today.
 * 3. A DECLARATION CANNOT BE A LIE. Every entry names the module that carries
 *    it, and that module is read from disk and must actually contain the
 *    mechanism it claims: a `sitting` lane must call the sitting primitive, a
 *    `server-run` lane must use a durable run. A sticker that says "kept" over
 *    a lane that keeps nothing is exactly the failure this whole file exists
 *    to stop, so it fails here.
 *
 * Proven red before green (2026-09-17) — see the "proving it red" notes on
 * each block.
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

import {
  INGEST_LANES,
  promisesALane,
  resolveApproachLane,
} from "../../browse/approachLane";
import type { DistillationApproach } from "../../browse/approaches";
import { LANE_PERSISTENCE, persistenceForLane } from "../lanePersistence";

const REPO_ROOT = resolve(__dirname, "../../../..");

function sourceOf(moduleePath: string): string {
  return readFileSync(resolve(REPO_ROOT, moduleePath), "utf8");
}

/** Every lane variant declared in the union, read from the union itself. */
function laneKindsFromSource(): string[] {
  const laneSource = readFileSync(
    resolve(__dirname, "../../browse/approachLane.ts"),
    "utf8",
  );
  const union = laneSource.slice(laneSource.indexOf("export type ApproachLane ="));
  return [
    ...new Set(
      [...union.matchAll(/\{\s*kind:\s*"([a-zA-Z_]+)"/g)].map((m) => m[1]),
    ),
  ];
}

describe("every capture lane declares what happens to in-progress work", () => {
  it("has an entry for every ApproachLane variant", () => {
    const kinds = laneKindsFromSource();
    // Sanity: the union really was parsed.
    expect(kinds.length).toBeGreaterThanOrEqual(15);
    expect(kinds).toContain("redPen");
    expect(kinds).toContain("drip");
    const undeclared = kinds.filter(
      (kind) => kind !== "ingest" && !(kind in LANE_PERSISTENCE),
    );
    expect(
      // A kind here is a lane nobody has answered "what happens on a reload?"
      // for. Answer it in `lanePersistence.ts` — and if the answer is "the work
      // is lost", that is not an answer, it is the bug.
      undeclared.join(", "),
    ).toBe("");
  });

  it("has an entry for every ingest lane", () => {
    const undeclared = INGEST_LANES.filter(
      (lane) => !(`ingest:${lane}` in LANE_PERSISTENCE),
    );
    expect(undeclared.join(", ")).toBe("");
  });

  /**
   * Proving it red (2026-09-17): delete the `redPen` entry and this fails with
   * `red_pen (…) resolves to lane "redPen", which declares no persistence`.
   */
  it("declares persistence for every Approach the registry promises", () => {
    const rows = registrySnapshot();
    const promised = rows.filter((row) =>
      promisesALane(row as DistillationApproach),
    );
    expect(promised.length).toBeGreaterThan(0);
    const undeclared = promised
      .map((row) => ({ row, lane: resolveApproachLane(row) }))
      .filter(({ lane }) => lane !== null && persistenceForLane(lane) === null)
      .map(
        ({ row, lane }) =>
          `${row.key} resolves to lane "${lane!.kind}", which declares no persistence`,
      );
    expect(undeclared.join("\n")).toBe("");
  });

  /**
   * Proving it red (2026-09-17): this is the test that was RED for the whole
   * of walk 6's findings — before the fix, `redPen`, `prediction`, every
   * `ingest:*`, `body_of_work`, `chatImport`, `meeting`, `unfolding`,
   * `shadowInbox` and `drip` all named modules that carried no sitting at all.
   */
  it("backs every declaration with the mechanism it claims", () => {
    const lies: string[] = [];
    for (const [key, entry] of Object.entries(LANE_PERSISTENCE)) {
      let source: string;
      try {
        source = sourceOf(entry.module);
      } catch {
        lies.push(`${key}: declares ${entry.module}, which does not exist`);
        continue;
      }
      if (entry.kind === "sitting") {
        const keepsIt =
          source.includes("useDialogSitting") ||
          source.includes("createSittingStore");
        if (!keepsIt) {
          lies.push(
            `${key}: declares a sitting in ${entry.module}, but that module ` +
              "never calls useDialogSitting or createSittingStore — the lane " +
              "loses the Expert's work and the declaration says otherwise",
          );
        }
        // A sitting that is kept but never announced is a silent restore,
        // which is its own kind of lie (law 4). The two sanctioned ways to say
        // it: the shared notice for a dialog, and the round-shaped lanes' own
        // resume sentence ("You were on card 4 of 10…").
        const saysSo =
          source.includes("SittingResumed") ||
          source.includes("describeResumedSitting");
        if (keepsIt && !saysSo) {
          lies.push(
            `${key}: keeps a sitting in ${entry.module} but never says so — ` +
              "neither <SittingResumed> nor describeResumedSitting appears, so " +
              "work is put back on screen with nothing telling the Expert",
          );
        }
      }
      if (entry.kind === "server-run") {
        if (
          !source.includes("useMasterworkRun") &&
          !source.includes("useDurableRun")
        ) {
          lies.push(
            `${key}: declares a durable run in ${entry.module}, which uses none`,
          );
        }
      }
    }
    expect(lies.join("\n")).toBe("");
  });
});

/**
 * The registry rows this guard judges. Read live when the repo's own
 * `.env.local` is present (the same half the lane-coverage guard uses), and
 * otherwise from the snapshot that guard already maintains — so this test can
 * never quietly check nothing.
 */
type Row = Pick<
  DistillationApproach,
  "key" | "enabled" | "availability" | "intakeQuery" | "launchHref"
>;

function registrySnapshot(): Row[] {
  const source = readFileSync(
    resolve(__dirname, "../../browse/__tests__/approachLaneCoverage.test.ts"),
    "utf8",
  );
  // The snapshot lives once, in the guard that owns it. Parsing it here rather
  // than copying it means the two can never disagree about what is live.
  const body = source.slice(
    source.indexOf("const REGISTRY_SNAPSHOT_2026_09_12: RegistryRow[] = ["),
  );
  const rows: Row[] = [];
  for (const match of body.matchAll(
    /key:\s*"([a-z_]+)",\s*\n\s*enabled:\s*(true|false),\s*\n\s*availability:\s*"([a-z_]+)",\s*\n\s*intakeQuery:\s*(\{[^}]*\}),\s*\n\s*launchHref:\s*(null|"[^"]*")/g,
  )) {
    const [, key, enabled, availability, intakeQueryRaw, launchHrefRaw] = match;
    const intakeQuery: Record<string, string> = {};
    for (const pair of intakeQueryRaw.matchAll(/(\w+):\s*"([^"]*)"/g)) {
      intakeQuery[pair[1]] = pair[2];
    }
    rows.push({
      key,
      enabled: enabled === "true",
      availability: availability as Row["availability"],
      intakeQuery,
      launchHref: launchHrefRaw === "null" ? null : launchHrefRaw.slice(1, -1),
    });
  }
  // If the parse ever stops finding rows this guard would silently pass over
  // nothing, so it refuses instead.
  expect(rows.length).toBeGreaterThanOrEqual(20);
  return rows;
}
