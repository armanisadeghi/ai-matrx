import { splitContentIntoBlocksV2 } from "../content-splitter-v2";
const item = { __kind: "agent_definition", name: "Complaint Reply Drafter", description: "Reads a customer's email.", messages: [{ role: "system", content: [{ text: "You are a writer.\n\n# Inputs\n1. **The email.** \"quoted\" [timeframe]", type: "text" }] }], variable_definitions: [{ name: "complaint_email", helpText: "Paste", required: true, defaultValue: "", customComponent: null }], model_id: "b32f2079-4fa5-4613-a01d-726f1243ebe5", settings: { stream: true, temperature: null }, custom_tools: [], context_policies: [], category: "Customer Support", tags: ["a"] };
const full = JSON.stringify({ __kind: "directive_v1_action_create_agent_definition", items: [item] });
describe("probe", () => {
  it("dumps", () => {
    for (const n of [40, 120, 300, full.length]) {
      const blocks = splitContentIntoBlocksV2(full.slice(0, n));
      console.log(n, JSON.stringify(blocks.map((b) => ({ t: b.type, l: b.language, len: b.content.length, md: b.metadata ? Object.keys(b.metadata) : null }))));
    }
  });
});
