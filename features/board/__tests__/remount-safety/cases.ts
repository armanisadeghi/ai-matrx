/**
 * THE REMOUNT LEDGER — one row per board item type (`items/catalog.ts`).
 *
 * `passing`: the type's remount-safety case is a normal `it` — it must stay
 * green, so a regression fails the suite.
 * `failing`: the case runs as `it.failing` — it is RED today for the reason
 * given, and the suite stays green while it is. The lane that fixes the type
 * flips its row to `passing` (and the case becomes a normal `it`); a fix that
 * lands without the flip makes `it.failing` fail, so the row cannot go stale.
 *
 * A type may declare `sleeps: true` only while its row is `passing`, or while
 * its red row names why with `sleepsAnyway` (`remount-ledger.test.ts`).
 */

export type RemountStatus =
  | { status: "passing" }
  | {
      status: "failing";
      owner: string;
      why: string;
      /**
       * The type declares `sleeps: true` although this row is red — debt the
       * owning lane carries, with the reason sleeping is still acceptable. The
       * ledger test fails when a red type sleeps WITHOUT this, and when this is
       * left on a row that turned green or a type that no longer sleeps.
       */
      sleepsAnyway?: string;
    };

export const REMOUNT_LEDGER: Record<string, RemountStatus> = {
  "chat": { status: "passing" },
  "chat:quiet": { status: "passing" },
  "agent-form": { status: "passing" },
  "agent-form:quiet": { status: "passing" },
  "note": { status: "passing" },
  "note:quiet": { status: "passing" },
  "note:split-view caret": { status: "passing" },
  "note:write caret": { status: "passing" },
  "note:split-view undo": { status: "passing" },
  "file": { status: "passing" },
  "file:quiet": { status: "passing" },
  "udt_document": { status: "passing" },
  "udt_document:quiet": { status: "passing" },
  "udt_document:undo": { status: "passing" },
  "data-table": { status: "passing" },
  "data-table:quiet": { status: "passing" },
  "record": { status: "passing" },
  "record:quiet": { status: "passing" },
  "list": { status: "passing" },
  "list:quiet": { status: "passing" },
  "task": { status: "passing" },
  "task:quiet": { status: "passing" },
  "war-room": { status: "passing" },
  "war-room:quiet": { status: "passing" },
  "meeting": { status: "passing" },
  "meeting:quiet": { status: "passing" },
  "workflow-run": { status: "passing" },
  "workflow-run:quiet": { status: "passing" },
  "research": { status: "passing" },
  "research:quiet": { status: "passing" },
  "project": { status: "passing" },
  "project:quiet": { status: "passing" },
  "fc_set": { status: "passing" },
  "fc_set:quiet": { status: "passing" },
  "study-kit": { status: "passing" },
  "study-kit:quiet": { status: "passing" },
  "scope": { status: "passing" },
  "scope:quiet": { status: "passing" },
  "meeting_part": { status: "passing" },
  "meeting_part:quiet": { status: "passing" },
  "web-page": { status: "passing" },
  "web-page:quiet": { status: "passing" },
  "image": { status: "passing" },
  "image:quiet": { status: "passing" },
  "write-up": { status: "passing" },
  "write-up:quiet": { status: "passing" },
  "label": { status: "passing" },
  "label:quiet": { status: "passing" },
  "page": { status: "passing" },
  "page:quiet": { status: "passing" },
  "social-post": { status: "passing" },
  "social-post:quiet": { status: "passing" },
  "social-profile": { status: "passing" },
  "social-profile:quiet": { status: "passing" },
  "social-outlier-feed": { status: "passing" },
  "social-outlier-feed:quiet": { status: "passing" },
  "social-ad": { status: "passing" },
  "social-ad:quiet": { status: "passing" },
  "social-swipe-collection": { status: "passing" },
  "social-swipe-collection:quiet": { status: "passing" },
};

/** `it` for a passing row, `it.failing` for a failing one — the case body is the same. */
export function remountCase(key: string): jest.It {
  const row = REMOUNT_LEDGER[key];
  if (!row) throw new Error(`No remount-ledger row for board item type "${key}"`);
  return row.status === "failing" ? (it.failing as unknown as jest.It) : it;
}

export function remountCaseName(key: string): string {
  const row = REMOUNT_LEDGER[key];
  const what = key.endsWith(":quiet")
    ? `${key.slice(0, -6)}: waking and remounting reach the network not at all`
    : key.includes(":")
      ? `${key.split(":")[0]}: ${key.split(":").slice(1).join(":")} survives hide, show and remount`
      : `${key}: work kept, nothing repeated, its record not re-read on hide, show and remount`;
  if (!row) return `${what} (no ledger row)`;
  return row.status === "failing" ? `${what} — KNOWN RED (${row.owner}): ${row.why}` : what;
}

/**
 * One board item type's cases from ONE cycle: `<key>` (the core law —
 * `expectRemountSafe`, what `sleeps` is gated on) and `<key>:quiet` (no
 * network at all on wake or remount — `expectQuiet`). Extra named checks on
 * the same cycle go in `extra` (`<key>:<name>` rows).
 */
export function remountType(
  key: string,
  run: () => Promise<import("./harness").CycleResult>,
  core: (result: import("./harness").CycleResult) => void,
  extra: Record<string, (result: import("./harness").CycleResult) => void> = {},
): void {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { expectQuiet } = require("./harness") as typeof import("./harness");
  describe(key, () => {
    let result: import("./harness").CycleResult | null = null;
    let crash: unknown = null;
    beforeAll(async () => {
      try {
        result = await run();
      } catch (error) {
        crash = error;
      }
    }, 180_000);
    const cycle = () => {
      if (crash) throw crash;
      if (!result) throw new Error(`the ${key} cycle produced nothing`);
      return result;
    };
    remountCase(key)(remountCaseName(key), () => core(cycle()));
    remountCase(`${key}:quiet`)(remountCaseName(`${key}:quiet`), () => expectQuiet(cycle()));
    for (const [name, check] of Object.entries(extra)) {
      remountCase(`${key}:${name}`)(remountCaseName(`${key}:${name}`), () => check(cycle()));
    }
  });
}
