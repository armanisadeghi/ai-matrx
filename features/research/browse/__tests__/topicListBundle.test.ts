/**
 * THE CONDENSED LIST CARRIES EVERY ROW ON SCREEN (page-pass iteration,
 * 2026-09-27). It was capped at 25 while the page showed 27, and its rows had
 * no organization name although the Organization column was on screen. Real
 * use case: an analyst's 27 research topics across four organizations, each
 * with a two-sentence research question.
 */
import { buildTopicListXml, TOPIC_LIST_BUDGET } from "../topicListBundle";
import type { ResearchTopicListRow } from "../types";

const QUESTION =
  "Which US states offer residential heat pump rebates in 2026, how much does each pay, and which ones stack with the federal 25C credit for a typical 3-ton install?";

function topics(n: number): ResearchTopicListRow[] {
  return Array.from({ length: n }, (_, i) => ({
    id: `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`,
    name: `Heat pump rebates — region ${i + 1}`,
    description: QUESTION,
    status: i % 3 ? "complete" : "draft",
    autonomy_level: "semi",
    organization_id: "org-1",
    organization_name: ["Titanium", "AI Matrx", "Castellano & Reyes, LLP", "admin's Workspace"][i % 4],
    created_by: "user-1",
    created_at: "2026-09-01T00:00:00Z",
    updated_at: "2026-09-20T00:00:00Z",
    template_id: "",
    project_id: "",
    project_name: i % 2 ? "Titanium Marketing Branding" : "",
    archived_at: "",
    total_count: 31,
  }));
}

const count = (xml: string) => (xml.match(/<topic /g) ?? []).length;

describe("topic_list", () => {
  it("carries all 27 rows on screen, the true total and each row's organization, within budget", () => {
    const xml = buildTopicListXml({ rows: topics(27), total: 31, scope: "orgs", search: "", archived: "active" });
    expect(count(xml)).toBe(27);
    expect(xml).toMatch(/^<topics scope="orgs" total="31" on_page="27">/);
    expect(xml).not.toMatch(/ shown=/);
    expect(xml).toContain('org="Castellano &amp; Reyes, LLP"');
    expect(xml.length).toBeLessThanOrEqual(TOPIC_LIST_BUDGET);
  });

  it("gives a short page the whole research question", () => {
    const xml = buildTopicListXml({ rows: topics(3), total: 3, scope: "mine", search: "", archived: "active" });
    expect(xml).toContain(QUESTION.replace(/&/g, "&amp;"));
    expect(xml).not.toContain('clipped="true"');
  });

  it("says how many rows it kept when even names alone overflow", () => {
    const xml = buildTopicListXml({ rows: topics(100), total: 100, scope: "orgs", search: "", archived: "active" });
    const shown = Number(xml.match(/ shown="(\d+)"/)?.[1]);
    expect(shown).toBe(count(xml));
    expect(shown).toBeLessThan(100);
    expect(xml.length).toBeLessThanOrEqual(TOPIC_LIST_BUDGET);
  });

  it("names the archive view it is showing", () => {
    const xml = buildTopicListXml({ rows: [], total: 0, scope: "mine", search: "", archived: "archived" });
    expect(xml).toBe('<topics scope="mine" archived="archived" total="0" on_page="0"/>');
  });
});
