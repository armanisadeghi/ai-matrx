/**
 * Guard: the frontend half of this feature is safe to ship before the server
 * half — it asks for nothing until a connection says there is something to ask
 * about.
 *
 * "Half-deployed cross-repo features are the dangerous state" (CLAUDE.md §
 * Release), and this one has a specific dangerous shape. If the attachments
 * read fired unconditionally, then for as long as aidream has not shipped
 * `GET /conversations/{id}/attachments` EVERY conversation on the platform
 * would carry an amber "could not read this chat's attachments" warning in its
 * header — a warning about a feature nobody has, on every screen, for every
 * user. That is how real warnings stop being read.
 *
 * So the read is gated on the capability itself: at least one connection whose
 * availability payload declares `attachable`. That is absence, not a
 * fallback — there is genuinely nothing to show — and the moment the server
 * declares one attachable resource, every failure from there on is loud again.
 *
 * Proven failing before passing: removing `hasAttachableConnection` from the
 * `shouldRead` condition makes the first case fetch (see the report).
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const dispatch = jest.fn();
const loadThunk = jest.fn((_args: { conversationId: string }) => ({
  type: "load",
}));

let entry = {
  rows: [] as unknown[],
  pending: [] as unknown[],
  status: "idle" as string,
  error: null as string | null,
  busyKeys: [] as string[],
  writeError: null as string | null,
};
let messageCount = 0;

jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: (state: unknown) => unknown) => selector({}),
  useAppDispatch: () => dispatch,
}));

jest.mock(
  "@/features/agents/redux/execution-system/messages/messages.selectors",
  () => ({ selectMessageCount: () => () => messageCount }),
);

jest.mock("../redux/attachments.slice", () => ({
  EMPTY_ATTACHMENTS_ENTRY: {
    rows: [],
    pending: [],
    status: "idle",
    error: null,
    busyKeys: [],
    writeError: null,
  },
  selectConversationAttachmentsEntry: () => () => entry,
  loadConversationAttachments: (args: { conversationId: string }) =>
    loadThunk(args),
  flushPendingAttachments: () => ({ type: "flush" }),
  attachResource: () => ({ type: "attach" }),
  detachResource: () => ({ type: "detach" }),
  dropPendingAttachment: () => ({ type: "drop" }),
}));

import { useConversationAttachments } from "../useConversationAttachments";

function Probe({ hasAttachableConnection }: { hasAttachableConnection: boolean }) {
  useConversationAttachments("33333333-3333-3333-3333-333333333333", {
    hasAttachableConnection,
  });
  return null;
}

describe("the attachments read is gated on the capability existing", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    dispatch.mockClear();
    loadThunk.mockClear();
    entry = {
      rows: [],
      pending: [],
      status: "idle",
      error: null,
      busyKeys: [],
      writeError: null,
    };
    messageCount = 4;
    Object.defineProperty(globalThis, "IS_REACT_ACT_ENVIRONMENT", {
      configurable: true,
      value: true,
    });
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => {
      root = createRoot(container);
    });
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
  });

  it("asks for nothing while no connection offers anything to choose", () => {
    act(() => {
      root.render(<Probe hasAttachableConnection={false} />);
    });
    expect(loadThunk).not.toHaveBeenCalled();
  });

  it("reads as soon as one connection does", () => {
    act(() => {
      root.render(<Probe hasAttachableConnection />);
    });
    expect(loadThunk).toHaveBeenCalledTimes(1);
  });

  it("still asks for nothing on a conversation that has produced nothing", () => {
    messageCount = 0;
    act(() => {
      root.render(<Probe hasAttachableConnection />);
    });
    expect(loadThunk).not.toHaveBeenCalled();
  });
});
