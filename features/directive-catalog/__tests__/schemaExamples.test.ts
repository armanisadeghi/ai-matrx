import { buildSchemaExample } from "../schemaExamples";

const SCHEMA = {
  type: "object",
  required: ["name"],
  properties: {
    name: { title: "Name" },
    agent_type: { default: "user", title: "Agent Type" },
    messages: { default: [], title: "Messages" },
    variables: {
      type: "array",
      default: [],
      items: { $ref: "#/$defs/Variable" },
    },
    enabled: { type: "boolean", title: "Enabled" },
  },
  $defs: {
    Variable: {
      type: "object",
      required: ["name"],
      properties: {
        name: { type: "string" },
        description: { type: "string", default: "" },
      },
    },
  },
};

describe("buildSchemaExample", () => {
  it("builds the minimum required payload", () => {
    expect(buildSchemaExample(SCHEMA, "minimum")).toEqual({
      name: "<name>",
    });
  });

  it("builds the defaults-only payload", () => {
    expect(buildSchemaExample(SCHEMA, "defaults")).toEqual({
      agent_type: "user",
      messages: [],
      variables: [],
    });
  });

  it("builds a full copy-ready payload", () => {
    expect(buildSchemaExample(SCHEMA, "full")).toEqual({
      name: "<name>",
      agent_type: "user",
      messages: [],
      variables: [{ name: "<name>", description: "" }],
      enabled: false,
    });
  });
});
