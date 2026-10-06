/** @jest-environment jsdom */
// The templates view marks the active template and chooses another through the
// knob, at the chosen rung, in the SITE'S organization.

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const choose = jest.fn();
let knobValue: { effective_value: string; origin: string } | null = null;

jest.mock("../service", () => ({
  chooseSeoReportTemplate: (...args: unknown[]) => choose(...args),
}));
jest.mock("../hooks", () => ({
  useTemplateKnob: () => ({ data: knobValue, isLoading: false }),
  useSeoReportTemplates: () => ({
    reload: jest.fn(),
    state: {
      kind: "ready",
      data: {
        selected_template_id: "tpl-platform",
        templates: [
          { template_id: "tpl-platform", name: "SEO report", version: 1, platform_default: true, required_sections: [], brand_id: null },
          { template_id: "tpl-agency", name: "Agency monthly", version: 2, platform_default: false, required_sections: [], brand_id: null },
        ],
      },
    },
  }),
}));

import { SeoReportTemplatesPanel } from "../SeoReportTemplatesPanel";

let root: Root;
let host: HTMLDivElement;
function mount() {
  host = document.createElement("div");
  document.body.appendChild(host);
  root = createRoot(host);
  act(() => {
    root.render(
      <QueryClientProvider client={new QueryClient()}>
        <SeoReportTemplatesPanel organizationId="org-site" siteId="site-1" brandId="brand-1" />
      </QueryClientProvider>,
    );
  });
}
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  choose.mockReset();
});

function row(name: string): HTMLLIElement {
  const li = Array.from(host.querySelectorAll("li")).find((l) => l.textContent?.includes(name));
  if (!li) throw new Error(`no row for ${name}`);
  return li as HTMLLIElement;
}

it("marks the template the knob resolves to, and which rung set it", () => {
  knobValue = { effective_value: "tpl-agency", origin: "brand" };
  mount();
  expect(row("Agency monthly").querySelector('[data-testid="active-template"]')?.textContent).toBe("Active · Brand");
  expect(row("SEO report").querySelector('[data-testid="active-template"]')).toBeNull();
});

it("choosing a template writes the knob for this site in the site's organization", async () => {
  knobValue = { effective_value: "tpl-platform", origin: "platform_default" };
  choose.mockResolvedValue({ ok: true });
  mount();
  const use = row("Agency monthly").querySelector("button") as HTMLButtonElement;
  expect(use.textContent).toContain("Use for site");
  await act(async () => {
    use.click();
  });
  expect(choose).toHaveBeenCalledWith({ organizationId: "org-site", rung: "site", scopeId: "site-1", templateId: "tpl-agency" });
});

it("a refused choice says it was not changed", async () => {
  knobValue = { effective_value: "tpl-platform", origin: "platform_default" };
  choose.mockResolvedValue({ ok: false, reason: "forbidden", detail: "You are not an owner or admin." });
  mount();
  await act(async () => {
    (row("Agency monthly").querySelector("button") as HTMLButtonElement).click();
  });
  expect(host.querySelector('[role="alert"]')?.textContent).toContain("Not changed");
});
