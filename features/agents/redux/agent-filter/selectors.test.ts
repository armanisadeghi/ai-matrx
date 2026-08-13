import type { CodeAgentFilter } from "@/lib/redux/preferences/userPreferencesSlice";
import { conversationHistoryAgentIds } from "./selectors";

describe("conversationHistoryAgentIds", () => {
  const catalogueIds = Array.from(
    { length: 777 },
    (_, index) => `00000000-0000-4000-8000-${String(index).padStart(12, "0")}`,
  );

  it("uses the empty-array sentinel instead of serializing the whole catalogue", () => {
    const filter: CodeAgentFilter = {
      mode: "all",
      tags: [],
      categories: [],
      agentIds: [],
    };

    expect(conversationHistoryAgentIds(filter, catalogueIds)).toEqual([]);
  });

  it("preserves concrete IDs for a narrowed filter", () => {
    const filter: CodeAgentFilter = {
      mode: "explicit",
      tags: [],
      categories: [],
      agentIds: catalogueIds.slice(0, 2),
    };

    expect(
      conversationHistoryAgentIds(filter, catalogueIds.slice(0, 2)),
    ).toEqual(catalogueIds.slice(0, 2));
  });
});
