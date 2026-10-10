// The service turns every refusal into a sentence on screen. Red before: a refused door surfaced as a
// bare reason code, launch refusals had no name on them, and answers_incomplete lost its problems.
import { launchCycle, submitResponse, saveResponse } from "../service";
import { emptyAnswers } from "../types";

const rpc = jest.fn();
jest.mock("@/utils/supabase/client", () => ({ supabase: { schema: () => ({ rpc: (...a: unknown[]) => rpc(...a) }) } }));

beforeEach(() => rpc.mockReset());

describe("launch refusals", () => {
  it("names each refused person and says why, in words", async () => {
    rpc.mockResolvedValue({
      data: {
        ok: true,
        created: [{ review_id: "r1", employment_id: "e1", employee_name: "Elena Marquez", manager_name: "Daniel Okafor", employee_has_login: true }],
        refused: [
          { employment_id: "e2", employee_name: "Priya Raman", reason: "no_manager" },
          { employment_id: "e3", employee_name: "Tom Becker", reason: "already_in_cycle" },
        ],
      },
      error: null,
    });
    const { launchRefusalMessage } = await import("../messages");
    const r = await launchCycle("c1", { kind: "people", employmentIds: ["e1", "e2", "e3"] });
    expect(r.ok).toBe(true);
    if (!r.ok) return;
    expect(r.data.created).toHaveLength(1);
    const lines = r.data.refused.map((x) => launchRefusalMessage(x.employeeName, x.reason));
    expect(lines[0]).toMatch(/^Priya Raman has no manager on record/);
    expect(lines[1]).toBe("Tom Becker is already in this cycle.");
    for (const l of lines) expect(l).not.toMatch(/no_manager|already_in_cycle/);
  });
});

describe("a refused door is a visible message", () => {
  it("answers_incomplete keeps its problems and says to fix them", async () => {
    rpc.mockResolvedValue({
      data: { ok: false, reason: "answers_incomplete", problems: [{ question: "accomplishments", problem: "too_few", min_items: 2, have: 1 }] },
      error: null,
    });
    const r = await submitResponse("r1", "self");
    expect(r.ok).toBe(false);
    if (r.ok) return;
    expect(r.reason).toBe("answers_incomplete");
    expect(r.problems).toEqual([{ question: "accomplishments", problem: "too_few", minItems: 2, maxItems: null, have: 1 }]);
    expect(r.message.length).toBeGreaterThan(10);
  });

  it("a stale version says what to do, and carries the current version", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "version_conflict", current_version: 4 }, error: null });
    const r = await saveResponse("r1", "manager", emptyAnswers(), 2);
    expect(r).toMatchObject({ ok: false, reason: "version_conflict", currentVersion: 4 });
    if (!r.ok) expect(r.message).toMatch(/Reload/);
  });

  it("an unknown reason is still said, never swallowed", async () => {
    rpc.mockResolvedValue({ data: { ok: false, reason: "something_new" }, error: null });
    const r = await submitResponse("r1", "self");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toContain("something_new");
  });

  it("PGRST106 (schema not exposed) becomes one honest sentence", async () => {
    rpc.mockResolvedValue({ data: null, error: { code: "PGRST106", message: "The schema must be one of the following: public" } });
    const r = await submitResponse("r1", "self");
    expect(r).toMatchObject({ ok: false, reason: "schema_not_exposed" });
    if (!r.ok) expect(r.message).toMatch(/not reachable yet/);
  });

  it("a transport failure is a message, not a throw", async () => {
    rpc.mockRejectedValue(new Error("Failed to fetch"));
    const r = await submitResponse("r1", "self");
    expect(r.ok).toBe(false);
    if (!r.ok) expect(r.message).toMatch(/could not reach the server/);
  });

  it("calls the door in the declared schema, with the name and arguments the contract says", async () => {
    rpc.mockResolvedValue({ data: { ok: true, version: 1 }, error: null });
    await saveResponse("r1", "self", emptyAnswers(), null);
    expect(rpc).toHaveBeenCalledWith("hr_review_save_response", expect.objectContaining({ p_review_id: "r1", p_role: "self" }));
    expect(rpc.mock.calls[0]![1]).not.toHaveProperty("p_expected_version");
  });
});
