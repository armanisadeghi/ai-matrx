import "../render-paths/__tests__/dom-frame-judge";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { RichContent } from "@/components/rich-content/RichContent";
import { TooltipProvider } from "@/components/ui/tooltip";
import { domLeaksKind, visibleKindText } from "../surfaces/kind-leak-scan";

const K = '{"__kind":"flashcard_set","title":"Cells","cards":[{"__kind":"flashcard","front":"A","back":"B"}]}';
const KP = JSON.stringify(JSON.parse(K), null, 2);
const CASES: Array<[string, string]> = [
  ["esc-para", 'Result: {\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"x\\"} done'],
  ["esc-para-alone", '{\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"x\\"}'],
  ["esc-list", '- {\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"x\\"}'],
  ["esc-heading", '## {\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"x\\"}'],
  ["esc-quote", '> {\\"__kind\\":\\"flashcard_set\\",\\"title\\":\\"x\\"}'],
  ["zw-para", 'Result: {"__\u200bkind":"flashcard_set","title":"x"} done'],
  ["zw-para-alone", '{"__\u200bkind":"flashcard_set","title":"x"}'],
  ["zw-table", '| a |\n|---|\n| {"__\u200bkind":"flashcard_set","title":"x"} |'],
  ["zw-heading", '## {"__\u200bkind":"flashcard_set","title":"x"}'],
  ["zw-quote", '> {"__\u200bkind":"flashcard_set","title":"x"}'],
  ["mdesc-para", 'Here {"\\_\\_kind": "flashcard_set", "title": "x"} done'],
  ["mdesc-list", '- {"\\_\\_kind": "flashcard_set", "title": "x"}'],
  ["mdesc-table", '| a |\n|---|\n| {"\\_\\_kind": "flashcard_set", "title": "x"} |'],
  ["smart-list", '- {\u201c__kind\u201d: \u201cflashcard_set\u201d}'],
  ["entity-list", '- {&quot;__kind&quot;: &quot;flashcard_set&quot;}'],
  ["entity-alone", '{&quot;__kind&quot;: &quot;flashcard_set&quot;, &quot;title&quot;: &quot;x&quot;}'],
  ["python-para", "Result: {'__kind': 'flashcard_set', 'title': 'x'} done"],
  ["python-quote", "> {'__kind': 'flashcard_set', 'title': 'x'}"],
  ["kind-in-inline-html-b", '<b>{"__kind":"flashcard_set","title":"x"}</b>'],
  ["strong-wrapped", '**{"__kind":"flashcard_set","title":"x"}**'],
  ["em-wrapped", '_{"__kind":"flashcard_set","title":"x"}_'],
  ["task-list", '- [ ] {"__kind":"flashcard_set","title":"x"}'],
  ["def-in-table-inline-code", '| a |\n|---|\n| `{"__kind":"flashcard_set"}` |'],
];

async function draw(source: string): Promise<{ raw: boolean; text: string }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  try {
    await act(async () => {
      root.render(<TooltipProvider><RichContent level="full" imagePolicy="ai" source={source} isStreaming={false} hideCopyButton /></TooltipProvider>);
    });
    for (let i = 0; i < 10; i += 1) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
    return { raw: domLeaksKind(container), text: visibleKindText(container, 300) + " ||HTML: " + container.innerHTML.slice(0, 700) };
  } finally {
    act(() => root.unmount());
    container.remove();
  }
}

it("adversarial sweep", async () => {
  const out: string[] = [];
  for (const [label, src] of CASES) {
    const v = await draw(src);
    out.push(`${v.raw ? "RAW " : "ok  "} ${label} :: ${v.text.replace(/\s+/g, " ").slice(0, 900)}`);
  }
  require("fs").writeFileSync(process.env.ZZ_OUT ?? "/tmp/zz.txt", out.join("\n"));
}, 600_000);
