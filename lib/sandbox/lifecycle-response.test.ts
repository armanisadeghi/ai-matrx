import {
  classifySandboxLifecycleResponse,
  sandboxLifecycleTransportUnknown,
} from "./lifecycle-response";

function response(status: number, payload: unknown) {
  return { ok: status >= 200 && status < 300, json: async () => payload };
}

describe("sandbox lifecycle response classification", () => {
  it("keeps an uncertain stop distinct from a definitive refusal", async () => {
    const unknown = await classifySandboxLifecycleResponse(
      response(502, { status: "outcome_unknown", error: "check persisted state" }),
      "Stop failed",
    );
    const refused = await classifySandboxLifecycleResponse(
      response(409, { error: "sandbox is busy" }),
      "Stop failed",
    );

    expect(unknown).toMatchObject({ kind: "outcome_unknown", message: "check persisted state" });
    expect(refused).toMatchObject({ kind: "failure", message: "sandbox is busy" });
  });

  it("treats a rejected fetch as reconciliation required, not failure", () => {
    expect(sandboxLifecycleTransportUnknown("delete")).toMatchObject({
      kind: "outcome_unknown",
      message: expect.stringContaining("Could not confirm"),
    });
  });
});
