/**
 * Research "Re-read" / "Paste Content" with no workspace chosen used to do
 * nothing and only log OrganizationContextError. They now ask through the
 * platform's workspace prompt first, and every outcome is said out loud.
 */
const mockEnsureOrgId = jest.fn();
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: (...a: unknown[]) => mockEnsureOrgId(...a),
}));
const mockToastError = jest.fn();
jest.mock("@/lib/toast", () => ({
  toast: { error: (...a: unknown[]) => mockToastError(...a) },
}));
// The refusal is shown through the chat host's notify port (7bff33803f); the host here is the toast the test spies on.
jest.mock("@ai-matrx/chat/host/configure", () => ({
  ...jest.requireActual("@ai-matrx/chat/host/configure"),
  isChatHostConfigured: () => true,
  getChatHost: () => ({
    notify: { error: (...a: unknown[]) => mockToastError(...a) },
  }),
}));


import { OrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { OrganizationContextError } from "@/lib/api/organization-context";
import { runResearchAction } from "../researchAction";

function contextError() {
  return new OrganizationContextError(
    "organization_context_required",
    "Select an organization before sending this request.",
  );
}

/** The platform's one refusal: a title, and the sentence with its remedy — never the kernel's words. */
function expectOrganizationRefusal() {
  expect(mockToastError).toHaveBeenCalledTimes(1);
  expect(mockToastError).toHaveBeenCalledWith(
    "Choose an organization first",
    expect.objectContaining({
      description: expect.stringContaining("Nothing was saved because no organization is selected."),
    }),
  );
  expect(JSON.stringify(mockToastError.mock.calls)).not.toContain("Select an organization before");
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

it("says no organization is selected, with the remedy, when none can be had — never a silent log", async () => {
  mockEnsureOrgId.mockRejectedValue(contextError());
  const action = jest.fn();
  expect(await runResearchAction("Couldn't re-read", action)).toBeNull();
  expect(action).not.toHaveBeenCalled();
  expectOrganizationRefusal();
});

it("says the same when the action itself is refused for a missing organization", async () => {
  mockEnsureOrgId.mockResolvedValue("org1");
  await runResearchAction("Couldn't save", async () => {
    throw contextError();
  });
  expectOrganizationRefusal();
});

it("says the same when the SERVER refuses for a missing organization (organization_required)", async () => {
  mockEnsureOrgId.mockResolvedValue("org1");
  await runResearchAction("Couldn't save", async () => {
    throw Object.assign(new Error("organization required"), { code: "organization_required" });
  });
  expectOrganizationRefusal();
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
