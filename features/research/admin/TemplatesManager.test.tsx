import { renderToStaticMarkup } from "react-dom/server";

import { TooltipProvider } from "@/components/ui/tooltip";

import type { ResearchTemplate } from "../types";
import {
  RESEARCH_TEMPLATE_COLUMNS,
  RESEARCH_TEMPLATES_COVERAGE,
  researchTemplateWiringCount,
  TemplateRowActions,
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
  it("discloses unknown client-side source coverage", () => {
    expect(RESEARCH_TEMPLATES_COVERAGE).toEqual({
      noun: "research template",
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
