// eslint-disable-next-line import/order
import "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { TooltipProvider } from "@/components/ui/tooltip";
import { normalizeKindSpellings } from "@/features/content-ir/surfaces/json-kind-signal";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { spelledKindsAsOneLine } from "@/features/content-ir/surfaces/kind-one-line";
jest.setTimeout(900_000);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
async function drawText(answer: string): Promise<string> {
  const parts: string[] = [];
  for (const [i, b] of splitContentIntoBlocksV2(answer).entries()) {
    const c = document.createElement("div"); document.body.appendChild(c);
    const root = createRoot(c);
    await act(async () => root.render(React.createElement(TooltipProvider, null, React.createElement(BlockRenderer, { block: b as never, index: i, isStreamActive: false, replaceBlockContent: () => undefined, handleOpenEditor: () => undefined }))));
    for (let k = 0; k < 8; k++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    c.querySelectorAll("style,script").forEach((e) => e.remove());
    parts.push(c.textContent ?? "");
    act(() => root.unmount()); c.remove();
  }
  return parts.join(" | ").replace(/\s+/g, " ");
}
const FP: Array<[string, string]> = [
  ["prose literal key mention", 'To declare one, add a "__kind": "flashcard_set" key to the object. Thanks.'],
  ["code span literal", 'Use `{"__kind": "flashcard_set"}` to declare it. Thanks.'],
  ["code span escaped", 'The escaped form is `{\\"__kind\\":\\"note\\"}` in logs. Thanks.'],
  ["prose escaped mention unclosed", 'Example: {\\"__kind\\":\\"note\\", and then the rest of my long answer which must stay visible. Thanks.'],
  ["prose bare word", "The __kind field names the shape. Thanks."],
  ["escaped x2 + trailing", 'See {\\\\\\"__kind\\\\\\":\\\\\\"note\\\\\\",\\\\\\"title\\\\\\":\\\\\\"Hi\\\\\\"} and then more text here. Thanks.'],
  ["unclosed literal in prose (settled)", 'Example {"__kind":"note","title":"Hi" and then the rest of my answer. Thanks.'],
  ["python repr talk", "In Python, `d = {'__kind': 'note'}` prints as {'__kind': 'note'} and that is fine. Thanks."],
];
describe("fp", () => {
  it.each(FP)("%s", async (name, src) => {
    console.log("FP " + JSON.stringify({ name, out: await drawText(src) }));
  });
  it("normalizer preserves non-key text", () => {
    const src = 'Family 👨‍👩‍👧 and soft­hyphen and `co​de` then {"__​kind":"note","title":"Hi"} end';
    const out = normalizeKindSpellings(src);
    console.log("NORM " + JSON.stringify({ zwjKept: out.includes("👨‍👩‍👧"), shyKept: out.includes("soft­hyphen"), codeKept: out.includes("co​de"), out }));
    const md = kindTextToMarkdown(src);
    console.log("MD " + JSON.stringify({ zwjKept: md.includes("👨‍👩‍👧"), md: md.slice(0, 200) }));
    const s2 = 'Prose 👨‍👩‍👧 and {\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"} end';
    console.log("ONE " + JSON.stringify(spelledKindsAsOneLine(s2)));
  });
});
