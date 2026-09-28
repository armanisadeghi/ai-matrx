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
 *   5. BY BEHAVIOUR, whatever it is named, across a FEATURE (a file plus every helper and
 *      hook it reaches, transitively and cycle-safe, and one level of the component it renders —
 *      helper → hook → bar is one popup): it
 *      reads the document selection (`getSelection()`), listens for the gesture that ends one
 *      (mouseup / pointerup / keyup / touchend / select / selectionchange, as a listener or an
 *      inline `onMouseUp`…), measures the selection's RANGE (`getRangeAt`/`createRange` with
 *      `getBoundingClientRect`/`getClientRects`) and draws something at that place (a portal,
 *      fixed/absolute style or class, a Radix Popover/anchor, floating-ui, a virtual reference).
 *      Six realistic shapes are planted below (one reads the selection two imports from its bar);
 *      the pre-2026-09-28 census caught 1 of them, the one-level version 5.
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
  // Its capture helper: reads and measures the selection so the right-click menu knows what it
  // acts on (and anchors the menu at the pointer). It draws nothing; every module that imports it
  // reaches it only through the context-menu hooks.
  "features/context-menu-v3/utils/selection-tracking.ts": "the right-click menu's selection capture; draws nothing",
};

const RULES: { id: string; pattern: RegExp; allowCanonical: boolean; alsoNeeds?: RegExp }[] = [
  { id: "tiptap-bubble-menu", pattern: /from\s+["']@tiptap\/react\/menus["']|<BubbleMenu\b/, allowCanonical: false },
  { id: "package-selection-layout", pattern: /["']@ai-matrx\/alchemy\/react\/selection["']/, allowCanonical: true },
  {
    id: "selection-popup-component",
    pattern:
      /(?:function|const|class)\s+(?:\w*Selection(?:Toolbar|Popover|Bubble|Popup)|Floating\w*Selection\w*|\w*BubbleMenu|AnnotationToolbar|HighlightToolbar)\b/,
    allowCanonical: true,
  },
  // A selectionchange listener is a popup only when the file also floats UI. A caret guard in an
  // editor (MergeFieldInput keeps the caret out of chips) draws nothing and is no toolbar.
  {
    id: "selectionchange-listener",
    pattern: /addEventListener\(\s*["']selectionchange["']/,
    allowCanonical: true,
    alsoNeeds: /createPortal\(|position:\s*["']?(fixed|absolute)|className=\{?["'`][^"'`]*\b(fixed|absolute)\b|getBoundingClientRect/,
  },
];

/**
 * Rule 5: selection-driven floating UI, by behaviour. A FEATURE is a file plus the local
 * modules it imports directly (one level): a `useQuoteSelection` hook that reads and measures
 * the selection and the component that renders its bar are one popup (verify round 2 prep).
 */
const BEHAVIOUR = {
  // Reading the DOCUMENT selection — clearing it (`getSelection()?.removeAllRanges()`, a canvas
  // tile entering edit) is not, and a field's own caret (`selectionStart`) draws nothing at a place.
  readsSelection: /getSelection\(\)(?!\??\.removeAllRanges\(\))/,
  // The gesture that ends a selection. (`onSelect=` is not one: it is every Radix menu item.)
  endsGesture:
    /addEventListener\(\s*["'](mouseup|pointerup|selectionchange|keyup|touchend|select)["']|on(MouseUp|PointerUp|KeyUp|TouchEnd)\s*=/,
  // Where the SELECTION sits: range geometry — a Range from the selection (`getRangeAt`,
  // `createRange`) measured with `getBoundingClientRect` / `getClientRects`.
  measures: /(getRangeAt\(|createRange\()[\s\S]*(getBoundingClientRect|getClientRects)|(getBoundingClientRect|getClientRects)[\s\S]*(getRangeAt\(|createRange\()/,
  // Something drawn at that place: a portal, fixed/absolute placement (style or class), or a
  // floating-UI / Radix anchor (Popover, Floating, useFloating, a virtual reference).
  positions:
    /createPortal\(|position:\s*["']?(fixed|absolute)|["'` ](fixed|absolute)["'` ]|<Popover(Anchor|Content)?\b|\bFloating[A-Z]\w*|\buseFloating\b|@floating-ui\/|virtualRef|virtualElement|setPositionReference/,
};

type Behaviour = keyof typeof BEHAVIOUR;

export interface Finding {
  file: string;
  rule: string;
  line: number;
}

const SOURCE_EXT = [".tsx", ".ts", ".jsx", ".js"];

/** A helper or hook module (no component of its own): a `.ts`/`.js` file, or a `use…` hook file. */
function isLogicModule(file: string): boolean {
  return /\.(ts|js)$/.test(file) || /(^|\/)use[A-Z][^/]*\.(tsx|jsx)$/.test(file);
}

/** The repo-relative file a local import resolves to (`@/x`, `./x`, `../x`), or null. */
function resolveLocal(from: string, spec: string, known: ReadonlySet<string>): string | null {
  let base: string;
  if (spec.startsWith("@/")) base = spec.slice(2);
  else if (spec.startsWith("./") || spec.startsWith("../")) base = join(dirname(from), spec);
  else return null;
  base = base.replace(/\\/g, "/");
  const candidates = [base, ...SOURCE_EXT.map((e) => base + e), ...SOURCE_EXT.map((e) => `${base}/index${e}`)];
  return candidates.find((c) => known.has(c)) ?? null;
}

const IMPORT_SPEC = /(?:import|export)\s[^"';]*?from\s*["']([^"']+)["']|import\(\s*["']([^"']+)["']\s*\)/g;

/** Scan `files` (repo-relative paths under `root`). */
export function censusSelectionToolbars(root: string, files: readonly string[]): Finding[] {
  const findings: Finding[] = [];
  const sources = files.filter((f) => /\.(tsx?|jsx?)$/.test(f) && !f.startsWith("components/selection-toolbar/__tests__/"));
  const known = new Set(sources);
  const textCache = new Map<string, string | null>();
  const textOf = (file: string) => {
    if (!textCache.has(file)) {
      try {
        textCache.set(file, readFileSync(join(root, file), "utf8"));
      } catch {
        textCache.set(file, null);
      }
    }
    return textCache.get(file) ?? null;
  };
  const signalCache = new Map<string, Set<Behaviour>>();
  const signalsOf = (file: string): Set<Behaviour> => {
    let sigs = signalCache.get(file);
    if (!sigs) {
      const text = textOf(file) ?? "";
      sigs = new Set((Object.keys(BEHAVIOUR) as Behaviour[]).filter((k) => BEHAVIOUR[k].test(text)));
      signalCache.set(file, sigs);
    }
    return sigs;
  };

  const importsCache = new Map<string, string[]>();
  const importsOf = (file: string): string[] => {
    if (!importsCache.has(file)) {
      const deps: string[] = [];
      for (const m of (textOf(file) ?? "").matchAll(IMPORT_SPEC)) {
        const dep = resolveLocal(file, m[1] ?? m[2], known);
        if (!dep || CANONICAL.has(dep) || ALLOW[dep] || dep.startsWith("components/selection-toolbar/")) continue;
        deps.push(dep);
      }
      importsCache.set(file, deps);
    }
    return importsCache.get(file)!;
  };
  /**
   * A SELECTION SOURCE reads the document selection AND measures its range in one module — the
   * heart of every selection popup. Few modules do (the one toolbar's root, the context menu's
   * tracking, the annotation capture); anything else that does is where a second popup starts.
   */
  const isSource = (file: string) => {
    const sigs = signalsOf(file);
    return sigs.has("readsSelection") && sigs.has("measures");
  };
  /**
   * What `file` reaches through LOGIC imports (helpers and hooks), transitively, memoised, cycle-
   * safe: does it reach a selection source, and does the chain handle the ending gesture? Selection
   * data reaches a bar through logic, never through a rendered component (a child component that
   * draws a popup is reported where it lives). A module met again while its own walk is still open
   * (an import cycle) adds nothing new.
   */
  type Reach = { source: boolean; gesture: boolean };
  const reachCache = new Map<string, Reach>();
  const open = new Set<string>();
  const reach = (file: string): Reach => {
    const cached = reachCache.get(file);
    if (cached) return cached;
    const out: Reach = { source: false, gesture: false };
    if (open.has(file)) return out;
    open.add(file);
    for (const d of importsOf(file)) {
      if (!isLogicModule(d)) continue;
      const sub = reach(d);
      out.source ||= isSource(d) || sub.source;
      out.gesture ||= signalsOf(d).has("endsGesture") || sub.gesture;
    }
    open.delete(file);
    reachCache.set(file, out);
    return out;
  };
  /** Does `file` render a component (one level) that draws something positioned? */
  const drawsThroughChild = (file: string) =>
    importsOf(file).some((d) => !isLogicModule(d) && signalsOf(d).has("positions"));

  for (const file of sources) {
    if (ALLOW[file]) continue;
    const text = textOf(file);
    if (text === null) continue;
    const lines = text.split("\n");

    if (!CANONICAL.has(file)) {
      // THE FEATURE: this file with the helpers and hooks it reaches (helper → hook → bar is one
      // popup) and, one level, the component it renders to draw the bar (parent + child split).
      const own = signalsOf(file);
      const r = reach(file);
      const hasSource = isSource(file) || r.source;
      const hasGesture = own.has("endsGesture") || r.gesture;
      const draws = own.has("positions") || (own.has("endsGesture") && drawsThroughChild(file));
      if (hasSource && hasGesture && draws) {
        const at = lines.findIndex((l) => BEHAVIOUR.readsSelection.test(l) || BEHAVIOUR.endsGesture.test(l));
        findings.push({ file, rule: "selection-driven-floating-ui", line: at + 1 });
      }
    }
    for (const rule of RULES) {
      if (rule.allowCanonical && CANONICAL.has(file)) continue;
      if (rule.alsoNeeds && !rule.alsoNeeds.test(text)) continue;
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
    const { scratch, files } = plantSecondToolbars();
    const findings = censusSelectionToolbars(scratch, files);
    expect([...new Set(findings.map((f) => f.rule))].sort()).toEqual([
      "package-selection-layout",
      "selection-driven-floating-ui",
      "selection-popup-component",
      "selectionchange-listener",
      "tiptap-bubble-menu",
    ]);
  });

  it("rule 5 catches every realistic selection-popup shape, and nothing that draws nothing", () => {
    const { scratch, files } = plantSecondToolbars();
    const byBehaviour = censusSelectionToolbars(scratch, files)
      .filter((f) => f.rule === "selection-driven-floating-ui")
      .map((f) => f.file)
      .sort();
    expect(byBehaviour).toEqual([...BEHAVIOUR_PLANTS].sort());
  });
});

/**
 * The five realistic second-popup shapes (verify round 1 finding 2 + the round-2 prep), each a
 * file the census must name, plus two that are NOT popups and must stay unnamed.
 */
export const BEHAVIOUR_PLANTS = [
  "features/chat/AnswerQuoteBar.tsx", // mouseup + getSelection, portaled fixed bar
  "features/chat/QuoteBar.tsx", // the component half of a hook + component split
  "features/notes/PassagePopover.tsx", // a Radix Popover anchored to the selection rect, no portal, no fixed
  "features/docs/LineMarks.tsx", // getClientRects + an absolute class
  "features/chat/InlineAskBar.tsx", // an inline onMouseUp bar with an absolute class
  "features/docs/SelectionChip.tsx", // two imports deep: helper (reads + measures) → hook (mouseup) → bar
] as const;

export function plantSecondToolbars(): { scratch: string; files: string[] } {
  const scratch = mkdtempSync(join(tmpdir(), "selection-census-"));
  const files: string[] = [];
  const plant = (file: string, body: string | string[]) => {
    mkdirSync(dirname(join(scratch, file)), { recursive: true });
    writeFileSync(join(scratch, file), Array.isArray(body) ? body.join("\n") : body);
    files.push(file);
  };
  // Rules 1–4 (names, the Tiptap import, the package layout, a selectionchange listener that floats UI).
  plant("features/notes/NoteSelectionPopover.tsx", "export function NoteSelectionPopover() { return null; }\n");
  plant("features/chat/AnswerBubble.tsx", 'import { BubbleMenu } from "@tiptap/react/menus";\n');
  plant("features/docs/Listen.tsx", [
    'document.addEventListener("selectionchange", () => {});',
    'export const Bar = () => <div className="absolute">Quote</div>;',
  ]);
  plant("features/docs/Layout.tsx", 'import { SelectionToolbar } from "@ai-matrx/alchemy/react/selection";\n');
  // Rule 5, shape 1: the verifier's mouseup + getSelection bar portaled to the body, named innocently.
  plant("features/chat/AnswerQuoteBar.tsx", [
    'import { createPortal } from "react-dom";',
    "export function AnswerQuoteBar() {",
    '  document.addEventListener("mouseup", () => {',
    "    const r = window.getSelection()?.getRangeAt(0).getBoundingClientRect();",
    "    void r;",
    "  });",
    '  return createPortal(<div className="fixed z-50">Quote · Highlight</div>, document.body);',
    "}",
  ]);
  // Shape 2: a hook reads and measures; the component that uses it draws. One feature.
  plant("features/chat/useQuoteSelection.ts", [
    'import { useEffect } from "react";',
    "export function useQuoteSelection(set: (r: DOMRect | null) => void) {",
    "  useEffect(() => {",
    "    const up = () => set(window.getSelection()?.getRangeAt(0).getBoundingClientRect() ?? null);",
    '    document.addEventListener("mouseup", up);',
    '    return () => document.removeEventListener("mouseup", up);',
    "  }, [set]);",
    "}",
  ]);
  plant("features/chat/QuoteBar.tsx", [
    'import { useState } from "react";',
    'import { useQuoteSelection } from "./useQuoteSelection";',
    "export function QuoteBar() {",
    "  const [r, set] = useState<DOMRect | null>(null);",
    "  useQuoteSelection(set);",
    '  return r ? <div className="absolute z-50" style={{ top: r.top }}>Quote</div> : null;',
    "}",
  ]);
  // Shape 3: a Radix Popover anchored to the selection rect through a virtual reference.
  plant("features/notes/PassagePopover.tsx", [
    'import { useState } from "react";',
    'import { Popover, PopoverAnchor, PopoverContent } from "@/components/ui/popover";',
    "export function PassagePopover() {",
    "  const [anchor, setAnchor] = useState<{ getBoundingClientRect: () => DOMRect } | null>(null);",
    "  const onMouseUp = () => {",
    "    const rect = window.getSelection()?.getRangeAt(0).getBoundingClientRect();",
    "    if (rect) setAnchor({ getBoundingClientRect: () => rect });",
    "  };",
    "  return (",
    "    <div onMouseUp={onMouseUp}>",
    "      <Popover open={!!anchor}>",
    "        <PopoverAnchor virtualRef={{ current: anchor }} />",
    "        <PopoverContent>Explain this</PopoverContent>",
    "      </Popover>",
    "    </div>",
    "  );",
    "}",
  ]);
  // Shape 4: per-line rects of the selection, marks drawn with an absolute class.
  plant("features/docs/LineMarks.tsx", [
    "export function LineMarks() {",
    '  document.addEventListener("pointerup", () => {',
    "    const rects = window.getSelection()?.getRangeAt(0).getClientRects();",
    "    void rects;",
    "  });",
    '  return <span className="absolute bg-yellow-200" />;',
    "}",
  ]);
  // Shape 5: an inline onMouseUp handler and an absolute bar in the same component.
  plant("features/chat/InlineAskBar.tsx", [
    'import { useState } from "react";',
    "export function InlineAskBar({ children }: { children: React.ReactNode }) {",
    "  const [box, setBox] = useState<DOMRect | null>(null);",
    "  return (",
    "    <article",
    "      onMouseUp={() => {",
    "        const sel = window.getSelection();",
    "        setBox(sel && sel.rangeCount ? sel.getRangeAt(0).getBoundingClientRect() : null);",
    "      }}",
    "    >",
    "      {children}",
    '      {box && <div className="absolute rounded bg-card" style={{ left: box.left, top: box.top }}>Ask AI</div>}',
    "    </article>",
    "  );",
    "}",
  ]);
  // Shape 6: the selection is read two imports away from the bar that draws it.
  plant("features/docs/selectionRect.ts", [
    "export const selectionRect = () => window.getSelection()?.getRangeAt(0).getBoundingClientRect() ?? null;",
  ]);
  plant("features/docs/useSelectionRect.ts", [
    'import { useEffect, useState } from "react";',
    'import { selectionRect } from "./selectionRect";',
    "export function useSelectionRect() {",
    "  const [rect, setRect] = useState<DOMRect | null>(null);",
    "  useEffect(() => {",
    "    const up = () => setRect(selectionRect());",
    '    document.addEventListener("mouseup", up);',
    '    return () => document.removeEventListener("mouseup", up);',
    "  }, []);",
    "  return rect;",
    "}",
  ]);
  plant("features/docs/SelectionChip.tsx", [
    'import { useSelectionRect } from "./useSelectionRect";',
    "export function SelectionChip() {",
    "  const rect = useSelectionRect();",
    '  return rect ? <button className="absolute" style={{ top: rect.bottom }}>Define</button> : null;',
    "}",
  ]);
  // NOT popups: a caret guard (MergeFieldInput's shape) and a toolbar HOST importing the one toolbar.
  plant(
    "features/docs/CaretGuard.tsx",
    'document.addEventListener("selectionchange", () => { const s = window.getSelection(); s?.removeAllRanges(); });\n',
  );
  plant("features/docs/ReaderHost.tsx", [
    'import { useSelectionZone } from "@/components/selection-toolbar/selection-zones";',
    'export const ReaderHost = () => <div className="absolute" onMouseUp={() => void useSelectionZone} />;',
  ]);
  return { scratch, files };
}
