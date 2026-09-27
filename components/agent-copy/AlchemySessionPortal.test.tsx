/**
 * A SIGNED-IN PERSON IS NEVER TOLD TO SIGN IN (ALC-15 round 4, finding B).
 * "Create a task from conversation" with the destination missing said
 * "…is not available. Sign in and choose an organization…" to a person who was
 * signed in with a workspace chosen. The sentence must be true.
 *
 * Break it names: the fallback naming sign-in while a person is signed in → red.
 */
import { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const errors: { title: string; description?: string }[] = [];
jest.mock("@/lib/toast", () => ({
  toast: {
    error: (title: string, o?: { description?: string }) => errors.push({ title, description: o?.description }),
    loading: jest.fn(() => "t"),
    success: jest.fn(),
  },
}));
jest.mock("next/navigation", () => ({ useRouter: () => ({ push: jest.fn() }) }));
jest.mock("@ai-matrx/design-system/content-transfer", () => ({
  ContentTransferMenu: () => null,
  createTransferEmailActions: () => [],
  useContentTransferCapabilities: () => ({ actions: [] }),
}));
const state = { appContext: { organization_id: "org-1" }, user: { id: "user-1" }, userAuth: { id: "user-1" } };
jest.mock("@/lib/redux/store-singleton", () => ({ getStoreSingleton: () => ({ getState: () => state }) }));
jest.mock("@/lib/redux/slices/userSlice", () => ({ selectUserId: () => "user-1" }));

import { AlchemySessionPortal } from "./AlchemySessionPortal";
import { openAlchemySession } from "./alchemy-session";

it("a missing destination never tells a signed-in person to sign in", async () => {
  const root = createRoot(document.body.appendChild(document.createElement("div")));
  await act(async () => root.render(<AlchemySessionPortal />));
  await act(async () => {
    openAlchemySession({
      key: "k1",
      label: "Pool route plan",
      source: { kind: "markdown", text: "# Pool route plan" },
      intent: { kind: "action", actionId: "matrx:task", label: "Create a task from conversation" },
    });
    await new Promise((r) => setTimeout(r, 50));
  });
  expect(errors).toHaveLength(1);
  expect(`${errors[0]!.title} ${errors[0]!.description ?? ""}`).not.toMatch(/sign in/i);
});
