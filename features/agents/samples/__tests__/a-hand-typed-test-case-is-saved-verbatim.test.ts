const insert = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    schema: () => ({
      from: () => ({
        insert: (row: unknown) => {
          insert(row);
          return {
            select: () => ({
              single: async () => ({ data: { id: "new", ...(row as object) }, error: null }),
            }),
          };
        },
      }),
    }),
  }),
}));
jest.mock("@/lib/organizations/ensureOrgId", () => ({
  ensureOrgId: async () => "org-1",
}));

import { createAgentSample } from "@/features/agents/samples/service";

const head = {
  agentId: "a1",
  version: 4,
  inputContractHash: "in",
  outputContractHash: "out",
  variableDeclarations: [],
};

describe("createAgentSample", () => {
  beforeEach(() => insert.mockClear());

  it("keeps typed values verbatim, drops empty variables, stamps the head contract", async () => {
    await createAgentSample({
      agentId: "a1",
      label: "  Improve - caption notes ",
      variables: { selected_text: "  line one\nline two ", tone: "" },
      userInput: "Turn this into a Slack message.",
      referenceOutput: "Hey Darlene",
      head,
    });
    const row = insert.mock.calls[0][0];
    expect(row.label).toBe("Improve - caption notes");
    expect(row.variables).toEqual({ selected_text: "  line one\nline two " });
    expect(row.user_input).toBe("Turn this into a Slack message.");
    expect(row.metadata.input_content).toEqual([
      { type: "text", text: "Turn this into a Slack message." },
    ]);
    expect(row).toMatchObject({
      agent_version: 4,
      input_contract_hash: "in",
      status: "candidate",
      source: "authored",
      organization_id: "org-1",
    });
  });

  it("refuses a nameless case and writes nothing", async () => {
    await expect(
      createAgentSample({
        agentId: "a1", label: "  ", variables: {}, userInput: "", referenceOutput: "", head,
      }),
    ).rejects.toThrow("Give the test case a name.");
    expect(insert).not.toHaveBeenCalled();
  });
});
