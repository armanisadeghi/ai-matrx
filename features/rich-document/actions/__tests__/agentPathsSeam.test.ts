/**
 * verify-RC-B5 round 3 — the three "run an agent over this text" paths share
 * ONE seam (Clean up's):
 *   F3 Help with this… — the agent answered with the revised document and the
 *      review read only the untouched working document ("identical");
 *   F4 Custom agent — the text never reached the agent's `Text` variable, so it
 *      translated its stock sample;
 *   F7 refusals were shown as offsets and function names.
 */
import { SourceSpliceError } from "@ai-matrx/content-ir/source";
import { agentRunResult } from "@/components/official/proTextareaAgentActions";
import { textInputVariable } from "@/features/agents/utils/text-input-variable";
import { explainSpliceRefusal } from "../../review/proposedEdit";

const DOC = "Steady power is critical for the new terminals.";

test("F3: an agent that ANSWERS with the revised text is read back, not reported 'identical'", () => {
  const answer = "Steady power is essential for the new terminals.";
  expect(agentRunResult(DOC, DOC, answer)).toBe(answer);
});

test("F3: an agent that edited the working document hands back the document", () => {
  const edited = "Steady power is essential for every new terminal.";
  expect(agentRunResult(DOC, edited, "Done — I updated the document.")).toBe(edited);
});

test("F4: the text lands in the agent's declared text variable (the Clean up rule)", () => {
  const defs = [{ name: "Target Language" }, { name: "Text" }];
  expect(textInputVariable(defs)?.name).toBe("Text");
  expect(textInputVariable([{ name: "document" }, { name: "tone" }])?.name).toBe("document");
  expect(textInputVariable([{ name: "tone" }, { name: "audience" }])).toBeNull();
});

test("F7: a splice refusal reads as a sentence, never offsets or function names", () => {
  const message = explainSpliceRefusal(
    new SourceSpliceError(
      "island_edit",
      "edit [0, 776) changes or removes the protected xml_container (analysis) island at [141, 233); islands change only through islandEdit()",
    ),
  );
  expect(message).not.toMatch(/\[\d|islandEdit|xml_container/);
  expect(message).toMatch(/protected content/);
});

test("r4: the result handed on is the COMMITTED final answer — a code fence keeps its opening line", async () => {
  const { selectLatestAnswerText } = await import(
    "@/features/agents/redux/execution-system/messages/messages.selectors"
  );
  const answer = "Restart it:\n\n```bash\nsudo systemctl restart pos-paymentd\n```";
  const state = {
    messages: {
      byConversationId: {
        run: {
          orderedIds: ["u", "a1", "t", "a2"],
          byId: {
            u: { id: "u", role: "user", content: [{ type: "text", text: "Fix it" }] },
            a1: { id: "a1", role: "assistant", content: [{ type: "tool_call", id: "c1" }] },
            t: { id: "t", role: "tool", content: [] },
            a2: {
              id: "a2",
              role: "assistant",
              content: [
                { type: "thinking", text: "The user wants the fenced command kept." },
                { type: "text", text: answer },
              ],
            },
          },
        },
      },
    },
  } as never;
  expect(selectLatestAnswerText("run")(state)).toBe(answer);
});
