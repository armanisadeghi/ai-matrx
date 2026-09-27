/**
 * The topic list's agent write targets refuse a bad list BEFORE the person's
 * approval card, with a sentence the agent can act on, and read a good one
 * exactly. Real use case: an agent asked to "set up research on EV battery
 * recycling and fix the question on my supply-chain topic".
 */
import {
  parseCreateTopics,
  parseDeleteTopics,
  parseUpdateTopics,
} from "../topicAgentWrites";
import type { ResearchTopicListRow } from "../types";

const row = (id: string, name: string): ResearchTopicListRow => ({
  id,
  name,
  description: "Which suppliers can deliver lithium carbonate under 90 days?",
  status: "draft",
  autonomy_level: "semi",
  organization_id: "org-1",
  organization_name: "Acme Energy",
  created_by: "user-1",
  created_at: "2026-09-01T00:00:00Z",
  updated_at: "2026-09-02T00:00:00Z",
  template_id: "",
  project_id: "",
  project_name: "",
  archived_at: "",
  total_count: 2,
});

const ROWS = [row("t-1", "Battery supply chain"), row("t-2", "Grid storage")];

describe("create_topics", () => {
  it("reads names, questions and autonomy, defaulting autonomy to semi", () => {
    expect(
      parseCreateTopics([
        {
          name: " EV battery recycling ",
          description: "Which recycling methods are commercially viable in the US?",
        },
        { name: "Solid-state batteries", autonomy_level: "manual" },
      ]),
    ).toEqual([
      {
        name: "EV battery recycling",
        description: "Which recycling methods are commercially viable in the US?",
        autonomy_level: "semi",
      },
      { name: "Solid-state batteries", description: null, autonomy_level: "manual" },
    ]);
  });

  it("refuses the whole list on a missing name, a bad autonomy or a repeat", () => {
    expect(() => parseCreateTopics([{ description: "no name" }])).toThrow(/non-empty name/);
    expect(() => parseCreateTopics([{ name: "A", autonomy_level: "fast" }])).toThrow(
      /"auto", "semi" or "manual"/,
    );
    expect(() => parseCreateTopics([{ name: "A" }, { name: "a" }])).toThrow();
    expect(() => parseCreateTopics("EV batteries")).toThrow(/ARRAY/);
  });
});

describe("update_topics", () => {
  it("changes only the fields sent and names them", () => {
    expect(
      parseUpdateTopics(
        [{ id: "t-1", description: "Who can deliver in under 60 days?" }],
        ROWS,
      ),
    ).toEqual([
      {
        id: "t-1",
        previousName: "Battery supply chain",
        description: "Who can deliver in under 60 days?",
        changed: ["description"],
      },
    ]);
  });

  it("refuses unknown ids, empty names and no-op items", () => {
    expect(() => parseUpdateTopics([{ id: "nope", name: "X" }], ROWS)).toThrow(/no topic with id/);
    expect(() => parseUpdateTopics([{ id: "t-1", name: "  " }], ROWS)).toThrow(/may not be empty/);
    expect(() => parseUpdateTopics([{ id: "t-1" }], ROWS)).toThrow(/changes nothing/);
  });
});

describe("update_topics archive / restore", () => {
  it("archives an active topic and restores an archived one", () => {
    const archived = { ...row("t-3", "Old grid study"), archived_at: "2026-09-20T00:00:00Z" };
    expect(parseUpdateTopics([{ id: "t-1", archived: true }], ROWS)[0]).toMatchObject({ archived: true, changed: ["archived"] });
    expect(parseUpdateTopics([{ id: "t-3", archived: false }], [...ROWS, archived])[0]).toMatchObject({ archived: false, changed: ["restored"] });
  });

  it("refuses an archive flag that changes nothing", () => {
    expect(() => parseUpdateTopics([{ id: "t-1", archived: false }], ROWS)).toThrow(/changes nothing/);
    expect(() => parseUpdateTopics([{ id: "t-1", archived: "yes" }], ROWS)).toThrow(/true or false/);
  });
});

describe("delete_topics", () => {
  it("accepts bare ids and { id } objects", () => {
    expect(parseDeleteTopics(["t-1", { id: "t-2" }], ROWS).map((r) => r.id)).toEqual([
      "t-1",
      "t-2",
    ]);
  });

  it("refuses repeats and unknown ids", () => {
    expect(() => parseDeleteTopics(["t-1", "t-1"], ROWS)).toThrow();
    expect(() => parseDeleteTopics(["t-9"], ROWS)).toThrow(/no topic with id/);
  });
});

describe("list_view", () => {
  it("reads scope, archive view and search", () => {
    const { parseListView } = jest.requireActual("../topicAgentWrites") as typeof import("../topicAgentWrites");
    expect(parseListView({ archived: "all", scope: "mine", search: "heat pump" })).toEqual({
      archived: "all",
      scope: "mine",
      search: "heat pump",
    });
    expect(() => parseListView({ archived: "deleted" })).toThrow(/"active", "archived" or "all"/);
    expect(() => parseListView({})).toThrow(/changes nothing/);
    expect(() => parseListView(["all"])).toThrow(/OBJECT/);
  });
});
