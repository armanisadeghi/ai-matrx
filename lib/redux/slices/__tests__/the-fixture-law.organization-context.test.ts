/**
 * 🚨 THE FIXTURE LAW — a test never hand-spells a whole `AppContextState`.
 *
 * On 2026-09-18 lane F-102 added `orgBootstrapFailure` (THE FOURTH STATE, R37)
 * as a REQUIRED field on `AppContextState`. Ten type errors landed in four test
 * files at once, because each had frozen its own copy of the eleven-key
 * literal: the shape could not grow without breaking every fixture that had
 * ever spelled it. Worse, the copies hiding behind an `as never` cast
 * (`features/education/notes/EduNoteNew.test.tsx`) did not break at all — they
 * went on asserting against a state the slice no longer produces.
 *
 * The class fix is `makeAppContextState()` in the slice, built on the slice's
 * own initial state. This guard keeps it the only door: a fixture may name the
 * fields it is about, but the moment one spells the whole shape by hand it
 * fails here, by name, with the remedy.
 *
 * WHERE IT RUNS: under `pnpm test`, and — via the `organization-context`
 * segment in this filename, which that script's jest pattern matches — inside
 * the `check:organization-context` CI gate.
 */

import {
  APP_CONTEXT_FIXTURE_ALLOWLIST,
  findHandSpelledAppContextFixtures,
  isHandSpelledAppContextLiteral,
} from "../../../../scripts/app-context-fixture-law";

/** The shape as four files used to spell it, verbatim from the breakage. */
const HAND_SPELLED = `
const composing = {
  organization_id: null,
  organization_name: null,
  personal_organization_id: null,
  scope_selections: { s1: "s1" },
  active_scope_type_ids: ["t1"],
  project_id: "p1",
  project_name: "Project",
  task_id: "t1",
  task_name: "Task",
  conversation_id: "conversation-being-composed",
  orgBootstrapResolved: true,
};
`;

/** The same fixture through the builder — the shape is named once, upstream. */
const THROUGH_THE_BUILDER = `
const composing = makeAppContextState({
  project_id: "p1",
  orgBootstrapResolved: true,
});
`;

describe("THE FIXTURE LAW: AppContextState is never hand-spelled in a test", () => {
  it("the detector can actually fail — it catches the literal that broke F-102", () => {
    expect(isHandSpelledAppContextLiteral(HAND_SPELLED)).toBe(true);
  });

  it("the detector does not punish a fixture that names only what it asserts", () => {
    expect(isHandSpelledAppContextLiteral(THROUGH_THE_BUILDER)).toBe(false);
  });

  it("no test file in the repo spells the whole AppContextState literal", () => {
    expect(findHandSpelledAppContextFixtures()).toEqual([]);
  });

  it("the allowlist only shrinks — every entry still exists and still offends", () => {
    // A stale entry is a silent hole: it excuses a file that no longer needs
    // excusing, and the next hand-spelled literal can be dropped in unnoticed.
    const offendersWithoutTheAllowlist = findHandSpelledAppContextFixtures([]);
    const stale = APP_CONTEXT_FIXTURE_ALLOWLIST.filter(
      (entry) => !offendersWithoutTheAllowlist.includes(entry),
    );
    expect(stale).toEqual([]);
  });
});
