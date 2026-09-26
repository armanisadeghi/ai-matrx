/**
 * Research "Re-read" / "Paste Content" with no workspace chosen used to do
 * nothing and only log OrganizationContextError. They now ask through the
 * platform's workspace prompt first, and every outcome is said out loud.
 */
const mockEnsureOrgId = jest.fn();
jest.mock("@/lib/organizations/personalOrg", () => ({
  ensureOrgId: (...a: unknown[]) => mockEnsureOrgId(...a),
}));
const mockToastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}));

import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { NO_WORKSPACE_SENTENCE, runResearchAction } from "../researchAction";

function contextError() {
  const e = new Error("Select an organization before sending this request.");
  e.name = "OrganizationContextError";
  return e;
}

beforeEach(() => {
  mockEnsureOrgId.mockReset();
  mockToastError.mockReset();
});

it("asks for a workspace before the action runs, then runs it", async () => {
  const order: string[] = [];
  mockEnsureOrgId.mockImplementation(async () => {
    order.push("ask");
    return "org1";
  });
  const result = await runResearchAction("Couldn't re-read", async () => {
    order.push("act");
    return 7;
  });
  expect(order).toEqual(["ask", "act"]);
  expect(result).toBe(7);
  expect(mockToastError).not.toHaveBeenCalled();
});

it("says 'choose a workspace first' when no workspace can be had — never a silent log", async () => {
  mockEnsureOrgId.mockRejectedValue(contextError());
  const action = jest.fn();
  expect(await runResearchAction("Couldn't re-read", action)).toBeNull();
  expect(action).not.toHaveBeenCalled();
  expect(mockToastError).toHaveBeenCalledWith(NO_WORKSPACE_SENTENCE);
});

it("says the same when the action itself is refused for a missing workspace", async () => {
  mockEnsureOrgId.mockResolvedValue("org1");
  await runResearchAction("Couldn't save", async () => {
    throw contextError();
  });
  expect(mockToastError).toHaveBeenCalledWith(NO_WORKSPACE_SENTENCE);
});

it("treats closing the picker as the person's answer: nothing runs, nothing shouts", async () => {
  mockEnsureOrgId.mockRejectedValue(new OrganizationSelectionCancelled());
  const action = jest.fn();
  expect(await runResearchAction("Couldn't re-read", action)).toBeNull();
  expect(action).not.toHaveBeenCalled();
  expect(mockToastError).not.toHaveBeenCalled();
});

it("says any other failure in its own words", async () => {
  mockEnsureOrgId.mockResolvedValue("org1");
  await runResearchAction("Couldn't save pasted content", async () => {
    throw new Error("Source not found");
  });
  expect(mockToastError).toHaveBeenCalledWith(
    "Couldn't save pasted content: Source not found",
  );
});
