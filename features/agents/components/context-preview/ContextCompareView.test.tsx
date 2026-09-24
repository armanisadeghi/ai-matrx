/**
 * The compare tab (lane SC-3'): what it asks the server, and what it shows.
 *
 * Only the API door and the Redux hooks are mocked; the view and the hook are
 * the real code. The payload is the shape the server's compare builder returns
 * (aidream conversation_context/context_compare.py) for Jordan Ellis, a
 * Brightline coordinator whose pilot task is tagged to Harborline's Dispatch
 * app: the old path handed him Harborline's values through the tag without a
 * check, and the record store refused the scope for him.
 */

import React, { act } from "react";
import { createRoot, type Root } from "react-dom/client";

jest.mock("@/lib/api/call-api", () => ({ callApi: jest.fn() }));
jest.mock("@/lib/redux/hooks", () => ({
  useAppDispatch: () => (thunk: unknown) => thunk,
  useAppSelector: (selector: (state: unknown) => unknown) => selector(undefined),
}));
jest.mock("@/lib/redux/slices/appContextSlice", () => ({
  selectScopeSelectionsContext: () => ({}),
}));
jest.mock(
  "@/features/agents/redux/execution-system/conversations/conversations.selectors",
  () => ({
    selectConversationScopeIds: () => () => ({ organizationId: undefined }),
  }),
);
jest.mock("@/components/matrx/buttons/InlineCopyButton", () => ({
  InlineCopyButton: () => null,
}));

import { callApi } from "@/lib/api/call-api";
import { ContextCompareView } from "./ContextCompareView";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const door = callApi as unknown as jest.Mock<Promise<{ data?: unknown }>, [unknown]>;

const DISPATCH = "5fd365ca-7d0e-4e1c-8b9b-a79131b38f20";

const compare = {
  ruling:
    "The new side checks every contributing record for the person; an old-path delivery without a check is labeled, not matched.",
  old: {
    path: "old",
    available: true,
    block: "<agent_context>\n  tech_stack: Next.js 16 + React 19.2\n</agent_context>",
    scope_ids: [DISPATCH],
    checks: [],
    withheld: [],
  },
  new: {
    path: "new",
    available: true,
    block: "<agent_context>\n</agent_context>",
    scope_ids: [],
    checks: [
      {
        record_id: DISPATCH,
        via: "entity_tag",
        admitted: false,
        reason: "not_opened",
        says: "This scope is not one you may open in the record store.",
      },
    ],
    withheld: [],
  },
  differences: [
    {
      item_id: "1a71b37b-05ab-45e1-b997-d7e95709275f",
      key: "tech_stack",
      scope_id: DISPATCH,
      scope_name: "Harborline Dispatch",
      old_value: "Next.js 16 + React 19.2",
      new_value: null,
      old_tier: "direct",
      new_tier: null,
      difference_class: "old path delivered without a check",
      why: "Harborline Dispatch reached the old path through a tag, and this person cannot read it.",
    },
  ],
  counts: { "old path delivered without a check": 1 },
  identical_cells: 0,
  defects: 0,
  follow: { running: false, pending: 0, says: "The copy does not follow edits on this database yet." },
  excluded: [],
};

async function mount(props: { agentId?: string }) {
  const host = document.createElement("div");
  document.body.appendChild(host);
  const root: Root = createRoot(host);
  await act(async () => {
    root.render(<ContextCompareView conversationId="conv-1" {...props} />);
  });
  await act(async () => {
    await Promise.resolve();
  });
  return {
    host,
    async unmount() {
      await act(async () => root.unmount());
      host.remove();
    },
  };
}

describe("ContextCompareView", () => {
  beforeEach(() => {
    door.mockReset();
    door.mockResolvedValue({ data: { compare, injected_block: null } });
  });

  it("asks the server for both paths", async () => {
    const view = await mount({});
    const req = door.mock.calls[0][0] as { path: string; body: Record<string, unknown> };
    expect(req.path).toBe("/ai/context/preview");
    expect(req.body.path).toBe("both");
    await view.unmount();
  });

  it("shows both blocks, the classed difference, and the refusal the new side made", async () => {
    const view = await mount({});
    const text = view.host.textContent ?? "";
    expect(view.host.querySelector('[data-compare-side="old"]')).not.toBeNull();
    expect(view.host.querySelector('[data-compare-side="new"]')).not.toBeNull();
    expect(
      view.host.querySelector('[data-difference-class="old path delivered without a check"]'),
    ).not.toBeNull();
    expect(text).toContain("No defects");
    expect(text).toContain("tech_stack");
    expect(text).toContain("tagged to this chat");
    expect(text).toContain("not delivered");
    // The line only the old block carries is highlighted.
    const oldSide = view.host.querySelector('[data-compare-side="old"]');
    expect(oldSide?.querySelector(".bg-amber-400\\/25")?.textContent).toContain("tech_stack");
    await view.unmount();
  });

  it("offers 'answer on both paths' only when there is an agent to answer", async () => {
    const without = await mount({});
    expect(without.host.querySelector("textarea")).toBeNull();
    expect(without.host.textContent).toContain("Open this panel from a chat");
    await without.unmount();

    const withAgent = await mount({ agentId: "agent-1" });
    expect(withAgent.host.querySelector("textarea")).not.toBeNull();
    await withAgent.unmount();
  });
});
