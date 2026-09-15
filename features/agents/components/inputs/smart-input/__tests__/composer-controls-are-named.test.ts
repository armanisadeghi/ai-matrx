/**
 * EVERY ICON-ONLY COMPOSER CONTROL HAS A NAME.
 *
 * The defect (independent review, production `528560bbc8`, 2026-09-15): in a
 * LOADED chat the send control carried only `title="Send Message"` and no
 * `aria-label` — while the new-chat composer's send control did expose one.
 * The same button, two different stories, and a screen reader hears "button"
 * on the one that matters most. A `title` attribute is a tooltip, not an
 * accessible name: on a `<button>` it is only the LAST fallback in the
 * accessible-name computation, it is never announced by touch screen readers,
 * and it is invisible to keyboard users who never hover.
 *
 * This is a CLASS guard, not a patch for one button: it walks the real source
 * of every composer in this directory with the TypeScript parser, finds every
 * button whose only children are icons, and requires a name on each. A new
 * icon-only control added here fails this test on the day it is written.
 *
 * Proven failing before passing: removing the `aria-label` added to the send
 * control in `InputActionButtons.tsx` (the exact live defect) → RED, naming
 * the file, the line and the icon.
 */

import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

const COMPOSER_DIR = path.join(__dirname, "..");

/** Elements that are buttons for a person, whatever the library calls them. */
const BUTTON_TAGS = new Set(["button", "Button", "TapTargetButton"]);

/** Props that give a control an accessible name. */
const NAMING_PROPS = new Set(["aria-label", "aria-labelledby", "ariaLabel", "label", "tooltip"]);

interface Finding {
  file: string;
  line: number;
  tag: string;
}

function sourceFilesToCheck(): string[] {
  return fs
    .readdirSync(COMPOSER_DIR)
    .filter((f) => f.endsWith(".tsx"))
    .map((f) => path.join(COMPOSER_DIR, f));
}

/** Does this JSX element render any real text a screen reader could read? */
function rendersText(node: ts.JsxElement): boolean {
  let found = false;
  const walk = (n: ts.Node) => {
    if (found) return;
    if (ts.isJsxText(n) && n.text.trim().length > 0) {
      found = true;
      return;
    }
    // `{summary}`, `{t.label}`, `{cond ? "a" : "b"}` inside the button — text
    // we cannot statically read, but a name nonetheless. An expression that
    // resolves to JSX (an icon in braces) is not text.
    if (ts.isJsxExpression(n) && n.expression) {
      const e = n.expression;
      const isJsx =
        ts.isJsxElement(e) ||
        ts.isJsxSelfClosingElement(e) ||
        ts.isJsxFragment(e);
      if (!isJsx) {
        found = true;
        return;
      }
    }
    n.forEachChild(walk);
  };
  node.children.forEach(walk);
  return found;
}

function hasNamingProp(attrs: ts.JsxAttributes): boolean {
  return attrs.properties.some((prop) => {
    if (ts.isJsxSpreadAttribute(prop)) return true; // spread may carry one
    const name = prop.name && ts.isIdentifier(prop.name)
      ? prop.name.text
      : prop.name?.getText().replace(/['"]/g, "");
    return !!name && NAMING_PROPS.has(name);
  });
}

function findUnnamedIconButtons(file: string): Finding[] {
  const text = fs.readFileSync(file, "utf8");
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
  const findings: Finding[] = [];

  const visit = (node: ts.Node) => {
    if (ts.isJsxElement(node)) {
      const tag = node.openingElement.tagName.getText();
      if (BUTTON_TAGS.has(tag)) {
        const named = hasNamingProp(node.openingElement.attributes);
        if (!named && !rendersText(node)) {
          findings.push({
            file: path.basename(file),
            line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
            tag,
          });
        }
      }
    }
    if (ts.isJsxSelfClosingElement(node)) {
      const tag = node.tagName.getText();
      // A self-closing button renders no children at all, so it can ONLY be
      // named by a prop.
      if (BUTTON_TAGS.has(tag) && !hasNamingProp(node.attributes)) {
        findings.push({
          file: path.basename(file),
          line: sf.getLineAndCharacterOfPosition(node.getStart()).line + 1,
          tag,
        });
      }
    }
    node.forEachChild(visit);
  };
  visit(sf);
  return findings;
}

describe("the chat composer's icon-only controls are named", () => {
  it("finds composer source to check at all", () => {
    const files = sourceFilesToCheck();
    expect(files.length).toBeGreaterThan(5);
    expect(files.map((f) => path.basename(f))).toEqual(
      expect.arrayContaining([
        "InputActionButtons.tsx",
        "SingleRowActionButtons.tsx",
      ]),
    );
  });

  it("names the send control in BOTH composers", () => {
    for (const file of ["InputActionButtons.tsx", "SingleRowActionButtons.tsx"]) {
      const src = fs.readFileSync(path.join(COMPOSER_DIR, file), "utf8");
      // The send control is the one whose title ends in "Send Message"; it must
      // now carry an aria-label in the same element.
      expect(src).toContain('"Send Message"');
      expect(src).toContain('"Send message"');
      expect(src).toMatch(/aria-label=\{\s*\n?\s*isExecuting/);
    }
  });

  it("leaves no icon-only button in this directory without an accessible name", () => {
    const findings = sourceFilesToCheck().flatMap(findUnnamedIconButtons);
    const report = findings
      .map((f) => `  ${f.file}:${f.line} <${f.tag}> has no aria-label and no text`)
      .join("\n");
    expect(report).toBe("");
  });
});
