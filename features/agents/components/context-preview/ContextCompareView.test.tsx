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
// THE markdown renderer a chat answer goes through, stood in so the test can see what it is handed.
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: (props: { content?: string }) => <div data-markdown-stream>{props.content}</div>,
}));
jest.mock("@/lib/api/run-wait", () => ({
  resolveRunWait: jest.fn(async () => ({ firstResponseMs: 120_000 })),
}));
jest.mock("@/lib/api/organization-admission", () => ({
  peekSelectedOrganizationId: () => null,
}));
jest.mock("@/utils/auth/getUserId", () => ({ getUserId: () => "a1e2c3d4-0000-4000-8000-00000000a1e7" }));
jest.mock("@/components/matrx/buttons/InlineCopyButton", () => ({
  InlineCopyButton: () => null,
}));
// THE agent picker, stood in: one option per agent it would list.
jest.mock("@ai-matrx/agents/catalog/react", () => ({
  AgentListDropdown: (props: { onSelect: (id: string) => void; label: string; consumerId?: string }) => (
    <button type="button" data-agent-picker={props.consumerId} onClick={() => props.onSelect(INTAKE_AGENT)}>
      {props.label}
    </button>
  ),
}));
jest.mock("@/features/agents/redux/agent-definition/selectors", () => ({
  selectAllAgents: () => ({ [INTAKE_AGENT]: { name: "Client Intake Reviewer" } }),
}));
jest.mock("@/features/agents/redux/agent-definition/thunks", () => ({
  fetchAgentsList: () => ({ type: "agents/list" }),
}));

import { callApi } from "@/lib/api/call-api";
import { ContextCompareView, focusLines } from "./ContextCompareView";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

const door = callApi as unknown as jest.Mock<Promise<{ data?: unknown }>, [unknown]>;

const DISPATCH = "5fd365ca-7d0e-4e1c-8b9b-a79131b38f20";
const INTAKE_AGENT = "c0ffee00-1d2e-4f3a-8b5c-6d7e8f9a0b1c";
const CASTELLANO = "7cd12da2-2213-4378-8fba-a9e2dc4ea657";
const CLIENTS = "0b6f1c1e-6a1f-4c55-9d7e-1f2a3b4c5d6e";

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

async function mount(props: React.ComponentProps<typeof ContextCompareView>) {
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

describe("the two answers (lane INSPECTOR-TAILS)", () => {
  it("renders each answer through the platform's markdown renderer, never as raw text", async () => {
    door.mockReset();
    door.mockImplementation(async (req: unknown) => {
      const path = (req as { path?: string }).path;
      if (path === "/ai/context/preview/answer-both") {
        return {
          data: {
            says: "Both systems answered the same question.",
            answers: [
              { path: "old", answer: "**Primary Contact:** Priya Nair, Claims Supervisor — (619) 555-0177", duration_ms: 1800 },
              { path: "new", answer: "**Primary Contact:** Priya Nair — (619) 555-0177", duration_ms: 2000 },
            ],
          },
        };
      }
      return { data: { compare, injected_block: null } };
    });
    const view = await mount({ agentId: INTAKE_AGENT });
    try {
    const box = view.host.querySelector("textarea") as HTMLTextAreaElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    await act(async () => {
      setter.call(box, "What is the best phone number to reach Meridian Risk Services?");
      box.dispatchEvent(new Event("input", { bubbles: true }));
    });
    const button = [...view.host.querySelectorAll("button")].find((b) => b.textContent === "Answer on both paths")!;
    await act(async () => button.click());
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
    });
    for (const p of ["old", "new"]) {
      const side = view.host.querySelector(`[data-answer-path="${p}"]`);
      const rendered = side?.querySelector("[data-markdown-stream]");
      expect(rendered?.textContent).toContain("**Primary Contact:**");
    }
    } finally {
      await view.unmount();
    }
  });
});

describe("the inspector's selection and agent (lane CONTEXT-INSPECTOR-2)", () => {
  beforeEach(() => {
    door.mockReset();
    door.mockResolvedValue({ data: { compare, injected_block: null } });
  });

  it("sends the one ContextSelection — a type as the type — under its own organization", async () => {
    const selection = {
      organization_id: CASTELLANO,
      scope_type_id: CLIENTS,
      scope_id: null,
      context_item_id: null,
    };
    const view = await mount({ selection });
    const req = door.mock.calls[0][0] as {
      body: Record<string, unknown>;
      scopeOverrides?: { organization_id?: string };
    };
    expect(req.body.selection).toEqual(selection);
    expect(req.body).not.toHaveProperty("scope_ids");
    expect(req.scopeOverrides).toEqual({ organization_id: CASTELLANO });
    await view.unmount();
  });

  it("puts THE agent picker on 'answer on both paths' when the host lets the person choose", async () => {
    const chosen: Array<string | null> = [];
    const view = await mount({ onAgentChange: (id) => chosen.push(id) });
    const picker = view.host.querySelector('[data-agent-picker="context-inspector-answer-both"]');
    expect(picker?.textContent).toBe("Choose an agent");
    expect(view.host.querySelector("textarea")).toBeNull();
    expect(view.host.textContent).not.toContain("Open this panel from a chat");
    await act(async () => (picker as HTMLButtonElement).click());
    expect(chosen).toEqual([INTAKE_AGENT]);
    await view.unmount();

    const withAgent = await mount({ agentId: INTAKE_AGENT, onAgentChange: () => undefined });
    expect(withAgent.host.querySelector("[data-agent-picker]")?.textContent).toBe("Client Intake Reviewer");
    expect(withAgent.host.querySelector("textarea")).not.toBeNull();
    await withAgent.unmount();
  });
});

describe("focusLines — the inspector's context-item step", () => {
  const block = [
    "<agent_context>",
    "  <variables>",
    "    contact_phone: (619) 555-0177  [Meridian Risk Services]",
    "    contact_phone_extension: 204  [Meridian Risk Services]",
    "    industry [Meridian Risk Services]: Insurance services",
    "    industry [Golden State Indemnity Co.]: Workers' compensation insurance",
    "  </variables>",
    "</agent_context>",
  ].join("\n");

  it("keeps only the chosen item's lines, never a key that merely starts the same", () => {
    expect(focusLines(block, "contact_phone")).toEqual([
      "    contact_phone: (619) 555-0177  [Meridian Risk Services]",
    ]);
    expect(focusLines(block, "industry")).toHaveLength(2);
    expect(focusLines(block, "billing_contact")).toEqual([]);
  });
});
