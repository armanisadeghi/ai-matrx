import { BackendApiError } from "@/lib/api/errors";
import { capacityRefusalOf } from "@/features/ai-work/lib/ownPlan";

const detail = {
  code: "sandbox_capacity_full",
  error: "sandbox_capacity_full",
  message: "All 5 of your 5 sandbox slots are in use, so a new coding sandbox can't start. Stop one of your sandboxes to continue.",
  user_message: "All 5 of your 5 sandbox slots are in use, so a new coding sandbox can't start. Stop one of your sandboxes to continue.",
  ceiling: 5,
  occupants: [
    { row_id: "r1", sandbox_id: "sbx-1", template: "bare", status: "running" },
    { row_id: "r2", sandbox_id: "sbx-2", template: "aidream", status: "running" },
  ],
};

describe("capacityRefusalOf", () => {
  it("finds the named boxes on the client error's details", () => {
    const err = new BackendApiError({
      code: "conflict" as never,
      detail: "conflict",
      userMessage: detail.user_message,
      details: detail,
      status: 409,
    });
    const found = capacityRefusalOf(err);
    expect(found?.ceiling).toBe(5);
    expect(found?.occupants.map((o) => o.sandbox_id)).toEqual(["sbx-1", "sbx-2"]);
    expect(found?.message).toContain("Stop one");
  });

  it("finds it nested under a raw body.detail", () => {
    expect(capacityRefusalOf({ body: { detail } })?.occupants).toHaveLength(2);
  });

  it("is null for any other refusal", () => {
    expect(capacityRefusalOf(new Error("boom"))).toBeNull();
    expect(capacityRefusalOf({ details: { code: "own_plan_unavailable" } })).toBeNull();
  });
});
