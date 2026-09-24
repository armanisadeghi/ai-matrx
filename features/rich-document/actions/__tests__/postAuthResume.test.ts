/**
 * Post-auth resume replays the gated action through the ONE registry handler
 * (RC-B6 — the chat menu used to keep a second copy of eleven of them).
 */
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
  toast: {
    error: (...args: unknown[]) => toastError(...args),
    success: jest.fn(),
    loading: jest.fn(),
    info: jest.fn(),
    warning: jest.fn(),
    dismiss: jest.fn(),
  },
}));

import "../handlers";
import { resumePendingAuthAction } from "../resumePendingAuthAction";
import { chatContext } from "../../test-utils/chatContext";

beforeEach(() => {
  sessionStorage.clear();
  jest.clearAllMocks();
});

it("keeps the post-auth Document replay quiet when organization selection is cancelled", async () => {
  const error = new Error("not now");
  error.name = "OrganizationSelectionCancelled";
  ensureOrganizationContext.mockRejectedValue(error);
  isOrganizationSelectionCancelled.mockReturnValue(true);
  const ctx = chatContext("assistant", { content: "Draft content" });
  sessionStorage.setItem(
    "matrx_pending_post_auth_action",
    JSON.stringify({ action: "add-to-docs", savedContent: "Draft content" }),
  );

  resumePendingAuthAction(ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(ensureOrganizationContext).toHaveBeenCalled();
  expect(pushMarkdownToDocument).not.toHaveBeenCalled();
  expect(toastError).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("matrx_pending_post_auth_action")).toBeNull();
});

it("replays the stashed action through its registry handler for the same content", async () => {
  const dispatch = jest.fn();
  const ctx = chatContext("assistant", { content: "Keep this", dispatch });
  sessionStorage.setItem(
    "matrx_pending_post_auth_action",
    JSON.stringify({ action: "save-to-notes", savedContent: "Keep this" }),
  );

  resumePendingAuthAction(ctx);
  await new Promise((resolve) => setTimeout(resolve, 0));

  expect(dispatch.mock.calls[0]?.[0]?.payload?.overlayId).toBe(
    "quickNoteSaveWindow",
  );
});

it("leaves a stash for different content alone", () => {
  const dispatch = jest.fn();
  const ctx = chatContext("assistant", { content: "Other text", dispatch });
  sessionStorage.setItem(
    "matrx_pending_post_auth_action",
    JSON.stringify({ action: "save-to-notes", savedContent: "Keep this" }),
  );
  resumePendingAuthAction(ctx);
  expect(dispatch).not.toHaveBeenCalled();
  expect(sessionStorage.getItem("matrx_pending_post_auth_action")).not.toBeNull();
});
