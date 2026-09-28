import { buildToolComponentGenerationOffer } from "./toolComponentGenerationOffer";

const tool = {
  name: "web_search",
  description: "Search the web.",
  parameters: { type: "object", properties: { query: { type: "string" } } },
};

describe("buildToolComponentGenerationOffer", () => {
  it("one sample: native list + boolean, fenced JSON for markdown kinds", () => {
    const offer = buildToolComponentGenerationOffer(tool, [
      { arguments: { query: "tide tables" }, admin_comments: "Cards too tall", is_success: true },
    ]);
    expect(offer).toEqual({
      tool_name: "web_search",
      tool_description: "Search the web.",
      tool_parameters: `\`\`\`json\n${JSON.stringify(tool.parameters, null, 2)}\n\`\`\``,
      sample_arguments: `\`\`\`json\n${JSON.stringify({ query: "tide tables" }, null, 2)}\n\`\`\``,
      sample_admin_comments: ["Cards too tall"],
      sample_succeeded: true,
    });
  });

  it("omits sample_succeeded when samples disagree or are unknown", () => {
    const a = buildToolComponentGenerationOffer(tool, [
      { arguments: {}, admin_comments: null, is_success: true },
      { arguments: {}, admin_comments: null, is_success: false },
    ]);
    expect(a).not.toHaveProperty("sample_succeeded");
    expect(a).not.toHaveProperty("sample_admin_comments");
    const b = buildToolComponentGenerationOffer(tool, [{ is_success: null }]);
    expect(b).not.toHaveProperty("sample_succeeded");
  });
});
