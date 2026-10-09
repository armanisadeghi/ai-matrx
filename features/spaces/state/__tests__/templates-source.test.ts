// SI-13: the template label helpers serve both sources (page = document, board) on ONE category and ONE association role.

const calls: { fn: string; args: Record<string, unknown> }[] = [];
const edges = [
  { source_type: "document", source_id: "page-1", label: "labeled" },
  { source_type: "board", source_id: "board-1", label: "labeled" },
  { source_type: "board", source_id: "board-2", label: "labeled" },
  { source_type: "board", source_id: "board-3", label: "other" },
];

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({ eq: () => ({ eq: () => ({ is: () => ({ single: async () => ({ data: { id: "cat-1" }, error: null }) }) }) }) }),
      }),
    }),
    rpc: async (fn: string, args: Record<string, unknown>) => {
      calls.push({ fn, args });
      return { data: fn === "assoc_for_targets" ? edges : null, error: null };
    },
  },
}));
jest.mock("../../data/agency-install", () => ({ pageOrganizationId: async () => null }));

import { listTemplateIds, setTemplate } from "../templates";

describe("template label helpers, both sources", () => {
  beforeEach(() => {
    calls.length = 0;
  });
  it("lists pages by default and boards on request, never mixing them", async () => {
    expect(await listTemplateIds()).toEqual(["page-1"]);
    expect(await listTemplateIds("board")).toEqual(["board-1", "board-2"]);
  });
  it("links and unlinks with the source type given, on the same category and role", async () => {
    await setTemplate("board-9", true, "board");
    await setTemplate("board-9", false, "board");
    await setTemplate("page-9", true);
    expect(calls.map((c) => [c.fn, c.args.p_source_type, c.args.p_target_id, c.args.p_role])).toEqual([
      ["assoc_link", "board", "cat-1", "labeled"],
      ["assoc_unlink", "board", "cat-1", "labeled"],
      ["assoc_link", "document", "cat-1", "labeled"],
    ]);
  });
});
