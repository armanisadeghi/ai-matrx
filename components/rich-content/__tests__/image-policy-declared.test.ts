/**
 * FORCING FUNCTION: every surface that renders content at the FULL level says who
 * wrote it (chair ruling 2026-09-25). `imagePolicy` decides whether remote images
 * load by themselves; a surface that forgets it silently falls to click-to-load
 * AND hides the one fact the platform needs to decide. So a full-level call site
 * without `imagePolicy=` fails here, by file and line.
 *
 * Full-level entry points: <RichDocument>, <MarkdownStream>, <RichContent level="full">,
 * and the full-level engine's markdown leaves used directly (<BasicMarkdownContent>,
 * <ConfigurableMarkdownContent>) — a new surface reaching for a leaf is still a surface —
 * and the generic editors that forward it (<RichEditor>, <NoteEditorCore>, <MatrxSplit>,
 * <ContentEditor>, <FullScreenMarkdownEditor>), whose callers know whose text it is.
 * Parsed with the TypeScript compiler (never a regex over JSX), over app/,
 * features/, components/, lib/ and providers/ — tests excluded.
 */
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const ROOT = path.resolve(__dirname, "../../..");
const DIRS = ["app", "features", "components", "lib", "providers"];
const ENTRIES = new Set([
  "RichDocument",
  "MarkdownStream",
  "BasicMarkdownContent",
  "ConfigurableMarkdownContent",
  // Generic editors/previews that forward `imagePolicy` to one of the above: the
  // component cannot know whose text it holds, so its CALLER declares.
  "RichEditor",
  "NoteEditorCore",
  "MatrxSplit",
  "ContentEditor",
  "FullScreenMarkdownEditor",
  "BasicContentEditor",
  "RefinableContentEditor",
  "ContentEditorStack",
]);

function* walk(dir: string): Generator<string> {
  if (!fs.existsSync(dir)) return;
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    const p = path.join(dir, e.name);
    if (e.isDirectory()) {
      if (e.name === "node_modules" || e.name.startsWith(".next") || e.name === "__tests__") continue;
      yield* walk(p);
    } else if (/\.tsx$/.test(e.name) && !/\.(test|spec|stories)\.tsx$/.test(e.name)) {
      yield p;
    }
  }
}

function attr(node: ts.JsxOpeningLikeElement, name: string): ts.JsxAttribute | undefined {
  return node.attributes.properties.find(
    (p): p is ts.JsxAttribute => ts.isJsxAttribute(p) && p.name.getText() === name,
  );
}

function spreadsProps(node: ts.JsxOpeningLikeElement): boolean {
  return node.attributes.properties.some((p) => ts.isJsxSpreadAttribute(p));
}

/** Every full-level call site that does not declare imagePolicy. */
export function undeclaredFullLevelSites(): string[] {
  const out: string[] = [];
  for (const dir of DIRS) {
    for (const file of walk(path.join(ROOT, dir))) {
      const text = fs.readFileSync(file, "utf8");
      if (!/RichDocument|MarkdownStream|RichContent|BasicMarkdownContent|ConfigurableMarkdownContent|RichEditor|NoteEditorCore|MatrxSplit|ContentEditor|FullScreenMarkdownEditor|BasicContentEditor|RefinableContentEditor|ContentEditorStack/.test(text)) continue;
      const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
      const visit = (node: ts.Node) => {
        if (ts.isJsxOpeningElement(node) || ts.isJsxSelfClosingElement(node)) {
          const tag = node.tagName.getText();
          const level = attr(node, "level");
          const levelText = level?.initializer?.getText() ?? "";
          const full =
            ENTRIES.has(tag) ||
            (tag === "RichContent" && (/"full"/.test(levelText) || (level !== undefined && !/"(inline|standard)"/.test(levelText))));
          // A spread may carry imagePolicy from the caller: the CALLER is then the call site
          // (its own <RichDocument {...props}> is a forwarding wrapper, judged where it is used).
          if (full && !attr(node, "imagePolicy") && !spreadsProps(node)) {
            const { line } = sf.getLineAndCharacterOfPosition(node.getStart());
            out.push(`${path.relative(ROOT, file)}:${line + 1} <${tag}>`);
          }
        }
        ts.forEachChild(node, visit);
      };
      visit(sf);
    }
  }
  return out.sort();
}

describe("every full-level render declares who wrote the content", () => {
  it("has no <RichDocument>, <MarkdownStream>, <RichContent level=\"full\">, <BasicMarkdownContent> or <ConfigurableMarkdownContent> without imagePolicy", () => {
    const missing = undeclaredFullLevelSites();
    if (missing.length) {
      throw new Error(
        `${missing.length} full-level render(s) do not say who wrote the content. Add ` +
          'imagePolicy="ai" (a model wrote it), "other" (someone else) or "self" (the viewer) — ' +
          "components/rich-content/prose/remote-image-policy.tsx:\n  " +
          missing.join("\n  "),
      );
    }
  });

  it("the guard itself finds an undeclared site (self-test)", () => {
    const sample = ts.createSourceFile("x.tsx", 'const a = <RichDocument content={c} source={s} />; const b = <RichDocument imagePolicy="ai" content={c} />;', ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
    let flagged = 0;
    const visit = (n: ts.Node) => {
      if ((ts.isJsxSelfClosingElement(n) || ts.isJsxOpeningElement(n)) && ENTRIES.has(n.tagName.getText()) && !attr(n, "imagePolicy")) flagged += 1;
      ts.forEachChild(n, visit);
    };
    visit(sample);
    expect(flagged).toBe(1);
  });
});
