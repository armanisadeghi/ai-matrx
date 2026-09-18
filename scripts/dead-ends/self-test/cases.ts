/**
 * THE fixture table for `toast-names-record` — read by BOTH runners:
 * `pnpm check:dead-ends --self-test` (the CLI's red/green proof) and
 * `scripts/dead-ends/__tests__/toast-names-record.test.ts` (jest). One table, so
 * the two can never disagree about what the rule is supposed to see.
 *
 * Every row is a real defect somebody shipped or a hostile verifier planted, not
 * a toy: see `README.md` for the provenance of each file.
 */

export interface ToastFixtureCase {
  /** Path under `scripts/dead-ends/self-test/`, or a live tree path. */
  file: string;
  /** True when `file` is read from the live tree (a green half must be). */
  live?: boolean;
  /** How many `toast-names-record` findings the rule must produce. */
  findings: number;
  /** The entity every finding must be attributed to (when any are expected). */
  entity?: string;
  /** The severity every finding must carry. */
  severity?: "high" | "medium" | "low";
  /** A token the finding must NEVER be attributed to. */
  neverEntity?: string;
  /** What this row proves, printed by the CLI self-test. */
  proves: string;
}

export const TOAST_FIXTURE_CASES: ToastFixtureCase[] = [
  {
    file: "scripts/dead-ends/self-test/agenda-panel-pre-fix.tsx.fixture",
    findings: 1,
    entity: "note",
    severity: "high",
    proves:
      "the shipped AgendaPanel at 66f75b7a created a note, named it in a toast and " +
      "offered no door (V-20 N10)",
  },
  {
    file: "features/google-workspace/calendar/AgendaPanel.tsx",
    live: true,
    findings: 0,
    proves:
      "the LIVE AgendaPanel carries a door in the toast and on the row, and the rule " +
      "does not flag its own fix",
  },
  {
    file: "scripts/dead-ends/self-test/v21-calendar-event-toast.tsx.fixture",
    findings: 1,
    entity: "calendar_event",
    severity: "high",
    proves:
      "a doorless creation toast after createCalendarEvent(...) is seen at all — it was " +
      "invisible while calendar_event was missing from the entity registry (V-21)",
  },
  {
    file: "scripts/dead-ends/self-test/v21-google-document-toast.tsx.fixture",
    findings: 1,
    entity: "google_document",
    severity: "high",
    neverEntity: "udt_document",
    proves:
      "an imported Google file is attributed to google_document, never to the " +
      "custom-data document the bare noun used to resolve to (V-21)",
  },
  {
    file: "scripts/dead-ends/self-test/v21-toast-carries-the-door.tsx.fixture",
    findings: 0,
    proves:
      "both creations with the door the remedy asks for report nothing — the control arm",
  },
];
