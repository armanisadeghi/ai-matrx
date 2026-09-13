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

import { resumePendingAuthAction } from "../messageActionRegistry";

it("keeps the post-auth Document replay quiet when organization selection is cancelled", async () => {
  const error = new Error("not now");
  error.name = "OrganizationSelectionCancelled";
  ensureOrganizationContext.mockRejectedValue(error);
  isOrganizationSelectionCancelled.mockReturnValue(true);
  sessionStorage.setItem(
    "matrx_pending_post_auth_action",
    JSON.stringify({ action: "add-docs", savedContent: "Draft content" }),
  );

  resumePendingAuthAction(
    true,
    "Draft content",
    jest.fn(),
    jest.fn(),
    () => ({}) as never,
  );
  await Promise.resolve();
  await Promise.resolve();

  expect(pushMarkdownToDocument).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
});
