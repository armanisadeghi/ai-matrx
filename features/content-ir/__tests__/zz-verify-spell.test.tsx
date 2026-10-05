// eslint-disable-next-line import/order
import "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import type { RenderBlockPayload } from "@ai-matrx/agents/generated/stream-events";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { RichContent } from "@/components/rich-content/RichContent";
import { TooltipProvider } from "@/components/ui/tooltip";
import { normalizeKindSpellings, hasKindKeyAnySpelling } from "@/features/content-ir/surfaces/json-kind-signal";
import { domLeaksKind } from "@/features/content-ir/surfaces/kind-leak-scan";

jest.setTimeout(900_000);
(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const KIND = { __kind: "flashcard_set", title: "Cell biology", cards: [{ front: "What makes ATP?", back: "Mitochondria" }] };
const J = JSON.stringify(KIND);
const REPR = "{'__kind': 'flashcard_set', 'title': 'Cell biology', 'cards': [{'front': 'What makes ATP?', 'back': 'Mitochondria'}]}";
const esc = (s: string) => s.replaceAll("\\", "\\\\").replaceAll('"', '\\"');

export const CASES: Array<[string, string]> = [
  ["escaped+zw", esc(J).replace("__kind", "__​kind")],
  ["entity+repr(&#39;)", REPR.replaceAll("'", "&#39;")],
  ["entity+repr(&apos;)", REPR.replaceAll("'", "&apos;")],
  ["escaped x2", esc(esc(J))],
  ["escaped x3", esc(esc(esc(J)))],
  ["mixed quotes key", J.replace('"__kind"', "“__kind\"")],
  ["mixed: repr key, json values", J.replace('"__kind"', "'__kind'")],
  ["md-escaped inside escaped", esc(J.replaceAll("_", "\\_"))],
  ["entity + md-escaped", J.replaceAll("_", "\\_").replaceAll('"', "&quot;")],
  ["&QUOT; uppercase", J.replaceAll('"', "&QUOT;")],
  ["&#x00022; padded hex", J.replaceAll('"', "&#x00022;")],
  ["&amp;quot; double entity", J.replaceAll('"', "&amp;quot;")],
  ["LRM in key", J.replace("__kind", "__‎kind")],
  ["word-joiner+invisible-op", J.replace("__kind", "_⁢_kind")],
  ["CGJ in key", J.replace("__kind", "__͏kind")],
  ["fullwidth quotes", J.replaceAll('"', "＂")],
  ["JS inspect (unquoted key)", "{ __kind: 'flashcard_set', title: 'Cell biology', cards: [ { front: 'What makes ATP?', back: 'Mitochondria' } ] }"],
  ["JS literal (unquoted key, dq vals)", '{__kind: "flashcard_set", title: "Cell biology", cards: [{front: "What makes ATP?", back: "Mitochondria"}]}'],
  ["repr + zero width", REPR.replace("__kind", "__​kind")],
  ["smart + zw", J.replace(/"([^"]*)"/g, "“$1”").replace("__kind", "__‍kind")],
  ["escaped single-backslash-only open", J.replace('"__kind"', '\\"__kind\\"')],
  ["html-entity &#95; underscores", J.replace("__kind", "&#95;&#95;kind")],
  ["md \\_ only first underscore", J.replace("__kind", "\\__kind")],
  ["double-encoded whole", JSON.stringify(J)],
  ["escaped key spaced", esc(J).replace('\\"__kind\\":', '\\"__kind\\" :')],
];

const INVIS = /[­͏؜ᅟᅠ឴឵᠎​-‏‪-‮⁠-⁤⁦-⁯﻿]/g;
export function oracle(text: string): boolean {
  const ta = document.createElement("textarea");
  ta.innerHTML = text.replace(INVIS, "");
  const t = ta.value.replace(INVIS, "");
  return /(?:_|\\_|＿|&#95;){2}\s*kind\b|\\u005f_kind/i.test(t);
}

function visible(container: HTMLElement): string {
  const clone = container.cloneNode(true) as HTMLElement;
  clone.querySelectorAll("style,script").forEach((e) => e.remove());
  clone.querySelectorAll("[data-kind-source]").forEach((e) => e.remove());
  const attrs = Array.from(clone.querySelectorAll("[title],[aria-label],[alt]"))
    .map((e) => ["title", "aria-label", "alt"].map((a) => e.getAttribute(a) ?? "").join(" "))
    .join(" ");
  return (clone.textContent ?? "") + " " + attrs;
}

async function draw(el: React.ReactElement): Promise<{ text: string; judged: boolean }> {
  const c = document.createElement("div");
  document.body.appendChild(c);
  const root = createRoot(c);
  await act(async () => root.render(React.createElement(TooltipProvider, null, el)));
  for (let i = 0; i < 8; i++) await act(async () => { await new Promise((r) => setTimeout(r, 0)); });
  const text = visible(c);
  const judged = domLeaksKind(c);
  act(() => root.unmount());
  c.remove();
  return { text, judged };
}

function frames(text: string, id: string, chunk = 1) {
  const out: Array<{ block: RenderBlockPayload; active: boolean }> = [];
  let fin = false;
  const acc = new StreamBlockAccumulator(id, (p) => {
    out.push({ block: (p as any).block, active: !fin });
    return { type: "t", payload: p };
  });
  const d = (a: unknown) => a;
  for (let i = 0; i < text.length; i += chunk) acc.ingest(text.slice(i, i + chunk), d);
  fin = true;
  acc.finalize(d);
  return out;
}

const blockEl = (block: any, active: boolean) =>
  React.createElement(BlockRenderer, {
    block: { ...block, type: block.type, content: block.content, metadata: block.data ?? block.metadata } as never,
    index: block.blockIndex ?? 0,
    isStreamActive: active,
    replaceBlockContent: () => undefined,
    handleOpenEditor: () => undefined,
  });

describe("zz attack: combos settled (reload + RichContent)", () => {
  it.each(CASES)("%s", async (name, spelled) => {
    const answer = `Here are your cards: ${spelled} Enjoy.`;
    const report: string[] = [];
    const parts: string[] = [];
    for (const [i, b] of splitContentIntoBlocksV2(answer).entries()) {
      const r = await draw(React.createElement(BlockRenderer, { block: b as never, index: i, isStreamActive: false, replaceBlockContent: () => undefined, handleOpenEditor: () => undefined }));
      parts.push(r.text);
      if (r.judged) report.push("judge-flagged");
    }
    const reload = parts.join("|");
    const rc = await draw(React.createElement(RichContent, { level: "full", imagePolicy: "ai", source: answer } as any));
    const res = { name, detectorSees: hasKindKeyAnySpelling(answer), reloadOracle: oracle(reload), rcOracle: oracle(rc.text), rcJudge: rc.judged, judge: report.length > 0, reload: snip(reload), rc: snip(rc.text) };
    // eslint-disable-next-line no-console
    console.log("RESULT " + JSON.stringify(res));
  });
});
function snip(t: string) { const s = t.replace(/\s+/g, " "); const i = s.search(/kind/i); return i < 0 ? s.slice(0, 120) : s.slice(Math.max(0, i - 50), i + 60); }
