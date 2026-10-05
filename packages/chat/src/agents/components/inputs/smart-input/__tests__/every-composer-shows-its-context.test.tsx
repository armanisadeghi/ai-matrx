/**
 * EVERY COMPOSER SHOWS AND GOVERNS WHAT IT SENDS (N3).
 *
 * Break this catches: a composer variant that renders no ConversationContextRail
 * — its conversation then carries page values with no chip (nothing to see or
 * turn off) and without the page-follow hook (which rides inside the rail).
 * Seen live: the page-wide assistant box (presentation "ambient") sent 38 page
 * values on its first turn (conversation e89d9466) with no chip.
 *
 * SUT: SmartAgentInputStacked's choice of what to render per presentation. The
 * children are stand-ins that only say they rendered; the rail stand-in
 * records which conversation it was given.
 */

import React, { act } from "react";
import { createRoot } from "react-dom/client";

const railFor: string[] = [];
jest.mock("../ConversationContextRail", () => ({
  ConversationContextRail: ({ conversationId }: { conversationId: string }) => {
    railFor.push(conversationId);
    return null;
  },
}));
jest.mock("../AgentTextarea", () => ({ AgentTextarea: () => null }));
jest.mock("../SingleRowActionButtons", () => ({ SingleRowActionButtons: () => null }));
jest.mock("../InputActionButtons", () => ({ InputActionButtons: () => null }));
jest.mock("../SmartInputFileDropTarget", () => ({
  SmartInputFileDropTarget: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
}));
jest.mock("../../resources/SmartAgentResourceChips", () => ({ SmartAgentResourceChips: () => null }));
jest.mock("../../resources/AttachedDocumentChips", () => ({ AttachedDocumentChips: () => null }));
jest.mock("../../variable-input-variations/SmartAgentVariables", () => ({ SmartAgentVariables: () => null }));
jest.mock("../../../../../store/hooks", () => ({
  useAppDispatch: () => () => undefined,
  // showFreeformInput true, not executing, resources resolved.
  useAppSelector: () => true,
}));
// The host code this test renders reads the app's own hooks (P3): one double covers both.
jest.mock("@host/lib/redux/hooks", () => jest.requireMock("../../../../../store/hooks"));

import { SmartAgentInputStacked } from "../SmartAgentInputStacked";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

it.each([
  ["launcher", "e89d9466-page-assistant"],
  ["classic", "3712f46e-cost-sheet-chat"],
] as const)("the %s composer renders the context rail for its conversation", (style, id) => {
  railFor.length = 0;
  const root = createRoot(document.createElement("div"));
  act(() =>
    root.render(
      <SmartAgentInputStacked
        conversationId={id}
        composer={style === "launcher" ? { size: "launcher", mode: "chat" } : undefined}
      />,
    ),
  );
  expect(railFor).toContain(id);
  act(() => root.unmount());
});
