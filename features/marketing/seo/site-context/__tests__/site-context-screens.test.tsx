/** @jest-environment jsdom */
// The context page's three behaviors: a page role is edited inline through the
// page plan's one write (an outside word is offered, not blocked); the
// person's own expertise is set at the user rung; "What agents see" runs
// seo_site context and shows its notices, "none recorded" notes and exact text.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const mutateAsync = jest.fn();
const fetchKeywordPlan = jest.fn();
const setOwnExpertise = jest.fn();
const run = jest.fn();
let expertiseKnob: { effective_value: string; origin: string } | null = null;
let toolLast: unknown = null;

jest.mock("@ai-matrx/design-system/controls", () => {
  const actual = jest.requireActual("@ai-matrx/design-system/controls");
  return {
    ...actual,
    // A native select stands in for the menu so a test can choose an option.
    Select: ({ value, options, onValueChange, "aria-label": label, disabled }: {
      value: string;
      options: { value: string; label: string }[];
      onValueChange: (v: string) => void;
      "aria-label": string;
      disabled?: boolean;
    }) => (
      <select aria-label={label} value={value} disabled={disabled} onChange={(e) => onValueChange(e.target.value)}>
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    ),
  };
});
jest.mock("@ai-matrx/design-system", () => {
  const actual = jest.requireActual("@ai-matrx/design-system");
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    ...actual,
    Dialog: ({ open, children }: { open: boolean; children: React.ReactNode }) => (open ? <div role="dialog">{children}</div> : null),
    DialogContent: Pass,
    DialogHeader: Pass,
    DialogTitle: Pass,
    DialogDescription: Pass,
  };
});
jest.mock("@/components/official/InfoHint", () => ({
  InfoHint: ({ text }: { text: string }) => <span data-testid="hint">{text}</span>,
}));
jest.mock("@/features/marketing/data/hooks", () => ({
  useUpdatePageDesiredValues: () => ({ mutateAsync, isPending: false }),
}));
jest.mock("@/lib/redux/hooks", () => ({
  useAppSelector: (selector: { name?: string }) =>
    selector.name === "selectUserId" ? "user-1" : "org-active",
}));
jest.mock("@/features/scopes/redux/selectors/active-context", () => ({
  selectActiveOrganizationId: function selectActiveOrganizationId() {},
}));
jest.mock("@/lib/redux/selectors/userSelectors", () => ({
  selectUserId: function selectUserId() {},
}));
jest.mock("@/lib/toast", () => ({ toast: { error: jest.fn(), success: jest.fn() } }));
jest.mock("../service", () => {
  const actual = jest.requireActual("../service");
  return {
    ...actual,
    fetchKeywordPlan: (...a: unknown[]) => fetchKeywordPlan(...a),
    setOwnExpertise: (...a: unknown[]) => setOwnExpertise(...a),
    searchSitePages: jest.fn(),
  };
});
jest.mock("../hooks", () => {
  const actual = jest.requireActual("../hooks");
  return {
    ...actual,
    useOwnExpertise: () => ({ data: expertiseKnob, isLoading: false, error: null }),
    useAgentContextView: () => ({ run, running: false, last: toolLast, approvalDialog: null }),
  };
});

import { ExpertiseSection, PageRoleRow } from "../SiteContextWorkspace";
import { AgentViewDialog } from "../AgentViewDialog";
import { pythonJsonText } from "../agent-view";

let root: Root;
let host: HTMLDivElement;
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(<QueryClientProvider client={new QueryClient()}>{node}</QueryClientProvider>);
  });
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.clearAllMocks();
});

const vocab = { allowed: ["hub", "spoke", "money"], aliases: { supporting: "spoke" } };
const page = (role: string) => ({
  id: "page-1",
  url: "https://example.com/a",
  version: 3,
  desired_values: { keyword_plan: { page_role: role, primary_keyword_id: "k1" } },
});

async function choose(select: HTMLSelectElement, value: string) {
  await act(async () => {
    select.value = value;
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
}

describe("page role inline edit", () => {
  it("an outside word is kept as recorded, flagged, and still selectable", () => {
    mount(<ul><PageRoleRow page={page("Pillar")} siteId="site-1" brandRoute="b" vocabulary={vocab} onSaved={jest.fn()} /></ul>);
    const select = host.querySelector("select") as HTMLSelectElement;
    expect(select.value).toBe("Pillar");
    expect(Array.from(select.options).map((o) => o.value)).toEqual(["__none", "hub", "spoke", "money", "Pillar"]);
    expect(host.querySelector('[data-testid="role-outside"]')?.textContent).toBe("Not in list");
    expect(host.querySelector('[data-testid="hint"]')?.textContent).toContain("hub, spoke, money");
  });

  it("an older word reads as the role it maps to", () => {
    mount(<ul><PageRoleRow page={page("supporting")} siteId="site-1" brandRoute="b" vocabulary={vocab} onSaved={jest.fn()} /></ul>);
    expect(host.querySelector('[data-testid="role-alias"]')?.textContent).toBe("Reads as spoke");
  });

  it("choosing a role writes keyword_plan from the FRESH stored plan, keeping its other keys", async () => {
    fetchKeywordPlan.mockResolvedValue({ page_role: "Pillar", primary_keyword_id: "k-fresh", reason: "r" });
    mutateAsync.mockResolvedValue({});
    const onSaved = jest.fn();
    mount(<ul><PageRoleRow page={page("Pillar")} siteId="site-1" brandRoute="b" vocabulary={vocab} onSaved={onSaved} /></ul>);
    await choose(host.querySelector("select") as HTMLSelectElement, "money");
    expect(fetchKeywordPlan).toHaveBeenCalledWith("site-1", "page-1");
    expect(mutateAsync).toHaveBeenCalledWith({
      siteId: "site-1",
      pageId: "page-1",
      patch: { keyword_plan: { page_role: "money", primary_keyword_id: "k-fresh", reason: "r" } },
    });
    expect(onSaved).toHaveBeenCalled();
  });

  it("No role clears only the role", async () => {
    fetchKeywordPlan.mockResolvedValue({ page_role: "hub", primary_keyword_id: "k1" });
    mutateAsync.mockResolvedValue({});
    mount(<ul><PageRoleRow page={page("hub")} siteId="site-1" brandRoute="b" vocabulary={vocab} onSaved={jest.fn()} /></ul>);
    await choose(host.querySelector("select") as HTMLSelectElement, "__none");
    expect(mutateAsync.mock.calls[0][0].patch).toEqual({ keyword_plan: { primary_keyword_id: "k1" } });
  });
});

describe("own SEO expertise", () => {
  function button(label: string): HTMLButtonElement {
    const b = Array.from(host.querySelectorAll("button")).find((x) => x.textContent === label);
    if (!b) throw new Error(`no ${label} button`);
    return b as HTMLButtonElement;
  }

  it("shows the level and who set it; choosing one writes the user rung in the active organization", async () => {
    expertiseKnob = { effective_value: "practitioner", origin: "platform_default" };
    setOwnExpertise.mockResolvedValue({ ok: true });
    mount(<ExpertiseSection />);
    expect(host.querySelector('[data-testid="expertise-origin"]')?.textContent).toBe("Platform default");
    await act(async () => button("Expert").click());
    expect(setOwnExpertise).toHaveBeenCalledWith({ organizationId: "org-active", userId: "user-1", level: "expert" });
  });

  it("Use default clears the person's own value; a refusal is shown", async () => {
    expertiseKnob = { effective_value: "expert", origin: "user" };
    setOwnExpertise.mockResolvedValue({ ok: false, reason: "forbidden", detail: "Not a member of that organization." });
    mount(<ExpertiseSection />);
    await act(async () => button("Use default").click());
    expect(setOwnExpertise).toHaveBeenCalledWith({ organizationId: "org-active", userId: "user-1", level: null });
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("Not changed");
  });
});

describe("What agents see", () => {
  const envelope = {
    __kind: "seo.tool_envelope",
    status: "ok",
    data: {
      site: { site_id: "site-1" },
      goals: { source: "marketing.initiative (status active) for this site's brand", total: 0, items: [], note: "none recorded — the brand has no active initiative" },
      competitors: { source: "seo.competitor", total: 60, items: [{ domain: "a.com" }], more: 59, next: "context part='competitors' offset=1" },
    },
    cost: { class: "free" },
    notices: ["Match depth to the person's seo expertise: expert (your own setting).", "competitors: 59 more; page with part='competitors', offset=1."],
  };

  it("runs seo_site context for this site and shows notices, empty notes, paging and the exact text", async () => {
    toolLast = { status: "ok", output: envelope, callId: "c1" };
    mount(<AgentViewDialog siteId="site-1" maxBytes={8000} open onOpenChange={jest.fn()} />);
    expect(run).toHaveBeenCalledWith({ action: "context", site_id: "site-1" });
    const text = host.textContent ?? "";
    expect(text).toContain("Match depth to the person's seo expertise");
    expect(text).toContain("none recorded — the brand has no active initiative");
    expect(text).toContain("59 more");
    expect(text).toContain("Next: context part='competitors' offset=1");
    expect(host.querySelector('[data-testid="agent-view-size"]')?.textContent).toMatch(/of 8,000 bytes$/);
    const exact = Array.from(host.querySelectorAll("button")).find((b) => b.textContent === "Exact text");
    await act(async () => exact?.click());
    expect(host.querySelector('[data-testid="agent-view-exact"]')?.textContent).toBe(pythonJsonText(envelope));
  });

  it("a failed read says why instead of an empty view", () => {
    toolLast = { status: "error", error: { error_type: "forbidden", message: "You cannot view this site.", suggested_action: null } };
    mount(<AgentViewDialog siteId="site-1" maxBytes={null} open onOpenChange={jest.fn()} />);
    expect(host.querySelector('[role="alert"]')?.textContent).toContain("You cannot view this site.");
  });
});
