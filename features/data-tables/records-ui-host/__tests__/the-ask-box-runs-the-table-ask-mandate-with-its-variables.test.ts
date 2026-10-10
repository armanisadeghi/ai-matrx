// THE ASK BOX AT CEDAR RIDGE: the office manager types a line; the app runs the `table.ask` mandate
// headless with the table, the line and the view as VARIABLES and reads the structured output.
// BREAKS CAUGHT: a raw agent id instead of the mandate; the line sent as user_input; JSON read wrong.
import { askTableByMandate, tableAskAnswerFrom } from "../askTable";

const TABLE = "ae674b7a-6433-4cf2-8a7e-a1f7997ddf4d";
const body = {
  mode: "proposed_edits",
  answer: "Two visits are past due.",
  cited_record_ids: ["r1"],
  proposed_changes: [{ record_id: "r1", field_key: "status", from: "Scheduled", to: "No-show", reason: "Past" }, { nope: 1 }],
  could_not: ["No phone column"],
};

describe("askTableByMandate", () => {
  it("launches table.ask headless with the variables and reads the structured output", async () => {
    const launchMandate = jest.fn(async () => ({ conversationId: "c1", responseText: "```json\n" + JSON.stringify(body) + "\n```" }));
    const got = await askTableByMandate({ launchMandate: launchMandate as never, organizationId: "o1", ask: { tableId: TABLE as never, question: "past due?", viewId: "" } });
    expect(launchMandate).toHaveBeenCalledTimes(1);
    const [key, options] = launchMandate.mock.calls[0] as unknown as [string, Record<string, any>];
    expect(key).toBe("table.ask");
    expect(options.config.displayMode).toBe("direct");
    expect(options.runtime.variables).toEqual({ table_id: TABLE, question: "past due?", view_id: "", max_words: "120" });
    expect(options.runtime.userInput).toBeUndefined();
    expect(got).toEqual({
      ok: true,
      answer: {
        mode: "proposed_edits",
        answer: "Two visits are past due.",
        cited_record_ids: ["r1"],
        proposed_changes: [{ record_id: "r1", field_key: "status", from: "Scheduled", to: "No-show", reason: "Past" }],
        could_not: ["No phone column"],
      },
      costPoints: null,
    });
  });
  it("hands back the run's cost in points at the viewer's rate, and null when unmeasured", async () => {
    const launchMandate = jest.fn(async () => ({ conversationId: "c1", requestId: "req1", responseText: "Nine visits." }));
    const ask = { tableId: TABLE as never, question: "x", viewId: "" };
    const got = await askTableByMandate({ launchMandate: launchMandate as never, organizationId: null, ask, readCostUsd: () => 0.0123, pointsRate: () => 20000 });
    expect(got).toMatchObject({ ok: true, costPoints: 246 });
    const noRate = await askTableByMandate({ launchMandate: launchMandate as never, organizationId: null, ask, readCostUsd: () => 0.0123, pointsRate: () => null });
    expect(noRate).toMatchObject({ ok: true, costPoints: null });
  });
  it("says why when the run fails or answers nothing", async () => {
    const boom = await askTableByMandate({ launchMandate: (async () => { throw new Error("Unknown mandate"); }) as never, organizationId: null, ask: { tableId: TABLE as never, question: "x", viewId: "" } });
    expect(boom).toEqual({ ok: false, message: "Unknown mandate" });
    const empty = await askTableByMandate({ launchMandate: (async () => ({ conversationId: "c" })) as never, organizationId: null, ask: { tableId: TABLE as never, question: "x", viewId: "" } });
    expect(empty.ok).toBe(false);
  });
  it("plain words stay an answer", () => {
    expect(tableAskAnswerFrom("Nine visits.").answer).toBe("Nine visits.");
  });
});
