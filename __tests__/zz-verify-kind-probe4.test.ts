import { getHeaderSubtitle } from "@ai-matrx/chat/tool-call-visualization/registry/registry";
import { deriveRuleNameFromContent } from "@/features/masterwork/oracle/service";
const K = JSON.stringify({ __kind: "flashcard_set", title: "Cells", cards: [{ __kind: "flashcard", front: "A", back: "B" }] });
it("collab subtitle", () => {
  for (const result of [{ result: K, agent_name: "Tutor", history: { mode: "snapshot" } }, { stored: { preview: K.slice(0, 60) }, agent_name: "Tutor", history: { mode: "snapshot" } }]) {
    const entry = { toolName: "agent_call", status: "completed", arguments: { history_mode: "snapshot" }, result, events: [] } as never;
    console.log("SUBTITLE:", getHeaderSubtitle("agent_call", entry));
  }
  console.log("RULENAME:", deriveRuleNameFromContent(K));
});
