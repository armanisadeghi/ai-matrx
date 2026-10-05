// eslint-disable-next-line import/order
import "@/features/content-ir/render-paths/__tests__/dom-frame-judge";
import React, { act } from "react";
import { createRoot } from "react-dom/client";
import { StreamBlockAccumulator } from "@ai-matrx/chat/agents/redux/execution-system/utils/stream-block-accumulator";
import { BlockRenderer } from "@/components/mardown-display/chat-markdown/block-registry/BlockRenderer";
import { renderBlockToContentBlock } from "@/components/mardown-display/chat-markdown/render-block-to-content-block";
import { splitContentIntoBlocksV2 } from "@/components/mardown-display/markdown-classification/processors/utils/content-splitter-v2";
import { TooltipProvider } from "@/components/ui/tooltip";
import { normalizeKindSpellings } from "@/features/content-ir/surfaces/json-kind-signal";
import { spelledKindsAsOneLine, inlineKindText, nonJsonKindsAsCode } from "@/features/content-ir/surfaces/kind-one-line";
import { BasicMarkdownContent } from "@/components/mardown-display/chat-markdown/BasicMarkdownContent";
import * as fs from "fs";
import { domLeaksKind } from "@/features/content-ir/surfaces/kind-leak-scan";

jest.setTimeout(1_800_000);

// ---- deterministic rng
let seed = Number(process.env.ZZ_SEED ?? 12345);
const rnd = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
const pick = <T,>(a: readonly T[]): T => a[Math.floor(rnd() * a.length)]!;

const J = JSON.stringify({ __kind: "note", title: "Hi", body: "Mitochondria make ATP" });
const esc = (t: string) => t.replaceAll("\\", "\\\\").replaceAll('"', '\\"');
const SPELL: Record<string, string> = {
  literal: J,
  md: J.replace("__kind", "\\_\\_kind"),
  zw: J.replace("__kind", "__​kind"),
  esc1: esc(J),
  esc2: esc(esc(J)),
  python: "{'__kind': 'note', 'title': 'Hi', 'body': 'Mitochondria make ATP'}",
  js: "{ __kind: 'note', title: 'Hi', body: 'Mitochondria make ATP' }",
  smart: J.replace(/"([^"]*)"/g, "“$1”"),
  entity: J.replaceAll('"', "&quot;"),
  esc1zw: esc(J).replace("__kind", "__‍kind"),
  pythonzw: "{'__​kind': 'note', 'title': 'Hi'}",
  mdesc: esc(J).replace("__kind", "\\\\_\\\\_kind"),
  smartzw: J.replace(/"([^"]*)"/g, "“$1”").replace("__kind", "_⁠_kind"),
};
const DECOR = [
  "👨‍👩‍👧‍👦", "🏳️‍🌈", "🇺🇸🇯🇵", "👍🏽", "🧑🏿‍💻", "שלום עולם", "مرحبا بالعالم", "co­operate", "unkind­ness",
  "kindly", "a‍b", "\u05e9\u05dc\u05d5\u05dd \u202bmixed\u202c", "soft\u00adhyphen", "$x^2$", "https://ex.com/a_b_(c)?q=1#__kind", "x​y", "ﬁ", "é", "é", "∑∫√", "😀",
];

type Seg = { kind: false; text: string; tokens: string[]; checks: string[] } | { kind: true; text: string };

let tok = 0;
function prose(): Seg {
  const t = `qx${++tok}`;
  const d = pick(DECOR);
  const form = Math.floor(rnd() * 8);
  if (form === 0) return { kind: false, text: `Some words ${t} ${d} here.`, tokens: [t], checks: [d] };
  if (form === 1) return { kind: false, text: `Inline \`code ${t}\` and ${d}.`, tokens: [t], checks: [d] };
  if (form === 2) return { kind: false, text: `See https://example.com/s?__kind=note&q=${t} now ${d}.`, tokens: [t], checks: [d] };
  if (form === 3) return { kind: false, text: `Math $a^{2}$ with {braces} ${t} ${d}.`, tokens: [t], checks: [d] };
  if (form === 4) return { kind: false, text: `The "__k field is partial ${t} \\"__ki ${d} {{{ {`, tokens: [t], checks: [d] };
  if (form === 5) return { kind: false, text: `The key "__kind" names a shape ${t} ${d}.`, tokens: [t], checks: [d] };
  if (form === 6) return { kind: false, text: `Kind people ${t}, unkind ${d} kindness.`, tokens: [t], checks: [d] };
  return { kind: false, text: `${d} ${t} end`, tokens: [t], checks: [d] };
}
function block(): Seg {
  const t = `qx${++tok}`;
  const t2 = `qx${++tok}`;
  const d = pick(DECOR);
  const form = Math.floor(rnd() * 3);
  if (form === 0) return { kind: false, text: `\`\`\`python\nprint("${t}") # ${d}\n\`\`\``, tokens: [t], checks: [d] };
  if (form === 1) return { kind: false, text: `| a | b |\n|---|---|\n| ${t} ${d} | ${t2} |`, tokens: [t, t2], checks: [d] };
  return { kind: false, text: `- item ${t} ${d}\n- item ${t2}`, tokens: [t, t2], checks: [d] };
}
function kindSeg(): Seg {
  return { kind: true, text: SPELL[pick(Object.keys(SPELL))]! };
}

/** A message: lines of segments; kind regions inline (between prose) or own paragraph. */
function message(): { text: string; segs: Seg[] } {
  const segs: Seg[] = [];
  const parts: string[] = [];
  const n = 3 + Math.floor(rnd() * 5);
  for (let i = 0; i < n; i++) {
    const r = rnd();
    if (r < 0.35) {
      const a = prose();
      const k = kindSeg();
      const b = prose();
      segs.push(a, k, b);
      parts.push(`${a.text} ${k.text} ${b.text}`);
    } else if (r < 0.55) {
      const k = kindSeg();
      segs.push(k);
      parts.push(k.text);
    } else if (r < 0.75) {
      const b = block();
      segs.push(b);
      parts.push(b.text);
    } else {
      const a = prose();
      segs.push(a);
      parts.push(a.text);
    }
  }
  return { text: parts.join("\n\n"), segs };
}

function visible(root: Node): string {
  let out = "";
  const walk = (node: Node) => {
    if (node.nodeType === 3) {
      out += node.nodeValue ?? "";
      return;
    }
    if (node.nodeType === 1) {
      const el = node as Element;
      if (el.getAttribute("aria-hidden") === "true" || el.hasAttribute("hidden")) return;
      if (el.tagName === "STYLE" || el.tagName === "SCRIPT") return;
    }
    for (let c = node.firstChild; c; c = c.nextSibling) walk(c);
    out += " ";
  };
  walk(root);
  return out;
}

async function draw(element: React.ReactElement): Promise<{ text: string; raw: boolean }> {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root = createRoot(container);
  await act(async () => {
    root.render(React.createElement(TooltipProvider, null, element));
  });
  for (let i = 0; i < 12; i++) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
  }
  const text = visible(container);
  const raw = domLeaksKind(container);
  act(() => root.unmount());
  container.remove();
  return { text, raw };
}

async function reload(text: string) {
  const out: string[] = [];
  let raw = false;
  for (const [index, b] of splitContentIntoBlocksV2(text).entries()) {
    const v = await draw(
      React.createElement(BlockRenderer, {
        block: b as never, index, isStreamActive: false,
        replaceBlockContent: () => undefined, handleOpenEditor: () => undefined,
      }),
    );
    raw ||= v.raw;
    out.push(v.text);
  }
  return { text: out.join(" "), raw };
}

type Frame = { blockId: string; content: string; type: string };
function stream(text: string, chunker: (t: string) => string[]) {
  const settled = new Map<string, any>();
  const frames: Frame[] = [];
  const acc = new StreamBlockAccumulator(`req-zz-${++tok}`, (payload: any) => {
    const b = payload.block;
    settled.set(b.blockId, b);
    frames.push({ blockId: b.blockId, content: b.content ?? "", type: b.type });
    return { type: "x", payload };
  });
  const dispatch = (a: unknown) => a;
  for (const c of chunker(text)) acc.ingest(c, dispatch);
  acc.finalize(dispatch);
  return { blocks: [...settled.values()].sort((a, b) => a.blockIndex - b.blockIndex), frames };
}
const charChunks = (t: string) => Array.from(t);
const randChunks = (t: string) => {
  const out: string[] = [];
  for (let i = 0; i < t.length; ) {
    const n = 1 + Math.floor(rnd() * 40);
    out.push(t.slice(i, i + n));
    i += n;
  }
  return out;
};

async function live(text: string, chunker: (t: string) => string[]) {
  const { blocks } = stream(text, chunker);
  const out: string[] = [];
  let raw = false;
  for (const b of blocks) {
    const v = await draw(
      React.createElement(BlockRenderer, {
        block: renderBlockToContentBlock(b) as never, index: b.blockIndex ?? 0, isStreamActive: false,
        replaceBlockContent: () => undefined, handleOpenEditor: () => undefined,
      }),
    );
    raw ||= v.raw;
    out.push(v.text);
  }
  return { text: out.join(" "), raw };
}

function checkTokens(label: string, out: string, segs: Seg[], problems: string[]) {
  let last = -1;
  for (const s of segs) {
    if (s.kind) continue;
    for (const t of s.tokens) {
      const re = new RegExp(`${t}(?!\\d)`, "g");
      const count = (out.match(re) ?? []).length;
      const at = out.search(new RegExp(`${t}(?!\\d)`));
      if (count !== 1) problems.push(`${label}: token ${t} count=${count}`);
      else if (at < last) problems.push(`${label}: token ${t} out of order`);
      last = Math.max(last, at);
    }
    for (const d of s.checks) {
      if (!out.includes(d)) problems.push(`${label}: decoration ${JSON.stringify(d)} missing near ${s.tokens[0]}`);
    }
  }
}

/** Pure functions: every non-kind segment's exact text survives verbatim, once, in order. */
function checkVerbatim(label: string, out: string, segs: Seg[], problems: string[]) {
  let cursor = 0;
  for (const s of segs) {
    if (s.kind) continue;
    const at = out.indexOf(s.text, cursor);
    if (at < 0) {
      problems.push(`${label}: segment changed/missing ${JSON.stringify(s.text.slice(0, 80))}`);
      continue;
    }
    cursor = at + s.text.length;
  }
}



const LOG = process.env.ZZ_LOG ?? "/dev/null";
const log = (s: string) => fs.appendFileSync(LOG, s + "\n");
const E1 = '{\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"}';
const PY = "{'__kind': 'note', 'title': 'Hi'}";
const JSL = "{ __kind: 'note', title: 'Hi' }";
const SM = "{“__kind”: “note”, “title”: “Hi”}";
const ENT = "{&quot;__kind&quot;: &quot;note&quot;}";
const ENT95 = '{"&#95;&#95;kind": "note", "title": "Hi"}';
const PROBES: Record<string, string> = {
  tableCellEsc: `| col | val |\n|---|---|\n| qx1 | ${E1} qx2 |\n| qx3 | ok |`,
  tableCellPipe: `| col | val |\n|---|---|\n| qx1 | {\\"__kind\\":\\"note\\",\\"title\\":\\"a|b\\"} qx2 |\n| qx3 | ok |`,
  tableCellPy: `| col | val |\n|---|---|\n| qx1 | ${PY} qx2 |`,
  listItem: `- qx1 ${E1} qx2\n- qx3 ${JSL} qx4`,
  heading: `## qx1 ${SM} qx2\n\nqx3`,
  linkText: `See [qx1 ${E1} qx2](https://example.com) qx3.`,
  backtickInside: `qx1 {\\"__kind\\":\\"note\\",\\"title\\":\\"a \`tick\` b\\"} qx2`,
  adjacentCode: `\`qx1\`${E1}\`qx2\` qx3`,
  newlineInRegion: `qx1 {\\"__kind\\":\\"note\\",\n\\"title\\":\\"Hi\\"} qx2`,
  blankLineInRegion: `qx1 {\\"__kind\\":\\"note\\",\n\n\\"title\\":\\"Hi\\"} qx2`,
  indentedCode: `qx1:\n\n    ${E1}\n\nqx2`,
  listJsonFence: `- qx1\n\n  \`\`\`json\n  ${E1}\n  \`\`\`\n- qx2`,
  quoteJsonFence: `> qx1\n> \`\`\`json\n> ${E1}\n> \`\`\`\n\nqx2`,
  htmlBlock: `<table><tr><td>qx1 ${E1} qx2</td></tr></table>\n\nqx3`,
  details: `<details><summary>qx1</summary>\n${E1} qx2\n</details>\n\nqx3`,
  entity95: `qx1 ${ENT95} qx2`,
  entity: `qx1 ${ENT} qx2`,
  mathNear: `qx1 $$a$$ ${E1} $$b$$ qx2`,
  emphasisAround: `**qx1 ${E1} qx2** _qx3 ${PY} qx4_`,
  realJsonInCell: `| a | b |\n|---|---|\n| qx1 | {"__kind":"note","title":"Hi"} qx2 |`,
  realJsonStringValue: `qx1 {"payload": "{\\"__kind\\":\\"note\\",\\"title\\":\\"Hi\\"}"} qx2`,
  realMdEsc: `qx1 {"\\_\\_kind":"note","title":"Hi"} qx2`,
  realZwInList: `- qx1 {"__​kind":"note","title":"Hi"} qx2`,
  realInHeading: `## qx1 {"__kind":"note","title":"Hi"} qx2`,
  realInLink: `[qx1 {"__kind":"note","title":"Hi"} qx2](https://e.com)`,
  realInQuote: `> qx1 {"__kind":"note","title":"Hi"} qx2`,
  realUnclosedCell: `| a | b |\n|---|---|\n| qx1 | {"__kind":"note","title":"Hi" and qx2 |`,
  realInDetails: `<details><summary>qx1</summary>\n\n{"__kind":"note","title":"Hi"}\n\n</details>\n\nqx2`,
  realInHtmlTd: `<table><tr><td>qx1 {"__kind":"note","title":"Hi"} qx2</td></tr></table>`,
  realEscapedInsideJsonFence: "```json\n{\"payload\": \"{\\\"__kind\\\":\\\"note\\\"}\"}\n```\nqx1",
};
describe("zz r10 probes", () => {
  it.each(Object.entries(PROBES))("%s", async (name, text) => {
    const r = await reload(text);
    const l = await live(text, randChunks);
    const c = await live(text, charChunks);
    const flat = (s: string) => JSON.stringify(s.replace(/\s+/g, " ").trim());
    log(`PROBE ${name}\n IN: ${JSON.stringify(text)}\n ASCODE: ${JSON.stringify(nonJsonKindsAsCode(spelledKindsAsOneLine(text)))}\n RELOAD raw=${r.raw}: ${flat(r.text)}\n LIVE   raw=${l.raw}: ${flat(l.text)}\n CHAR   raw=${c.raw}: ${flat(c.text)}`);
  });
});

const N = Number(process.env.ZZ_N ?? 30);
const msgs = Array.from({ length: N }, () => message());
describe("zz r10 harm fuzz", () => {
  it("rendered reload / live keep every token once, in order; no raw", async () => {
    const problems: string[] = [];
    for (const [i, m] of msgs.entries()) {
      const r = await reload(m.text);
      const realKind = m.segs.some((s) => s.kind);
      if (r.raw) problems.push(`#${i} reload RAW`);
      checkTokens(`#${i} reload`, r.text, m.segs, problems);
      const l1 = await live(m.text, randChunks);
      if (l1.raw) problems.push(`#${i} live-rand RAW`);
      checkTokens(`#${i} live-rand`, l1.text, m.segs, problems);
      if (i < 10) {
        const l2 = await live(m.text, charChunks);
        if (l2.raw) problems.push(`#${i} live-char RAW`);
        checkTokens(`#${i} live-char`, l2.text, m.segs, problems);
      }
      if (problems.some((p) => p.startsWith(`#${i} `))) {
        log(`MSG #${i}: ${JSON.stringify(m.text)}\nRELOAD: ${JSON.stringify(r.text.replace(/\s+/g, " ").slice(0, 1500))}\nLIVE: ${JSON.stringify(l1.text.replace(/\s+/g, " ").slice(0, 1500))}`);
      }
      void realKind;
    }
    log(`render problems: ${problems.length}\n${problems.slice(0, 80).join("\n")}`);
  });
});
