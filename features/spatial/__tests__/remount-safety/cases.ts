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
  "chat": {
    status: "failing",
    owner: "chat lane",
    why: "wake/remount re-read the transcript's assistant messages (ProposedDirectivesZone → fetchStoredDirectiveShells, chat.message)",
    sleepsAnyway: "browser-checked 2026-10-02; the re-read is a read, nothing is lost or written",
  },
  "chat:quiet": {
    status: "failing",
    owner: "chat lane",
    why: "wake/remount re-read compute targets, action ledger, plans/tasks/todos, working documents, mandate resolution, conversation files",
  },
  "note": { status: "passing" },
  "note:quiet": {
    status: "failing",
    owner: "notes lane",
    why: "wake/remount re-read sharing authority (may_manage_sharing x2), docproc.processed_documents, iam.organizations, memberships",
  },
  "note:split-view caret": {
    status: "failing",
    owner: "notes lane",
    why: "remount puts the Split view's caret/selection at 0 (kept across hide/show)",
  },
  "note:split-view undo": { status: "passing" },
  "file": { status: "passing" },
  "file:quiet": { status: "passing" },
  "udt_document": {
    status: "failing",
    owner: "documents lane",
    why: "every wake and every remount writes a new workbench.udt_document_snapshots row and updates the document, with nothing typed since the last save",
  },
  "udt_document:quiet": {
    status: "failing",
    owner: "documents lane",
    why: "wake/remount insert a snapshot and update the document row (a repeated save)",
  },
  "data-table": { status: "passing" },
  "data-table:quiet": {
    status: "failing",
    owner: "unified-data lane",
    why: "wake/remount re-read table_copy_evaluation_state, iam.organizations (x2), record_change_actions",
  },
  "record": { status: "passing" },
  "record:quiet": {
    status: "failing",
    owner: "unified-data lane",
    why: "wake/remount re-read row actions, table_copy_evaluation_state, iam.organizations, record_change_actions",
  },
  "task": {
    status: "failing",
    owner: "tasks lane",
    why: "wake/remount re-read the task's subtasks (projects.tasks where parent_task_id = task)",
    sleepsAnyway: "browser-checked 2026-10-02; the re-read is a read, nothing is lost or written",
  },
  "task:quiet": {
    status: "failing",
    owner: "tasks lane",
    why: "wake/remount re-read subtasks and member counts",
  },
  "war-room": { status: "passing" },
  "war-room:quiet": { status: "passing" },
  "meeting": {
    status: "failing",
    owner: "meet lane",
    why: "wake/remount re-read the meeting, its invitees and occurrences (useMeetingById keeps no answer per meeting)",
  },
  "meeting:quiet": {
    status: "failing",
    owner: "meet lane",
    why: "wake/remount re-read the meeting, invitees, occurrences, record home",
  },
  "workflow-run": { status: "passing" },
  "workflow-run:quiet": { status: "passing" },
  "research": {
    status: "failing",
    owner: "research lane",
    why: "wake/remount re-read research.rs_topic, get_topic_overview and research.rs_document (x2)",
    sleepsAnyway: "browser-checked 2026-10-02; the re-read is a read, nothing is lost or written",
  },
  "research:quiet": {
    status: "failing",
    owner: "research lane",
    why: "wake/remount re-read the topic, its overview and its document",
  },
  "project": {
    status: "failing",
    owner: "projects lane",
    why: "remount loses the half-typed quick-add task (component state) and re-reads the project's tasks",
    sleepsAnyway: "browser-checked 2026-10-02 for wake; the quick-add draft is lost only on a full remount",
  },
  "project:quiet": {
    status: "failing",
    owner: "projects lane",
    why: "remount re-reads the project's tasks and membership",
  },
  "meeting_part": {
    status: "failing",
    owner: "meet lane",
    why: "wake/remount re-read the meeting, its invitees and occurrences (same useMeetingById as the meeting tile)",
  },
  "meeting_part:quiet": {
    status: "failing",
    owner: "meet lane",
    why: "wake/remount re-read the meeting, invitees and occurrences",
  },
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
