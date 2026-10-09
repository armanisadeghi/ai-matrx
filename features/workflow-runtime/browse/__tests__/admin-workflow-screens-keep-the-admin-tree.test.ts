/**
 * THE ADMIN SEAT — the admin workflow mirror screens never send an admin back to the user tree.
 *
 * `/administration/automation/workflows/[id]` (+ `/design`, `/triggers`, `/runs`, `runs/[runId]`)
 * render the same components as `/workflows/…`. Their in-screen links were hard-coded to
 * `/workflows/…`, so one click dropped a platform admin onto a user page, where the admin lane —
 * and with it the admin's write access — is closed. Every link in those screens now asks the
 * page's base (`useWorkflowsBasePath` / `currentWorkflowsBasePath`), the same helper the browse
 * list uses.
 *
 * Two halves: the helpers answer the admin tree for an admin page (and the user tree otherwise),
 * and no file behind the mirror screens builds a `/workflows/…` page link by hand (red on the
 * prior files: 22 hand-built links across 8 of these files).
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import {
  ADMIN_WORKFLOWS_BASE_PATH,
  ADMIN_WORKFLOW_RUNS_PATH,
  allWorkflowRunsHref,
  analyzeWorkflowRunsHref,
  workflowDesignHref,
  workflowRunHref,
  workflowRunPermalinkHref,
  workflowRunsListHref,
  workflowsBasePath,
  workflowsListHref,
  workflowTriggersHref,
} from "../workflowActionRegistry";

jest.mock("next/navigation", () => ({ usePathname: () => null }));

const ROOT = join(__dirname, "..", "..");

/** Every component the five admin mirror routes render, and the menus they open. */
const SCREEN_FILES = [
  "components/run/WorkflowRunPage.tsx",
  "builder/RunSurfaceBuilder.tsx",
  "builder/PreviewPane.tsx",
  "triggers/components/WorkflowTriggersPage.tsx",
  "triggers/components/TriggerFireHistory.tsx",
  "triggers/components/TriggerCard.tsx",
  "discovery/components/RunsListPage.tsx",
  "discovery/components/RunsList.tsx",
  "run-actions.tsx",
];

/** A page link built by hand: a quote or backtick, then `/workflows` + `/`, `?` or the end. */
const HAND_BUILT_PAGE_LINK = /["'`]\/workflows(?:\/(?!\{)|\?|["'`])/;

function codeLines(source: string): string[] {
  return source
    .split("\n")
    .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line));
}

describe("the helpers", () => {
  it("answer the admin tree on an admin page", () => {
    const base = workflowsBasePath("/administration/automation/workflows/abc");
    expect(base).toBe(ADMIN_WORKFLOWS_BASE_PATH);
    expect(workflowRunHref("abc", base)).toBe("/administration/automation/workflows/abc");
    expect(workflowDesignHref("abc", base)).toBe("/administration/automation/workflows/abc/design");
    expect(workflowTriggersHref("abc", base)).toBe("/administration/automation/workflows/abc/triggers");
    expect(workflowRunsListHref("abc", base)).toBe("/administration/automation/workflows/abc/runs");
    expect(workflowRunPermalinkHref("r1", base)).toBe("/administration/automation/workflows/runs/r1");
    expect(workflowsListHref(base)).toBe(ADMIN_WORKFLOWS_BASE_PATH);
    expect(allWorkflowRunsHref(base)).toBe(ADMIN_WORKFLOW_RUNS_PATH);
    expect(analyzeWorkflowRunsHref(base)).toBe(ADMIN_WORKFLOW_RUNS_PATH);
  });

  it("answer the user tree everywhere else (unchanged addresses)", () => {
    const base = workflowsBasePath("/workflows/abc");
    expect(workflowRunHref("abc", base)).toBe("/workflows/abc");
    expect(workflowTriggersHref("abc", base)).toBe("/workflows/abc/triggers");
    expect(workflowsListHref(base)).toBe("/workflows/all");
    expect(allWorkflowRunsHref(base)).toBe("/workflows/runs");
    expect(analyzeWorkflowRunsHref(base)).toBe("/workflows/runs/analyze");
  });
});

describe("the mirror screens", () => {
  it.each(SCREEN_FILES)("%s builds no /workflows page link by hand", (file) => {
    const offenders = codeLines(readFileSync(join(ROOT, file), "utf8")).filter((line) =>
      HAND_BUILT_PAGE_LINK.test(line),
    );
    expect(offenders).toEqual([]);
  });
});
