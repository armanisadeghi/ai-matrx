/**
 * THE ONE SELECTION TOOLBAR — census guard.
 *
 * A document has one text selection, so the app has one selection toolbar:
 * components/selection-toolbar (SelectionToolbarRoot + SelectionToolbarFrame,
 * rendering the Alchemy package's selection layout over the one registry).
 * On 2026-09-26 there were three (the rich editor's Tiptap BubbleMenu, the
 * annotation sidecar's popover, the context menu's floating selection icon),
 * and two of them drew on top of each other in the editor. This census fails
 * the moment a second one appears:
 *
 *   1. a Tiptap BubbleMenu outside the allowlist;
 *   2. the package selection layout rendered anywhere but the frame;
 *   3. a component named like a selection popup (…SelectionToolbar,
 *      …SelectionPopover, …SelectionBubble, FloatingSelection…, …BubbleMenu,
 *      AnnotationToolbar, HighlightToolbar) declared outside the canonical files;
 *   4. a new document-level `selectionchange` listener outside the root and
 *      the context menu's selection tracking;
 *   5. BY BEHAVIOUR, whatever it is named: a file that reads the selection
 *      (`getSelection()` / a field's `selectionStart`), listens for the gesture
 *      that ends one (mouseup / pointerup / keyup / touchend / select /
 *      selectionchange), measures it (`getBoundingClientRect`) and renders
 *      something positioned (`createPortal`, `position: fixed|absolute`, a
 *      `fixed` class) — the mouseup-and-getSelection floating bar, the app's
 *      commonest second-popup shape (verify round 1, finding 2).
 *
 * Selection-driven behaviours that are NOT popups, and so are not toolbars
 * (they render nothing positioned — rule 5 does not match them — and the
 * reason is recorded here so the next reader does not "migrate" them):
 *   • masterwork RedPenDialog — the drag IS the command: marking a passage in
 *     the expert's red-pen dialog pins it and opens the dialog's own inline
 *     "what is wrong" field below the work (a highlighter tool mode, like a
 *     Kindle highlight pen); there is no action set to choose from.
 *   • agent builder MessageItem / SystemMessage — a drag across a read-only
 *     message block switches that block to its editor with the same text
 *     selected (click-to-edit); once editing, the ONE toolbar serves it.
 *
 * A new passage action is a registry action + a row in SELECTION_ACTION_MODES
 * (components/selection-toolbar/selection-actions.ts), never a new popup.
 */

import { execSync } from "node:child_process";
import { mkdtempSync, mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

const CANONICAL = new Set([
  "components/selection-toolbar/SelectionToolbarRoot.tsx",
  "components/selection-toolbar/SelectionToolbarFrame.tsx",
]);

/** Each entry says why it is not a text-selection toolbar. Shrink-only. */
const ALLOW: Record<string, string> = {
  // A bulk bar for picked ITEMS (images, rows): "3 selected · Delete" — no text selection.
  "components/shared/FloatingSelectionToolbar.tsx": "multi-item bulk bar, not a text selection toolbar",
  "components/shared/FloatingSelectionToolbar.test.tsx": "its test",
  // The context menu tracks the selection for what its right-click menu acts on; it draws no popup.
  "features/context-menu-v3/ContextMenuV3.tsx": "selection tracking for the right-click menu; no popup",
};

const RULES: { id: string; pattern: RegExp; allowCanonical: boolean }[] = [
  { id: "tiptap-bubble-menu", pattern: /from\s+["']@tiptap\/react\/menus["']|<BubbleMenu\b/, allowCanonical: false },
  { id: "package-selection-layout", pattern: /["']@ai-matrx\/alchemy\/react\/selection["']/, allowCanonical: true },
  {
    id: "selection-popup-component",
    pattern:
      /(?:function|const|class)\s+(?:\w*Selection(?:Toolbar|Popover|Bubble|Popup)|Floating\w*Selection\w*|\w*BubbleMenu|AnnotationToolbar|HighlightToolbar)\b/,
    allowCanonical: true,
  },
  { id: "selectionchange-listener", pattern: /addEventListener\(\s*["']selectionchange["']/, allowCanonical: true },
];

/** Rule 5: selection-driven floating UI, by behaviour (all four in one file). */
const BEHAVIOUR = {
  readsSelection: /getSelection\(|\.selectionStart\b/,
  endsGesture: /addEventListener\(\s*["'](mouseup|pointerup|selectionchange|keyup|touchend|select)["']|on(MouseUp|PointerUp|KeyUp|TouchEnd|Select)=/,
  measures: /getBoundingClientRect/,
  positions: /createPortal\(|position:\s*["']?(fixed|absolute)|["' `]fixed["' `]/,
};

export interface Finding {
  file: string;
  rule: string;
  line: number;
}

/** Scan `files` (repo-relative paths under `root`). */
export function censusSelectionToolbars(root: string, files: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  for (const file of files) {
    if (!/\.(tsx?|jsx?)$/.test(file)) continue;
    if (file.startsWith("components/selection-toolbar/__tests__/")) continue;
    if (ALLOW[file]) continue;
    let text: string;
    try {
      text = readFileSync(join(root, file), "utf8");
    } catch {
      continue;
    }
    const lines = text.split("\n");
    if (!CANONICAL.has(file) && Object.values(BEHAVIOUR).every((re) => re.test(text))) {
      const at = lines.findIndex((l) => BEHAVIOUR.readsSelection.test(l));
      findings.push({ file, rule: "selection-driven-floating-ui", line: at + 1 });
    }
    for (const rule of RULES) {
      if (rule.allowCanonical && CANONICAL.has(file)) continue;
      const at = lines.findIndex((l) => rule.pattern.test(l));
      if (at >= 0) findings.push({ file, rule: rule.id, line: at + 1 });
    }
  }
  return findings;
}

function trackedSourceFiles(): string[] {
  return execSync("git ls-files -- '*.ts' '*.tsx' '*.js' '*.jsx'", { cwd: ROOT, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 })
    .split("\n")
    .filter(Boolean)
    .filter((f) => !f.startsWith("node_modules/"));
}

describe("one selection toolbar", () => {
  it("the codebase has exactly one text-selection toolbar", () => {
    const findings = censusSelectionToolbars(ROOT, trackedSourceFiles());
    if (findings.length) {
      const report = findings.map((f) => `  ${f.file}:${f.line}  [${f.rule}]`).join("\n");
      throw new Error(
        `A second selection popup appeared. Add passage actions to the ONE selection toolbar instead ` +
          `(a registry action + a SELECTION_ACTION_MODES row, components/selection-toolbar):\n${report}`,
      );
    }
    expect(findings).toEqual([]);
  });

  it("the canonical toolbar is where the census says it is", () => {
    for (const file of CANONICAL) expect(readFileSync(join(ROOT, file), "utf8").length).toBeGreaterThan(0);
  });

  it("the census goes red on a planted second toolbar (scratch copy, never the real tree)", () => {
    const scratch = mkdtempSync(join(tmpdir(), "selection-census-"));
    const plant = (file: string, body: string) => {
      mkdirSync(dirname(join(scratch, file)), { recursive: true });
      writeFileSync(join(scratch, file), body);
    };
    plant("features/notes/NoteSelectionPopover.tsx", "export function NoteSelectionPopover() { return null; }\n");
    plant("features/chat/AnswerBubble.tsx", 'import { BubbleMenu } from "@tiptap/react/menus";\n');
    plant("features/docs/Listen.tsx", 'document.addEventListener("selectionchange", () => {});\n');
    plant("features/docs/Layout.tsx", 'import { SelectionToolbar } from "@ai-matrx/alchemy/react/selection";\n');
    // The verifier's plant: a mouseup + getSelection bar portaled to the body, named innocently.
    plant(
      "features/chat/AnswerQuoteBar.tsx",
      [
        'import { createPortal } from "react-dom";',
        "export function AnswerQuoteBar() {",
        '  document.addEventListener("mouseup", () => {',
        "    const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect();",
        "    void r;",
        "  });",
        '  return createPortal(<div className="fixed z-50">Quote · Highlight</div>, document.body);',
        "}",
      ].join("\n"),
    );
    const findings = censusSelectionToolbars(scratch, [
      "features/notes/NoteSelectionPopover.tsx",
      "features/chat/AnswerBubble.tsx",
      "features/docs/Listen.tsx",
      "features/docs/Layout.tsx",
      "features/chat/AnswerQuoteBar.tsx",
    ]);
    expect(findings.map((f) => f.rule).sort()).toEqual([
      "package-selection-layout",
      "selection-driven-floating-ui",
      "selection-popup-component",
      "selectionchange-listener",
      "tiptap-bubble-menu",
    ]);
  });
});
