/**
 * The Spaces readers accept and ignore `__kind` (content-ir Rule 2: never strip it, never choke on it).
 * Since 2026-10-07 the three agents answer as registered kinds — `space_build_result`,
 * `space_database_design`, `space_notion_import` — so every answer carries the marker first.
 */
jest.mock("@ai-matrx/chat/agents/hooks/useFloatingAgentRun", () => ({ useFloatingAgentRun: jest.fn() }));
jest.mock("@ai-matrx/chat/surfaces/runtime/surface-mandates", () => ({ useDeclaredSurfaceMandates: jest.fn() }));
jest.mock("../../state/SpacesProvider", () => ({ useSpaces: jest.fn() }));
jest.mock("../spaces-ai", () => ({ BUILD_KEY: "spaces.build", MOVE_IN_KEY: "spaces.move_in", useSpaceBuilderDisclosure: jest.fn() }));

import { readBuildResult } from "../SpaceBuilder";
import { readMovedPage } from "../MoveIn";
import { readDesign } from "../../data/designed-database";

const design = {
  name: "Clients",
  title_property: "client",
  properties: [
    { key: "client", name: "Client", type: "text", options: [] },
    { key: "status", name: "Status", type: "status", options: [{ name: "Active", color: "green" }] },
  ],
  views: [{ name: "All", layout: "table", group_by: null, chart: null }],
  rows: [{ cells: [{ property: "client", value: "Harbor Yoga" }, { property: "status", value: "Active" }] }],
  summary: "A Clients database.",
};

describe("Spaces readers with the kind marker", () => {
  it("the build result reads the same with and without __kind", () => {
    const plain = { summary: "Built it.", root_space_id: "r1", space_ids: ["r1"], table_ids: ["t1"] };
    expect(readBuildResult({ __kind: "space_build_result", ...plain })).toEqual(readBuildResult(plain));
  });
  it("the database design reads the same with and without __kind", () => {
    expect(readDesign({ __kind: "space_database_design", ...design })).toEqual(readDesign(design));
  });
  it("the moved page reads the same with and without __kind", () => {
    const page = { title: "Onboarding", icon: "Handshake", markdown: "## Steps\n\n[[database:1]]", databases: [design], notes: [] };
    expect(readMovedPage({ __kind: "space_notion_import", ...page })).toEqual(readMovedPage(page));
  });
});
