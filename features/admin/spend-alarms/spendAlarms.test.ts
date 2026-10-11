import { alarmActions, alarmAgentData, isRinging, refLinks, spendAlarmHref, type SpendAlarmRecord } from "./spendAlarms";

jest.mock("@/utils/supabase/client", () => ({ supabase: {} }));

const U = "87a6e699-3622-4869-8843-d0867456c0dd";
const T = "33333333-3333-3333-3333-333333333333";

const rec = (over: Partial<SpendAlarmRecord> = {}): SpendAlarmRecord => ({
  id: "rec-1",
  kind: "protected_account_refusal",
  level: "critical",
  title: "Automated run tried to bill a protected account",
  detail: "Refused.",
  rule: "Automations never bill a protected account",
  fix: "Stop it",
  subject_type: "protected_account",
  subject_id: `${U}:scheduled:auto_ingest`,
  subject_name: null,
  refs: { user_id: U, handler: "auto_ingest", task_id: T },
  occurrence_count: 1318,
  first_seen_at: "2026-10-10T00:00:00Z",
  last_seen_at: "2026-10-10T10:00:00Z",
  cost_usd: null,
  cost_avoided_usd: null,
  status: "open",
  snoozed_until: null,
  resolved_at: null,
  resolved_by: null,
  resolution_note: null,
  reopened_count: 0,
  ...over,
});

describe("spend alarm record doors", () => {
  it("the protected refusal opens the task, its runs, the served item and the account", () => {
    const links = refLinks({ ...rec().refs, run_id: "run-7", source_kind: "note", source_id: "n-5" });
    const by = Object.fromEntries(links.map((l) => [l.key, l.href]));
    expect(by.task_id).toBe(`/administration/automation/scheduling/tasks/${T}`);
    expect(by.run_id).toBe(`/administration/automation/scheduling/tasks/${T}`);
    expect(by.source_id).toBe("/notes/n-5");
    expect(by.user_id).toBe(`/administration/users/usage?user=${U}`);
    expect(links[0]!.key).toBe("task_id");
  });

  it("actions follow the blocked thing's live state", () => {
    expect(alarmActions(rec(), { task: { enabled: true } })).toEqual(["run_now", "pause"]);
    expect(alarmActions(rec(), { task: { enabled: false } })).toEqual(["run_now", "resume"]);
    expect(alarmActions(rec(), { task: null })).toEqual([]);
    expect(alarmActions(rec({ refs: { approval_id: "ap-1", agent_id: "ag-1" } }), { approvalStatus: "waiting" })).toEqual([
      "approve",
      "reject",
      "open_agent",
    ]);
    expect(alarmActions(rec({ refs: { approval_id: "ap-1" } }), { approvalStatus: "approved" })).toEqual(["reject"]);
    expect(alarmActions(rec({ refs: { mandate_key: "seo.topic_assigner" } }))).toEqual(["open_mandate"]);
  });

  it("snoozed rings again when its time passes; resolved never rings", () => {
    const now = Date.parse("2026-10-11T00:00:00Z");
    expect(isRinging({ status: "snoozed", snoozed_until: "2026-10-10T23:00:00Z" }, now)).toBe(true);
    expect(isRinging({ status: "snoozed", snoozed_until: "2026-10-11T23:00:00Z" }, now)).toBe(false);
    expect(isRinging({ status: "resolved", snoozed_until: null }, now)).toBe(false);
  });

  it("the AI payload carries ids, links, the rule and every occurrence", () => {
    const data = alarmAgentData(rec(), [
      { id: "o1", occurred_at: "2026-10-10T10:00:00Z", repeat_count: 4, run_id: "run-7", execution_id: null, refs: { task_id: T, run_id: "run-7" }, detail: null, cost_usd: null },
    ], "https://manage.aimatrx.com");
    const text = JSON.stringify(data);
    expect(data.alarm.page).toBe(`https://manage.aimatrx.com${spendAlarmHref("rec-1")}`);
    expect(data.alarm.rule).toContain("protected");
    expect(text).toContain(`/administration/automation/scheduling/tasks/${T}`);
    expect(data.occurrences[0]!.run_id).toBe("run-7");
  });
});

import { alarmHeadline, hasRawId } from "./spendAlarms";

describe("headlines carry no raw ids", () => {
  it("swaps the subject id for its name and drops any other id", () => {
    const id = "6b6b4e45-4699-4860-8dea-d8a60e07d69a";
    expect(alarmHeadline(`Run held for spend approval: agent ${id}`, id, "Keyword classifier")).toBe(
      "Run held for spend approval: agent Keyword classifier",
    );
    const bare = alarmHeadline(`Run held for spend approval: agent ${id}`, id, null);
    expect(hasRawId(bare)).toBe(false);
    expect(alarmHeadline("Spend spike: Platform spend, last hour")).toBe("Spend spike: Platform spend, last hour");
  });
});
