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
// THE platform diff viewer, stood in so the test can read exactly what it is asked to diff.
jest.mock("@ai-matrx/diff/react", () => ({
  DiffViewer: (props: { original: string; modified: string; originalLabel?: string; modifiedLabel?: string }) => (
    <div
      data-diff-stub
      data-original={props.original}
      data-modified={props.modified}
      data-labels={`${props.originalLabel ?? ""}|${props.modifiedLabel ?? ""}`}
    />
  ),
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

/** The server's `delivered` for Castellano → Clients → Meridian (lane INSPECTOR-DIFF). */
const SHA = "94d2a29af2712e4663e1917ee93021b031f3a680";
const TODAY_ACTIVE = [
  "<active_context>",
  '  <organization id="7cd12da2-2213-4378-8fba-a9e2dc4ea657">Castellano &amp; Reyes, LLP</organization>',
  "  <active_scopes>",
  '    <scope type="Client" slug="meridian-risk-services">Meridian Risk Services</scope>',
  "  </active_scopes>",
  "</active_context>",
].join("\n");
const STORE_ACTIVE = TODAY_ACTIVE.replace(
  "  </active_scopes>",
  "  </active_scopes>\n  <not_delivered>\n    <scope id=\"3f0e2d1c\">not found</scope>\n  </not_delivered>",
);
const INTRO = "<organizations>\n  <organization>Castellano &amp; Reyes, LLP</organization>\n</organizations>";
function stamp(resolver: "chosen" | "record_store") {
  return {
    function: "assemble_turn_context",
    module: "aidream.services.conversation_context.turn_context",
    git_sha: SHA,
    run_path_callers: ["aidream.services.ai_execution.agent_run.prepare_agent_run"],
    resolver,
    says:
      resolver === "chosen"
        ? "From aidream.services.conversation_context.turn_context.assemble_turn_context — the same function, with the same arguments, that an agent run calls."
        : "From aidream.services.conversation_context.turn_context.assemble_turn_context — the run's function and arguments — with the values answered by the record store.",
  };
}
const ARGUMENTS = {
  user_id: "4cf62e4e-2679-484f-b652-034e697418df",
  conversation_id: "5b8d9f4e-7a3c-4d2b-9e1f-0a6c8b7d5e4f",
  agent_id: null,
  organization_id: CASTELLANO,
  scope_ids: ["3f0e2d1c-4b5a-4968-8776-5a4b3c2d1e0f"],
  active_scope_type_ids: [CLIENTS],
  include_intro: true,
  entity_is_new: true,
};
const delivered = {
  today: {
    path: "today",
    available: true,
    intro: INTRO,
    active: TODAY_ACTIVE,
    injected_block: `${INTRO}\n\n${TODAY_ACTIVE}`,
    block_sha256: "a1b2c3d4e5f6a7b8c9d0",
    block_byte_length: 512,
    provenance: stamp("chosen"),
  },
  record_store: {
    path: "record_store",
    available: true,
    intro: INTRO,
    active: STORE_ACTIVE,
    injected_block: `${INTRO}\n\n${STORE_ACTIVE}`,
    block_sha256: "ffeeddccbbaa99887766",
    block_byte_length: 590,
    provenance: stamp("record_store"),
  },
  identical: false,
  arguments: ARGUMENTS,
  says: "The model is fed two blocks from this function.",
};

async function click(el: Element | null) {
  expect(el).not.toBeNull();
  await act(async () => {
    const target = el as HTMLElement;
    target.dispatchEvent(new MouseEvent("mousedown", { bubbles: true, button: 0 }));
    target.click();
  });
}

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

  it("shows the classed difference on Diff, each side's values on its tab, and the refusal the new side made", async () => {
    const view = await mount({});
    const text = view.host.textContent ?? "";
    expect(
      view.host.querySelector('[data-difference-class="old path delivered without a check"]'),
    ).not.toBeNull();
    expect(text).toContain("No defects");
    expect(text).toContain("tech_stack");
    // The values the two resolvers answered are diffed, not highlighted by hand.
    const values = view.host.querySelector('[data-diff-viewer="values"] [data-diff-stub]');
    expect(values?.getAttribute("data-original")).toBe(compare.old.block);
    expect(values?.getAttribute("data-modified")).toBe(compare.new.block);
    await click(view.host.querySelector('[data-compare-tab="today"]'));
    expect(view.host.querySelector('[data-compare-side="old"]')).not.toBeNull();
    await click(view.host.querySelector('[data-compare-tab="store"]'));
    expect(view.host.querySelector('[data-compare-side="new"]')).not.toBeNull();
    expect(view.host.textContent).toContain("tagged to this chat");
    expect(view.host.textContent).toContain("not delivered");
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

describe("the four tabs — what the model is fed, exactly (lane INSPECTOR-DIFF)", () => {
  beforeEach(() => {
    door.mockReset();
    door.mockResolvedValue({ data: { compare, delivered, injected_block: delivered.today.injected_block } });
  });

  it("opens on Diff: the findings over a real diff of the fed bytes, then of the values", async () => {
    const view = await mount({});
    try {
      expect(view.host.querySelector("[data-compare-tabs]")?.getAttribute("data-compare-tabs")).toBe("diff");
      expect(view.host.querySelector("[data-compare-summary]")).not.toBeNull();
      const fed = view.host.querySelector('[data-diff-viewer="fed"] [data-diff-stub]');
      expect(fed?.getAttribute("data-original")).toBe(delivered.today.injected_block);
      expect(fed?.getAttribute("data-modified")).toBe(delivered.record_store.injected_block);
      expect(fed?.getAttribute("data-labels")).toBe("What the model gets today|Record store");
      expect(view.host.querySelector("[data-fed-identical]")?.textContent).toContain(
        "Different — 512 bytes today, 590 bytes from the record store",
      );
      const lines = [...view.host.querySelectorAll("[data-provenance]")].map((p) => p.textContent ?? "");
      expect(lines.some((l) => l.includes("turn_context.assemble_turn_context @ 94d2a29af2"))).toBe(true);
    } finally {
      await view.unmount();
    }
  });

  it("says byte-identical when both systems feed the model the same bytes", async () => {
    door.mockResolvedValue({
      data: { compare, delivered: { ...delivered, identical: true, record_store: delivered.today }, injected_block: null },
    });
    const view = await mount({});
    try {
      expect(view.host.querySelector("[data-fed-identical]")?.textContent).toContain(
        "Byte-identical — both systems feed the model the same 512 bytes",
      );
    } finally {
      await view.unmount();
    }
  });

  it("prints what the model gets today, byte for byte, with its provenance", async () => {
    const view = await mount({});
    try {
      await click(view.host.querySelector('[data-compare-tab="today"]'));
      const side = view.host.querySelector('[data-fed-side="today"]');
      expect(side?.querySelector('[data-fed-block="intro"] pre')?.textContent).toBe(INTRO);
      expect(side?.querySelector('[data-fed-block="active"] pre')?.textContent).toBe(TODAY_ACTIVE);
      expect(side?.querySelector("[data-fed-bytes]")?.textContent).toContain("512 bytes");
      expect(side?.querySelector('[data-provenance="chosen"]')?.textContent).toContain(
        "the same function, with the same arguments, that an agent run calls",
      );
      await click(view.host.querySelector('[data-compare-tab="store"]'));
      const store = view.host.querySelector('[data-fed-side="record_store"]');
      expect(store?.querySelector('[data-fed-block="active"] pre')?.textContent).toBe(STORE_ACTIVE);
      expect(store?.querySelector('[data-provenance="record_store"]')).not.toBeNull();
    } finally {
      await view.unmount();
    }
  });

  it("shows the selection sent and the exact arguments both sides received", async () => {
    const selection = {
      organization_id: CASTELLANO,
      scope_type_id: CLIENTS,
      scope_id: "3f0e2d1c-4b5a-4968-8776-5a4b3c2d1e0f",
      context_item_id: null,
    };
    const view = await mount({ selection, tab: "selection" });
    try {
      const sent = view.host.querySelector('[data-selection-block="sent"] pre')?.textContent ?? "";
      expect(JSON.parse(sent)).toEqual(selection);
      const args = view.host.querySelector('[data-selection-block="arguments"] pre')?.textContent ?? "";
      expect(JSON.parse(args)).toEqual(ARGUMENTS);
      expect(view.host.querySelector('[data-provenance="selection"]')?.textContent).toContain("assemble_turn_context");
    } finally {
      await view.unmount();
    }
  });

  it("an older server that does not report the fed bytes is said, never blank", async () => {
    door.mockResolvedValue({ data: { compare, injected_block: null } });
    const view = await mount({});
    try {
      expect(view.host.querySelector("[data-fed-missing]")?.textContent).toContain("older than this page");
      expect(view.host.querySelector('[data-diff-viewer="fed"]')).toBeNull();
    } finally {
      await view.unmount();
    }
  });
});

describe("the two answers (lane INSPECTOR-TAILS)", () => {
  it("renders each answer through the platform's markdown renderer, never as raw text", async () => {
    const answers = {
      data: {
        says: "Both systems answered the same question.",
        answers: [
          { path: "old", answer: "**Primary Contact:** Priya Nair, Claims Supervisor — (619) 555-0177", duration_ms: 1800 },
          { path: "new", answer: "**Primary Contact:** Priya Nair — (619) 555-0177", duration_ms: 2000 },
        ],
      },
    };
    const preview = { data: { compare, injected_block: null } };
    door.mockReset();
    door.mockImplementation(async (req: unknown) =>
      (req as { path?: string }).path === "/ai/context/preview/answer-both" ? answers : preview,
    );
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
