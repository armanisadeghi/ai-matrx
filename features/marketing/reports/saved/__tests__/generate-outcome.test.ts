// The Generate button's states, from the real server answers.
import {
  ROW_SECURITY_SHORT,
  generateStateFromOutcome,
} from "../generate-outcome";

// Verbatim from a live screen-run `seo_report save` as admin@admin.com, 2026-10-05.
const LIVE_REFUSAL = {
  error_type: "validation",
  message:
    'The report could not be saved: the database refused the write for this account (1 op(s) unwritable even individually; batch cause: asyncpg.exceptions.InsufficientPrivilegeError: new row violates row-level security policy for table "artifact" [SQLSTATE 42501]). Nothing was saved.',
  suggested_action:
    "Save it from a conversation in the organization the report is for; if the earlier report of this job was saved by someone else, ask them or the organization to share it with this person first.",
};

it("a row-security refusal becomes a short reason in the slot and the server's advice in the tooltip", () => {
  const state = generateStateFromOutcome({ status: "error", error: LIVE_REFUSAL });
  expect(state).toEqual({
    kind: "refused",
    short: ROW_SECURITY_SHORT,
    detail: "Save it from a conversation in the organization the report is for.",
  });
  if (state.kind !== "refused") throw new Error("unreachable");
  expect(state.short.length).toBeLessThanOrEqual(60);
  expect(state.detail.length).toBeLessThanOrEqual(140);
});

it("any other refusal keeps the server's own first clause, within the slot budget", () => {
  const state = generateStateFromOutcome({
    status: "error",
    error: {
      error_type: "validation",
      message: "That site belongs to a different organization than the one this conversation runs in. More.",
      suggested_action: "Ask the person to switch to the site's organization, then save again.",
    },
  });
  if (state.kind !== "refused") throw new Error(`expected refused, got ${state.kind}`);
  expect(state.short.startsWith("Not saved: That site belongs")).toBe(true);
  expect(state.short.length).toBeLessThanOrEqual(60);
  expect(state.detail.length).toBeLessThanOrEqual(140);
});

it("a saved report names its version and the viewer link", () => {
  const state = generateStateFromOutcome({
    status: "ok",
    callId: "c1",
    output: {
      __kind: "seo.tool_envelope",
      status: "ok",
      cost: { class: "free" },
      data: {
        report_id: "r1",
        version: 2,
        replaced_earlier_version: true,
        title: "T",
        link: "/artifacts/r1",
      },
    },
  });
  expect(state).toEqual({ kind: "saved", reportId: "r1", version: 2, replaced: true, link: "/artifacts/r1" });
});

it("a declined spend is a refusal, never a silent no-op", () => {
  expect(generateStateFromOutcome({ status: "declined" }).kind).toBe("refused");
});
