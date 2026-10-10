/**
 * DUPLICATE OPENS THE COPY IN A NEW TAB (Arman, 2026-10-06): "if the agent
 * doesn't belong to the user, let's give them the option to duplicate … which
 * should create a duplicate and then open a new tab that navigates them to
 * that agents page." The chat they were in stays where it is.
 *
 * RED before: the peek's Duplicate (then in the app) navigated THIS tab away
 * with router.push, and the chat composer's agent pill offered no peek at all.
 * Found live: the organization question opened BEHIND the peek.
 *
 * The flow today drives THE one Duplicate dialog: the peek's Duplicate opens it
 * (version + name), confirming makes the copy, and its success step offers
 * "Open in new tab" (this tab and its chat stay where they are) beside "Open
 * new agent" (this tab) — the peek closes once the dialog does.
 */
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const state = {
  record: { id: "agent-1", name: "Writer", isOwner: null as boolean | null, createdBy: "someone-else" },
  userId: "me",
};
const duplicateAgent = jest.fn((arg: unknown) => ({ type: "test/duplicate", arg }));
const push = jest.fn();

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: (...args: unknown[]) => push(...args), replace: jest.fn(), back: jest.fn(), refresh: jest.fn() }),
  usePathname: () => "/agents",
}));
jest.mock("@ai-matrx/chat/store/hooks", () => ({
  useAppDispatch: () => () => ({ unwrap: () => Promise.resolve("copy-9") }),
  // The real store (withAppStore below): the surface-config selectors the dialog reads need real state.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  useAppSelector: (select: (s: unknown) => unknown) => require("react-redux").useSelector(select),
}));
// The Duplicate flow's own dispatch: the thunk is the subject's neighbour, so it is a stub that resolves to the new id.
jest.mock("@/lib/redux/hooks", () => ({
  ...jest.requireActual("@/lib/redux/hooks"),
  useAppDispatch: () => (action: { id?: string }) => ({ unwrap: () => Promise.resolve("copy-9"), action }),
}));
// The flow reads the source's name + version history before it offers the form.
jest.mock("@/utils/supabase/client", () => {
  const single = () => Promise.resolve({ data: { name: "Writer", version: 3, agent_type: "user" }, error: null });
  const chain = { select: () => chain, eq: () => chain, single };
  return { supabase: { schema: () => ({ from: () => chain }), rpc: () => Promise.resolve({ data: [], error: null }) } };
});
jest.mock("@ai-matrx/chat/host/identity", () => ({ selectUserId: () => state.userId }));
jest.mock("@ai-matrx/chat/agents/redux/agent-definition/selectors", () => ({
  ...jest.requireActual("@ai-matrx/chat/agents/redux/agent-definition/selectors"),
  selectAgentById: () => state.record,
  selectAgentReadyForBuilder: () => true,
}));
jest.mock("@/features/agents/redux/builder-write.thunks", () => ({ duplicateAgent: (arg: unknown) => duplicateAgent(arg) }));
jest.mock("@/features/agents/redux/fetch-full-agent.thunk", () => ({ fetchFullAgent: () => ({ unwrap: () => Promise.resolve() }) }));
jest.mock("@ai-matrx/chat/host/notify", () => ({ toast: { success: jest.fn(), error: jest.fn() } }));

import { AgentPeekDuplicateButton } from "../AgentPeekDuplicateButton";
import { withAppStore } from "@/tests/helpers/WithStoreReads";

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  push.mockClear();
  duplicateAgent.mockClear();
  host = document.createElement("div");
  document.body.appendChild(host);
  root = withAppStore(createRoot(host));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.body.innerHTML = "";
});

const flush = () => act(async () => { await new Promise((r) => setTimeout(r, 0)); });
const buttonLabelled = (label: string) =>
  [...document.body.querySelectorAll("button")].find((b) => b.textContent?.trim() === label) as HTMLButtonElement | undefined;

/** Peek Duplicate -> the dialog's form -> confirm -> the success step. */
async function duplicateThroughTheDialog(onStart?: () => void) {
  state.record.createdBy = "someone-else";
  act(() => root.render(<AgentPeekDuplicateButton agentId="agent-1" onStart={onStart} />));
  const peekButton = host.querySelector("button");
  expect(peekButton?.textContent).toContain("Duplicate");
  await act(async () => {
    peekButton?.click();
  });
  await flush();
  // The dialog asks version + name first; the copy is made only on confirm.
  const form = document.body.querySelector("form");
  expect(form).not.toBeNull();
  expect((document.body.querySelector('input[aria-label="Name of the new agent"]') as HTMLInputElement).value).toContain("Writer");
  await act(async () => {
    form!.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
  });
  await flush();
  expect(document.body.textContent).toContain("Copy created.");
}

it("copies an agent you do not own through the dialog, opens the copy in a new tab, and closes the peek", async () => {
  const tab = { opener: {} as unknown };
  const open = jest.spyOn(window, "open").mockReturnValue(tab as unknown as Window);
  const onStart = jest.fn();
  await duplicateThroughTheDialog(onStart);
  expect(duplicateAgent).toHaveBeenCalledWith(expect.objectContaining({ agentId: "agent-1", asSystem: false, name: "Writer (Copy)" }));
  expect(onStart).not.toHaveBeenCalled();
  await act(async () => {
    buttonLabelled("Open in new tab")!.click();
  });
  expect(open).toHaveBeenCalledWith("/agents/copy-9/build", "_blank", "noopener,noreferrer");
  expect(push).not.toHaveBeenCalled();
  // The peek closes once the dialog does.
  expect(onStart).toHaveBeenCalledTimes(1);
  open.mockRestore();
});

it("the success step always keeps a door in THIS tab too: Open new agent", async () => {
  const open = jest.spyOn(window, "open").mockReturnValue(null);
  await duplicateThroughTheDialog();
  expect(buttonLabelled("Open in new tab")).toBeDefined();
  await act(async () => {
    buttonLabelled("Open new agent")!.click();
  });
  expect(push).toHaveBeenCalledWith("/agents/copy-9/build");
  open.mockRestore();
});

it("offers nothing for your own agent", () => {
  state.record.createdBy = "me";
  act(() => root.render(<AgentPeekDuplicateButton agentId="agent-1" />));
  expect(host.querySelector("button")).toBeNull();
});
