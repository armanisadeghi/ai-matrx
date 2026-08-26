import { buildProjectsListContextData } from "@/features/projects/agent-context/buildProjectsContextData";

describe("Projects list surface context", () => {
  it("emits the visible rows, task counts, view, and active filters", () => {
    expect(
      buildProjectsListContextData({
        projects: [
          {
            id: "project-1",
            name: "Surface campaign",
            description: "Certify ordinary product surfaces",
            organizationId: "org-1",
            organizationName: "AI Matrx",
            status: "active",
            priority: "high",
            targetDate: "2026-09-01",
            updatedAt: "2026-08-26T12:00:00.000Z",
            openTaskCount: 4,
            doneTaskCount: 2,
          },
        ],
        searchQuery: "surface",
        view: "table",
        organizationFilterId: "org-1",
        organizationFilterName: "AI Matrx",
        scopeFilterId: "scope-1",
      }),
    ).toMatchObject({
      content: "Surface campaign: Certify ordinary product surfaces",
      active_organization_id: "org-1",
      active_organization_name: "AI Matrx",
      selected_project_ids: [],
      project_count: 1,
      project_search_query: "surface",
      project_list_view: "table",
      project_list_filters: {
        organization_id: "org-1",
        organization_name: "AI Matrx",
        scope_id: "scope-1",
        search_query: "surface",
      },
      project_list: [
        {
          id: "project-1",
          name: "Surface campaign",
          organization_id: "org-1",
          organization_name: "AI Matrx",
          status: "active",
          priority: "high",
          target_date: "2026-09-01",
          open_task_count: 4,
          done_task_count: 2,
        },
      ],
    });
  });

  it("keeps empty hub state explicit without fabricating an active project", () => {
    const context = buildProjectsListContextData({
      projects: [],
      searchQuery: "",
      view: "cards",
    });

    expect(context).toMatchObject({
      selected_project_ids: [],
      project_count: 0,
      project_list: [],
      project_search_query: "",
      project_list_view: "cards",
    });
    expect(context).not.toHaveProperty("active_project_id");
  });
});
