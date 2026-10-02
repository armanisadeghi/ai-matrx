import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import {
  ambientAssistantMandateChain,
  ambientPageGuidanceValues,
} from "../ambientAssistantMandates";

// The page guide's launch sends the facts its position holds, by the names the
// `ambient.page_guidance` provision declares — and nothing it does not hold.
describe("ambientPageGuidanceValues", () => {
  it("names the route, its slugs, the surface and the rung that answered", () => {
    const pathname = "/education/flashcards";
    const chain = ambientAssistantMandateChain(pathname);
    expect(
      ambientPageGuidanceValues({
        pathname,
        chain,
        resolvedKey: MANDATE_KEYS.education__flashcards_guidance,
        surfaceName: "matrx-user/education-flashcards",
        sourceFeature: "education",
        organizationId: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      }),
    ).toEqual({
      page_route: "/education/flashcards",
      module_slug: "education",
      section_slug: "flashcards",
      surface_name: "matrx-user/education-flashcards",
      source_feature: "education",
      organization_id: "5dc930e9-bd65-44a1-8369-af773f6e1a5b",
      resolved_mandate_tier: "page",
    });
  });

  it("falls back to the module and system rungs and omits what it does not hold", () => {
    const notes = ambientAssistantMandateChain("/notes");
    expect(
      ambientPageGuidanceValues({
        pathname: "/notes",
        chain: notes,
        resolvedKey: MANDATE_KEYS.notes__page_guidance,
      }),
    ).toEqual({ page_route: "/notes", module_slug: "notes", resolved_mandate_tier: "module" });

    const tasks = ambientAssistantMandateChain("/tasks/today");
    expect(
      ambientPageGuidanceValues({
        pathname: "/tasks/today",
        chain: tasks,
        resolvedKey: MANDATE_KEYS.ambient__page_guidance,
        surfaceName: null,
        organizationId: null,
      }),
    ).toEqual({
      page_route: "/tasks/today",
      module_slug: "tasks",
      section_slug: "today",
      resolved_mandate_tier: "system",
    });
  });
});
