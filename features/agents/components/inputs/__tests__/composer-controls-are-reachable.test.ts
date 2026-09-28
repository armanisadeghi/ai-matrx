/**
 * EVERY COMPOSER CONTROL IS REACHABLE BY KEYBOARD.
 *
 * The defect (a11y pass on /education/tutor/new, 2026-09-28, reproduced on
 * /chat with Playwright): the composer's Send button — and its Stop, Attach,
 * Documents & context, Live audio, row-choices and expand controls — carried
 * `tabIndex={-1}`. Tab went textarea → "Record audio" and never reached Send,
 * so a keyboard or switch user could send only if they knew Enter did it.
 * WCAG 2.1.1: every function of the page is operable from the keyboard.
 *
 * `tabIndex={-1}` on a real control is the whole class, and it was copied
 * from file to file — so this guard walks EVERY composer source under
 * `features/agents/components/inputs/` with the TypeScript parser and fails on
 * any button carrying it. A disabled `<button>` is already skipped by the
 * browser; nothing needs `-1` to hide it. A decorative element INSIDE a
 * focusable row (a Checkbox drawn in an option button) is not a button tag
 * and is not flagged.
 *
 * Proven failing before passing: with the pre-fix sources this lists
 * InputActionButtons.tsx (Stop, Send), SingleRowActionButtons.tsx (Stop, Send,
 * Live audio), ContextDocsMenu.tsx, SmartAgentResourcePickerButton.tsx (x2),
 * AgentVariablesInline.tsx and RowChoicesButton.tsx → RED.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const INPUTS_DIR = path.join(__dirname, "..");

/** Elements that are buttons for a person, whatever the library calls them. */
function isButtonTag(tag: string): boolean {
  return (
    tag === "button" ||
    tag === "Button" ||
    tag.startsWith("TapTargetButton") ||
    /TapButton$/.test(tag)
  );
}

function allTsx(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === "__tests__" ? [] : allTsx(full);
    return e.name.endsWith(".tsx") && !e.name.includes(".test.") ? [full] : [];
  });
}

function removesFromTabOrder(attrs: ts.JsxAttributes): boolean {
  return attrs.properties.some((prop) => {
    if (!ts.isJsxAttribute(prop)) return false;
    if (prop.name.getText() !== "tabIndex") return false;
    const init = prop.initializer;
    if (!init) return false;
    const text = init.getText().replace(/[{}\s"']/g, "");
    return text === "-1";
  });
}

function findUnreachable(file: string): string[] {
  const src = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, src, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const out: string[] = [];
  const visit = (node: ts.Node) => {
    const opening = ts.isJsxElement(node)
      ? node.openingElement
      : ts.isJsxSelfClosingElement(node)
        ? node
        : null;
    if (opening) {
      const tag = opening.tagName.getText();
      if (isButtonTag(tag) && removesFromTabOrder(opening.attributes)) {
        const line = sf.getLineAndCharacterOfPosition(opening.getStart()).line + 1;
        out.push(`  ${path.relative(INPUTS_DIR, file)}:${line} <${tag} tabIndex={-1}>`);
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return out;
}

describe("the composer's controls are reachable by keyboard", () => {
  it("finds the composer sources to check", () => {
    const names = allTsx(INPUTS_DIR).map((f) => path.basename(f));
    expect(names).toEqual(
      expect.arrayContaining([
        "InputActionButtons.tsx",
        "SingleRowActionButtons.tsx",
        "ContextDocsMenu.tsx",
        "SmartAgentResourcePickerButton.tsx",
      ]),
    );
  });

  it("the detector flags a button removed from the tab order", () => {
    const tmp = path.join(__dirname, "__reachability_fixture__.tsx");
    fs.writeFileSync(tmp, 'export const X = () => <Button tabIndex={-1} aria-label="Send">s</Button>;\n');
    try {
      expect(findUnreachable(tmp)).toHaveLength(1);
    } finally {
      fs.unlinkSync(tmp);
    }
  });

  it("no button under features/agents/components/inputs carries tabIndex={-1}", () => {
    const report = allTsx(INPUTS_DIR).flatMap(findUnreachable).join("\n");
    expect(report).toBe("");
  });
});
