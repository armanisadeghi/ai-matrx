import { act } from "react";
import { createRoot } from "react-dom/client";
import type { Root } from "react-dom/client";
import { SuspensionCard } from "./SuspensionCard";
import type { AgendaTask, AutoSuspendedBlock } from "../../types";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const historicalSuspensions = [
  {
    at: "2026-08-26T04:41:17.839036+00:00",
    reason:
      "scheduled task a7c1e2d3-0000-4e5f-9a00-000000000432 has failed 5 times and has NEVER succeeded once — the cause keeps changing, which is not progress. Nobody has seen this schedule work. Last error: MandateError: Mandate 'seo.keyword_classifier': agent 5ca54dd9-6de6-4364-842f-2ec4a0274ce0 failed: Google rejected the request: Response payload is not completed: <TransferEncodingError: 400, message='Not enough data to satisfy transfer length header.'>. ConnectionResetError(104, 'Connection reset by peer')",
    run_id: "78c5de02-545e-45b3-9ab9-85f05525c433",
    source: "scheduler_repeat_guard",
    verdict:
      "FALSE — computed from run status while the run had committed 839 units of work; see restored",
    failure_signature: "never-succeeds",
    consecutive_failures: 5,
  },
  {
    at: "2026-09-13T05:28:15.670120+00:00",
    reason:
      "scheduled task a7c1e2d3-0000-4e5f-9a00-000000000432 has failed 7 times and has NEVER succeeded once — the cause keeps changing, which is not progress. Nobody has seen this schedule work. Last error: run ceiling reached: max_runtime_seconds=330 elapsed; the handler was stopped. Raise the schedule's Max runtime if the approved budget needs more time",
    run_id: "a2fa8a15-d3cd-4312-9264-b3269571ebdb",
    source: "scheduler_repeat_guard",
    restored: {
      at: "2026-09-13T05:38:35.934952+00:00",
      by: "agent: run-lease repair (deep lane, 2026-09-13) — restoring the approval the repeat guard overrode on the agent's own 330s-ceiling verification run a2fa8a15; the two productive ledger rows (78c5de02: 839, 9b9e455b: 638) now carry units_done so the guard is no longer blind to them",
      restored_approval:
        "Approved: seo_keyword_facet_backfill, daily 04:20 UTC, ≤4,000 keywords/day; approved by arman on 2026-08-22",
    },
    override_notice:
      "This schedule carries a HUMAN APPROVAL and the repeat guard is OVERRIDING it. The approval fields on this row are untouched. Fix the cause, then re-enable: that RESTORES the existing approval and is not a new schedule.",
    failure_signature: "never-succeeds",
    overriding_approval:
      "Approved: seo_keyword_facet_backfill, daily 04:20 UTC, ≤4,000 keywords/day; approved by arman on 2026-08-22",
    consecutive_failures: 7,
  },
] satisfies AutoSuspendedBlock[];

const task: AgendaTask = {
  id: "bb8f9eab-8384-490f-9046-ecde135be15e",
  userId: "b1dfb5ef-0bb1-4983-828f-8e31df3d3636",
  kind: "agent",
  metadata: { auto_suspended_history: historicalSuspensions },
  title: "Daily research digest",
  description: "Collect daily source material.",
  queue: "default",
  surfaces: ["server"],
  enabled: true,
  expiresAt: null,
  tags: ["research"],
  nextDueAt: null,
  lastRunAt: "2026-09-14T20:15:30.000Z",
  createdAt: "2026-09-01T00:00:00.000Z",
  updatedAt: "2026-09-14T21:00:00.000Z",
  agentId: "15db792a-0729-4647-95db-6f398ea2d188",
  prompt: "Collect daily source material.",
  variables: { topic: "scheduler reliability" },
  persistentConversationId: null,
  authMode: "auto",
  maxRuntimeSeconds: 300,
  maxConcurrent: 1,
  triggers: [
    {
      id: "27e48447-e33d-45ca-9595-2a2779613c02",
      taskId: "bb8f9eab-8384-490f-9046-ecde135be15e",
      type: "cron",
      config: { expression: "0 9 * * *", tz: "UTC" },
      enabled: true,
      nextDueAt: null,
      lastFiredAt: "2026-09-14T20:15:30.000Z",
    },
  ],
};

describe("SuspensionCard", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("links each historical suspension to the run that tipped it", () => {
    act(() => root.render(<SuspensionCard task={task} />));

    const expandHistory = container.querySelector<HTMLButtonElement>(
      'button[aria-expanded="false"]',
    );
    expect(expandHistory).not.toBeNull();
    act(() => expandHistory?.click());

    const runLinks = Array.from(
      container.querySelectorAll<HTMLAnchorElement>("a"),
    ).filter((link) => link.textContent === "The run that tipped it");
    expect(runLinks).toHaveLength(2);
    expect(runLinks.map((link) => link.textContent)).toEqual([
      "The run that tipped it",
      "The run that tipped it",
    ]);
    expect(runLinks.map((link) => link.getAttribute("href"))).toEqual([
      "#run-78c5de02-545e-45b3-9ab9-85f05525c433",
      "#run-a2fa8a15-d3cd-4312-9264-b3269571ebdb",
    ]);
  });

  it("does not invent a run link when an older history entry has no run id", () => {
    const withoutRun = {
      ...task,
      metadata: {
        auto_suspended_history: [
          {
            at: "2026-08-20T00:00:00.000Z",
            reason: "Legacy suspension without a recorded run identity",
          },
        ],
      },
    } satisfies AgendaTask;
    act(() => root.render(<SuspensionCard task={withoutRun} />));
    const expandHistory = container.querySelector<HTMLButtonElement>(
      'button[aria-expanded="false"]',
    );
    act(() => expandHistory?.click());

    expect(container.querySelector('a[href^="#run-"]')).toBeNull();
    expect(container.textContent).toContain(
      "Legacy suspension without a recorded run identity",
    );
  });
});
