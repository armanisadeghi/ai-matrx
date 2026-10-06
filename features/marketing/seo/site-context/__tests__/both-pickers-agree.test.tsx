/** @jest-environment jsdom */
// The SEO plan editor's role picker and the context page's role picker offer
// the SAME list — the organization's page-role knob — for the same page, and a
// recorded navigational page reads as itself under the shipped list.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const SHIPPED = { allowed: ["money", "hub", "spoke", "navigational"], aliases: { supporting: "spoke" } };

jest.mock("@/components/ui/select", () => ({
  Select: ({ children, value }: { children: React.ReactNode; value?: string }) => (
    <div data-picker="plan" data-value={value ?? ""}>{children}</div>
  ),
  SelectTrigger: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: ({ children }: { children: React.ReactNode }) => <div>{children}</div>,
  SelectItem: ({ value }: { value: string }) => <span data-plan-option={value} />,
}));
jest.mock("@ai-matrx/design-system/controls", () => {
  const actual = jest.requireActual("@ai-matrx/design-system/controls");
  return {
    ...actual,
    Select: ({ value, options }: { value: string; options: { value: string }[] }) => (
      <div data-picker="context" data-value={value}>
        {options.map((o) => (
          <span key={o.value} data-context-option={o.value} />
        ))}
      </div>
    ),
  };
});
jest.mock("@/components/official/TextArrayInput", () => () => null);
jest.mock("@/components/official/ProTextarea", () => ({ ProTextarea: () => null }));
jest.mock("@/components/official/InfoHint", () => ({ InfoHint: () => null }));
jest.mock("@/features/marketing/data/hooks", () => ({
  useUpdatePageDesiredValues: () => ({ mutateAsync: jest.fn(), isPending: false }),
}));
const settingsFor = jest.fn();
jest.mock("@/features/marketing/seo/site-context/hooks", () => ({
  useSiteContextSettings: (orgId: string) => settingsFor(orgId),
}));

import { SeoPlanRoleFields } from "@/features/marketing/seo/plan/SeoPlanFields";
import { PageRoleRow } from "../SiteContextWorkspace";
import { pageRoleOptions } from "../page-roles";

let root: Root;
let host: HTMLDivElement;
function mount(node: React.ReactNode) {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => root.render(node));
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

function bothLists(stored: string) {
  settingsFor.mockReturnValue({ data: { vocabulary: SHIPPED, origin: "platform_default", maxBytes: 8000 }, error: null });
  mount(
    <>
      <SeoPlanRoleFields
        organizationId="org-page"
        pageRole={stored}
        supportsRoutes={[]}
        reason=""
        onPageRoleChange={jest.fn()}
        onSupportsRoutesChange={jest.fn()}
        onReasonChange={jest.fn()}
      />
      <ul>
        <PageRoleRow
          page={{ id: "p1", url: "https://x.test/a", version: 1, desired_values: { keyword_plan: { page_role: stored } } }}
          siteId="s1"
          brandRoute="b"
          vocabulary={SHIPPED}
          onSaved={jest.fn()}
        />
      </ul>
    </>,
  );
  const plan = Array.from(host.querySelectorAll("[data-plan-option]")).map((e) => e.getAttribute("data-plan-option"));
  const context = Array.from(host.querySelectorAll("[data-context-option]"))
    .map((e) => e.getAttribute("data-context-option"))
    .filter((v) => v !== "__none");
  return { plan, context };
}

it("the SEO plan editor reads the page's organization's knob", () => {
  bothLists("money");
  expect(settingsFor).toHaveBeenCalledWith("org-page");
});

it.each(["money", "navigational", "supporting", "pillar", ""])(
  "both pickers offer the same list for a page recorded as %p",
  (stored) => {
    const { plan, context } = bothLists(stored);
    expect(plan).toEqual(context);
    expect(plan.slice(0, 4)).toEqual(["money", "hub", "spoke", "navigational"]);
  },
);

it("navigational reads as itself: no extra 'as recorded' option", () => {
  expect(pageRoleOptions(SHIPPED, "navigational")).toEqual([
    { value: "money", label: "money" },
    { value: "hub", label: "hub" },
    { value: "spoke", label: "spoke" },
    { value: "navigational", label: "navigational" },
  ]);
  expect(pageRoleOptions(SHIPPED, "supporting").at(-1)).toEqual({
    value: "supporting",
    label: "supporting",
    meta: "reads as spoke",
  });
});
