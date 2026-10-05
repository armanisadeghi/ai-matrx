/**
 * GUARD: `<MarkdownStream>` is the streaming engine's front door, not the way to
 * show text. A caller that only displays text (no live stream, no pipeline
 * props) renders through `<RichContent level="full">`, which forwards every
 * display / host hook (onContentChange, messageId, analysisData, conversationId,
 * allowFullScreenEditor, hideCopyButton, applyLocalEdits, isStreaming).
 *
 * A `<MarkdownStream>` outside the engine's own folders must carry at least one
 * stream-only prop (events, taskId, requestId, recordMessageIds, streamSlotStart/End,
 * agentCallId, turnId, serverProcessedBlocks, strictServerData, onError,
 * onPhaseUpdate, role, type) or a spread (a forwarding wrapper is judged where it
 * is used). There is no allow-list: the set of non-streaming callers is empty and
 * can only stay empty.
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["app", "features", "packages/chat/src", "components", "lib", "providers"];
/** The engine itself and its nested blocks (they must not stack a second router). */
const ENGINE = ["components/mardown-display/", "components/rich-content/", "components/MarkdownStream"];
const STREAM_ONLY = new Set([
  "events",
  "taskId",
  "requestId",
  "recordMessageIds",
  "streamSlotStart",
  "streamSlotEnd",
  "agentCallId",
  "turnId",
  "serverProcessedBlocks",
  "strictServerData",
  "onError",
  "onPhaseUpdate",
  "role",
  "type",
]);

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".next") || e.name === "__tests__") continue;
      yield* walk(p);
    } else if (/\.tsx$/.test(e.name) && !/\.(test|spec|stories)\.tsx$/.test(e.name)) yield p;
  }
}

/** Display-only `<MarkdownStream>` callers: file:line. */
export function nonStreamingCallers(root: string, dirs: readonly string[] = DIRS): string[] {
  const out: string[] = [];
  for (const dir of dirs) {
    for (const file of walk(path.join(root, dir))) {
      const rel = path.relative(root, file).split(path.sep).join("/");
      if (ENGINE.some((e) => rel.startsWith(e)) || rel === "features/rich-document/RichDocument.tsx") continue;
      const text = fs.readFileSync(file, "utf8");
      if (!text.includes("<MarkdownStream")) continue;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if ((ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) && node.tagName.getText() === "MarkdownStream") {
          const props = node.attributes.properties;
          const streams = props.some(
            (p) => ts.isJsxSpreadAttribute(p) || (ts.isJsxAttribute(p) && STREAM_ONLY.has(p.name.getText())),
          );
          if (!streams) out.push(`${rel}:${sf.getLineAndCharacterOfPosition(node.getStart()).line + 1}`);
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return out.sort();
}

describe("MarkdownStream is only for streams", () => {
  it("has no display-only caller — those render through <RichContent level=\"full\">", () => {
    const offenders = nonStreamingCallers(ROOT);
    if (offenders.length) {
      throw new Error(
        'A <MarkdownStream> shows text without a stream. Use <RichContent level="full" source={…} imagePolicy={…} /> ' +
          "(it forwards onContentChange, messageId, analysisData, hideCopyButton, isStreaming…):\n  " +
          offenders.join("\n  "),
      );
    }
  });

  it("goes red on a planted display-only caller and green once it streams or moves (self-proof)", () => {
    const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ms-callers-"));
    const dir = path.join(tmp, "features/demo");
    fs.mkdirSync(dir, { recursive: true });
    const f = path.join(dir, "Show.tsx");
    fs.writeFileSync(f, 'export const A = () => <MarkdownStream imagePolicy="ai" content="x" hideCopyButton />;\n');
    expect(nonStreamingCallers(tmp, ["features"])).toEqual(["features/demo/Show.tsx:1"]);
    fs.writeFileSync(f, 'export const A = () => <MarkdownStream imagePolicy="ai" content="x" requestId="r" />;\n');
    expect(nonStreamingCallers(tmp, ["features"])).toEqual([]);
    fs.writeFileSync(f, 'export const A = () => <RichContent level="full" imagePolicy="ai" source="x" />;\n');
    expect(nonStreamingCallers(tmp, ["features"])).toEqual([]);
    fs.rmSync(tmp, { recursive: true, force: true });
  });
});
