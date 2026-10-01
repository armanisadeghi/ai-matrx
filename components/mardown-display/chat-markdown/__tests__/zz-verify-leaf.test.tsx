import React, { act } from "react";
import { createRoot } from "react-dom/client";
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
(globalThis as any).ResizeObserver = class { observe(){} unobserve(){} disconnect(){} };
jest.mock("@/components/markdown-core/MarkdownCore", () => {
  const actual = jest.requireActual("@/components/markdown-core/MarkdownCoreImpl");
  return { __esModule: true, default: actual.default };
});
jest.mock("@/components/matrx/buttons/MarkdownCopyButton", () => ({ InlineCopyButton: () => null }));
jest.mock("@/components/MarkdownStream", () => ({
  __esModule: true,
  default: function M({ content }: { content: string }) { return <div data-pipeline="1">ROUTED</div>; },
}));
import BasicMarkdownContent from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
const K = JSON.stringify({ __kind: "flashcard_set", title: "T", cards: [{ __kind: "flashcard", front: "a", back: "b" }] });
const KP = JSON.stringify(JSON.parse(K), null, 2);
const cases: Record<string,string> = {
  blockquoteFence: `> \`\`\`json\n${KP.split("\n").map(l=>"> "+l).join("\n")}\n> \`\`\`\n\nAfter.`,
  listIndentedFence: `- item\n\n  \`\`\`json\n${KP.split("\n").map(l=>"  "+l).join("\n")}\n  \`\`\`\n`,
  inlineProse: `The answer is ${K} as shown.`,
  inlineCode: `The answer is \`${K}\` as shown.`,
  tableCell: `| a | b |\n|---|---|\n| x | ${K} |\n`,
  tsFence: `Here:\n\n\`\`\`ts\n${KP}\n\`\`\`\n`,
  indented: `Para:\n\n    ${K}\n\nAfter.`,
  htmlComment: `Text <!-- ${K} --> more.`,
  unicodeKeyFence: `\`\`\`json\n{"\\u005f_kind":"flashcard_set","title":"T"}\n\`\`\`\n`,
  stringified: `\`\`\`json\n${JSON.stringify({ result: K })}\n\`\`\`\n`,
};
it("leaf", () => {
  const out: string[] = [];
  for (const [n, c] of Object.entries(cases)) {
    const el = document.createElement("div"); document.body.appendChild(el);
    const root = createRoot(el);
    act(() => root.render(<BasicMarkdownContent content={c} showCopyButton={false} />));
    const t = el.textContent ?? "";
    out.push(`${n}: routed=${!!el.querySelector("[data-pipeline]")} rawKindInDom=${/"(__kind|\\u005f_kind)"|\\"__kind\\"/.test(t)} :: ${t.slice(0,90).replace(/\n/g," ")}`);
    act(() => root.unmount()); el.remove();
  }
  console.log(out.join("\n"));
});
