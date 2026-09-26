const ensureOrganizationContext = jest.fn();
const isOrganizationSelectionCancelled = jest.fn();
const pushMarkdownToDocument = jest.fn();
const toastError = jest.fn();

jest.mock("@/lib/organization/organization-gate", () => ({
  ensureOrganizationContext: (...args: unknown[]) =>
    ensureOrganizationContext(...args),
  isOrganizationSelectionCancelled: (error: unknown) =>
    isOrganizationSelectionCancelled(error),
}));
jest.mock("@/features/data-tables/export-targets", () => ({
  pushMarkdownToDocument: (...args: unknown[]) => pushMarkdownToDocument(...args),
}));
jest.mock("@/lib/toast", () => ({
  toast: { error: (...args: unknown[]) => toastError(...args) },
}));

import "./save";
import { getAction } from "../provider";

it("keeps Save to Document quiet when organization selection is cancelled", async () => {
  const error = new Error("not now");
  error.name = "OrganizationSelectionCancelled";
  ensureOrganizationContext.mockRejectedValue(error);
  isOrganizationSelectionCancelled.mockReturnValue(true);

  const action = getAction("add-to-docs");
  expect(action).toBeTruthy();
  await action!.run({
    content: "Draft content",
    organizationId: null,
    isAuthenticated: true,
    source: { type: "raw" },
    dispatch: jest.fn(),
    instanceKey: () => "test",
  } as never);

  expect(pushMarkdownToDocument).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
});
