import { renderToStaticMarkup } from "react-dom/server";

import type { ResearchProjectTableRow } from "./ProjectsOverview";
import {
  RESEARCH_PROJECT_COLUMNS,
  RESEARCH_PROJECTS_COVERAGE,
  loadResearchProjectSnapshot,
  researchProjectCreatedAt,
  researchProjectOverrideCount,
} from "./ProjectsOverview";

const row: ResearchProjectTableRow = {
  id: "topic-1",
  name: "Pricing research",
  status: "active",
  template_id: null,
  agent_config: {
    page_summary_agent_id: "agent-1",
  },
  autonomy_level: "semi",
  created_at: "2026-09-21T12:00:00.000Z",
  project_id: "project-1",
  template_name: null,
  agent_override_count: 1,
};

function column(id: string) {
  const found = RESEARCH_PROJECT_COLUMNS.find(
    (candidate) => candidate.id === id,
  );
  if (!found) throw new Error(`Missing ${id} column`);
  return found;
}

describe("ProjectsOverview canonical table contract", () => {
  it("discloses the client-filtered latest-50 source window", () => {
    expect(RESEARCH_PROJECTS_COVERAGE).toEqual({
      noun: "research topic",
      cap: 50,
      answeredBy: "client",
    });
  });

  it("keeps every meaningful project value independently filterable", () => {
    expect(column("topic").filter).toBe("text");
    expect(column("project").filter).toBe("text");
    expect(column("status").filter).toBe("select");
    expect(column("autonomy").filter).toBe("select");
    expect(column("template").filter).toBe("text");
    expect(column("agent-overrides").filter).toBe("number");
    expect(column("created").filter).toBe("date");
  });

  it("keeps the agent-overrides destination as the row action", () => {
    const markup = renderToStaticMarkup(
      <>{column("agent-overrides").cell?.(row, 0)}</>,
    );

    expect(markup).toContain('href="/research/topics/topic-1/agents"');
    expect(markup).toContain("1 overrides");
  });

  it("counts only configured agent-role slots and preserves absent dates", () => {
    expect(researchProjectOverrideCount(null)).toBe(0);
    expect(researchProjectOverrideCount(row.agent_config)).toBe(1);
    expect(researchProjectCreatedAt(null)).toBe("Unknown");
  });

  it("does not publish a partial refresh when project-link loading fails", async () => {
    const fetchProjectLinks = jest.fn().mockRejectedValue(new Error("offline"));

    await expect(
      loadResearchProjectSnapshot({
        fetchTopics: async () => [row],
        fetchTemplates: async () => [],
        fetchProjectLinks,
      }),
    ).rejects.toThrow("offline");

    expect(fetchProjectLinks).toHaveBeenCalledWith(["topic-1"]);
  });
});
