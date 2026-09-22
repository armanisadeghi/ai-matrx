import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@/components/ui/tooltip";

import type { ResearchTemplate } from "../types";
import {
  RESEARCH_TEMPLATE_COLUMNS,
  RESEARCH_TEMPLATES_COVERAGE,
  researchTemplateWiringCount,
  TemplateRowActions,
  toggleResearchTemplateExpanded,
} from "./TemplatesManager";

const template: ResearchTemplate = {
  id: "template-1",
  name: "Scientific Research",
  description: "A complete research workflow",
  is_system: false,
  created_by: "admin-1",
  keyword_templates: ["market", "audience"],
  default_tags: ["research"],
  default_search_params: null,
  agent_config: {
    page_summary_agent_id: "agent-summary",
    document_assembly_agent_id: "agent-document",
  },
  autonomy_level: "semi",
  metadata: { source: "admin" },
  created_at: "2026-09-21T00:00:00.000Z",
};

function column(id: string) {
  const found = RESEARCH_TEMPLATE_COLUMNS.find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new Error(`Missing ${id} column`);
  return found;
}

describe("TemplatesManager canonical table contract", () => {
  it("opens the named template through the registered record door", () => {
    const markup = renderToStaticMarkup(<>{column("name").cell?.(template, 0)}</>);
    expect(markup).toContain('href="/detail/research_template/template-1"');
    expect(markup).toContain("Scientific Research");
  });
  it("discloses unknown client-side source coverage", () => {
    expect(RESEARCH_TEMPLATES_COVERAGE).toEqual({
      noun: "research template",
      cap: 1000,
      answeredBy: "client",
    });
  });

  it("keeps template values independently filterable, including expanded values", () => {
    for (const id of [
      "name",
      "description",
      "system",
      "autonomy",
      "keywords",
      "default-tags",
      "agent-wiring",
      "id",
      "keyword-templates",
      "default-tag-values",
      "agent-config",
    ]) {
      expect(column(id).filter).not.toBe(false);
    }
    expect(column("keyword-templates").hidden).toBe(true);
    expect(column("default-tag-values").hidden).toBe(true);
    expect(column("agent-config").hidden).toBe(true);
  });

  it("counts only configured agent roles and preserves no-wiring as zero", () => {
    expect(researchTemplateWiringCount(template)).toBe(2);
    expect(
      researchTemplateWiringCount({ ...template, agent_config: null }),
    ).toBe(0);
  });

  it("retains explicit edit and delete action doors", () => {
    const markup = renderToStaticMarkup(
      <TooltipProvider>
        <TemplateRowActions
          template={template}
          onEdit={jest.fn()}
          onDelete={jest.fn()}
        />
      </TooltipProvider>,
    );

    expect(markup).toContain('aria-label="Edit Scientific Research"');
    expect(markup).toContain('aria-label="Delete Scientific Research"');
  });
});

describe("research templates expand several configurations at once", () => {
  it("opening a second template leaves the first one open", () => {
    const first = toggleResearchTemplateExpanded(new Set<string>(), "template-1");
    const both = toggleResearchTemplateExpanded(first, "template-2");
    expect([...both].sort()).toEqual(["template-1", "template-2"]);
  });

  it("collapsing one template leaves its neighbours open", () => {
    const open = new Set(["template-1", "template-2", "template-3"]);
    const next = toggleResearchTemplateExpanded(open, "template-2");
    expect([...next].sort()).toEqual(["template-1", "template-3"]);
  });

  it("never mutates the set the table handed it", () => {
    const open = new Set(["template-1"]);
    const next = toggleResearchTemplateExpanded(open, "template-2");
    expect([...open]).toEqual(["template-1"]);
    expect(next).not.toBe(open);
  });
});
