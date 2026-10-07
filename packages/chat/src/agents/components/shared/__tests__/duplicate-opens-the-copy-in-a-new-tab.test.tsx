/**
 * DUPLICATE OPENS THE COPY IN A NEW TAB (Arman, 2026-10-06): "if the agent
 * doesn't belong to the user, let's give them the option to duplicate … which
 * should create a duplicate and then open a new tab that navigates them to
 * that agents page." The chat they were in stays where it is.
 *
 * RED before: the peek's Duplicate (then in the app) navigated THIS tab away
 * with router.push, and the chat composer's agent pill offered no peek at all.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = {
  record: { id: "agent-1", name: "Writer", isOwner: null as boolean | null, createdBy: "someone-else" },
  userId: "me",
};
const duplicateAgent = jest.fn((id: string) => ({ type: "test/duplicate", id }));

jest.mock("../../../../store/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve("copy-9") }),
  useAppSelector: (select: (s: unknown) => unknown) => select(null),
}));
jest.mock("../../../../host/identity", () => ({ selectUserId: () => state.userId }));
jest.mock("../../../redux/agent-definition/selectors", () => ({
  selectAgentById: () => state.record,
  selectAgentReadyForBuilder: () => true,
}));
jest.mock("../../../../host/builder-door", () => ({ getBuilderDoor: () => ({ duplicateAgent }) }));
jest.mock("../../../../host/notify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { AgentPeekDuplicateButton } from "../AgentPeekDuplicateButton";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

it("copies an agent you do not own and opens the copy's page in a new tab", async () => {
  const tab = { opener: {} as unknown, location: { href: "" }, close: jest.fn() };
  const open = jest.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  state.record.createdBy = "someone-else";
  act(() => root.render(<AgentPeekDuplicateButton agentId="agent-1" />));
  const button = host.querySelector("button");
  expect(button?.textContent).toContain("Duplicate");
  await act(async () => {
    button?.click();
  });
  expect(open).toHaveBeenCalledWith("about:blank", "_blank");
  expect(duplicateAgent).toHaveBeenCalledWith("agent-1");
  expect(tab.location.href).toBe("/agents/go/copy-9/build");
  expect(tab.opener).toBeNull();
  open.mockRestore();
});

it("offers nothing for your own agent", () => {
  state.record.createdBy = "me";
  act(() => root.render(<AgentPeekDuplicateButton agentId="agent-1" />));
  expect(host.querySelector("button")).toBeNull();
});
