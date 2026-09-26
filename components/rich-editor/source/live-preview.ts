// components/rich-editor/source/live-preview.ts
//
// CodeMirror 6 LIVE PREVIEW — the source is the document, rendered inline
// (the Obsidian model). Nothing here changes a byte; it only decorates:
//
//   · markdown marks (#, **, *, ~~, `, link targets) hide on lines the cursor
//     is not on, and show — dimmed — where it is, so what you edit is always
//     the real source
//   · headings, quotes and code spans are styled as they read
//   · {{variables}} are chips coloured by the prompt builder's rule
//   · islands (kind JSON, XML sections, code, math, HTML) are drawn by the one
//     shared renderer when the cursor is outside them; clicking one puts the
//     cursor inside and its exact source comes back
//   · find matches are highlighted
//
// Island widgets render React through PORTALS the host collects from
// `IslandPortalRegistry`, so kinds keep the app's providers.

import { syntaxTree } from "@codemirror/language";
import { RangeSetBuilder, StateEffect, StateField, type EditorState, type Extension } from "@codemirror/state";
import {
  Decoration,
  EditorView,
  MatchDecorator,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
  type ViewUpdate,
} from "@codemirror/view";
import { tokenizeSource } from "@ai-matrx/content-ir/source";
import { classifyVariable, type DeclaredVariable, type VariableState } from "../core/variables";

// ── Island portal registry ─────────────────────────────────────────────────

export interface IslandPortal {
  element: HTMLElement;
  raw: string;
  islandType: string;
}

export class IslandPortalRegistry {
  private portals = new Map<HTMLElement, IslandPortal>();
  private listeners = new Set<() => void>();
  private snapshot: IslandPortal[] = [];

  add(portal: IslandPortal): void {
    this.portals.set(portal.element, portal);
    this.emit();
  }

  remove(element: HTMLElement): void {
    if (this.portals.delete(element)) this.emit();
  }

  subscribe = (listener: () => void): (() => void) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  getSnapshot = (): IslandPortal[] => this.snapshot;

  private emit(): void {
    this.snapshot = [...this.portals.values()];
    for (const listener of this.listeners) listener();
  }
}

class IslandWidget extends WidgetType {
  constructor(
    readonly raw: string,
    readonly islandType: string,
    readonly from: number,
    readonly registry: IslandPortalRegistry,
  ) {
    super();
  }

  override eq(other: IslandWidget): boolean {
    return other.raw === this.raw && other.islandType === this.islandType;
  }

  override toDOM(view: EditorView): HTMLElement {
    const element = document.createElement("div");
    element.className = "cm-rich-island";
    element.setAttribute("role", "button");
    element.setAttribute("aria-label", "Protected block — click to edit its source");
    element.addEventListener("mousedown", (event) => {
      event.preventDefault();
      view.dispatch({ selection: { anchor: this.from } });
      view.focus();
    });
    this.registry.add({ element, raw: this.raw, islandType: this.islandType });
    return element;
  }

  override destroy(dom: HTMLElement): void {
    this.registry.remove(dom);
  }

  override get estimatedHeight(): number {
    return 80;
  }

  override ignoreEvent(): boolean {
    return false;
  }
}

const RENDERED_ISLANDS = new Set([
  "fence",
  "json",
  "xml_region",
  "xml_attr",
  "xml_container",
  "html_block",
  "math_block",
  "tree",
  "html_comment",
]);

type SourceBlocks = ReturnType<typeof tokenizeSource>;

function islandDecorations(
  state: EditorState,
  registry: IslandPortalRegistry,
  render: boolean,
  blocks: SourceBlocks = tokenizeSource(state.doc.toString()),
): DecorationSet {
  const builder = new RangeSetBuilder<Decoration>();
  const { from: selFrom, to: selTo } = state.selection.main;
  for (const block of blocks) {
    if (block.kind !== "island" || !block.complete) continue;
    const active = selTo >= block.start && selFrom <= block.end;
    const startLine = state.doc.lineAt(block.start);
    const endLine = state.doc.lineAt(Math.max(block.start, block.end - 1));
    const whole = startLine.from === block.start && endLine.to === block.end;
    if (render && !active && whole && RENDERED_ISLANDS.has(block.islandType ?? "")) {
      builder.add(
        block.start,
        block.end,
        Decoration.replace({
          widget: new IslandWidget(block.raw, block.islandType ?? "fence", block.start, registry),
          block: true,
        }),
      );
      continue;
    }
    for (let line = startLine.number; line <= endLine.number; line += 1) {
      const at = state.doc.line(line).from;
      builder.add(at, at, Decoration.line({ class: "cm-rich-island-line" }));
    }
  }
  return builder.finish();
}

export const setIslandRendering = StateEffect.define<boolean>();
const refreshIslands = StateEffect.define<null>();

/**
 * 🚨 A LONG DOCUMENT NEVER RE-TOKENIZES PER KEYSTROKE. Tokenizing the whole
 * source on every edit cost ~20 ms per key on a 1 MB document (the Markdown
 * Studio, 2026-09-26). Past LARGE_SOURCE characters an edit MAPS the existing
 * decorations through the change (O(log n)) and the full re-tokenize runs once
 * typing pauses; below it nothing changed. A selection move re-decorates from
 * the cached tokens, never re-tokenizes.
 */
const LARGE_SOURCE = 50_000;
const REFRESH_AFTER_MS = 250;

interface IslandState {
  render: boolean;
  blocks: SourceBlocks | null; // null = stale (positions predate an edit)
  decorations: DecorationSet;
}

function islandField(registry: IslandPortalRegistry): Extension {
  const field = StateField.define<IslandState>({
    create: (state) => {
      const blocks = tokenizeSource(state.doc.toString());
      return { render: true, blocks, decorations: islandDecorations(state, registry, true, blocks) };
    },
    update: (value, tr) => {
      let render = value.render;
      let refresh = false;
      for (const effect of tr.effects) {
        if (effect.is(setIslandRendering)) render = effect.value;
        if (effect.is(refreshIslands)) refresh = true;
      }
      if (render === value.render && !refresh && !tr.docChanged && !tr.selection) return value;
      if (tr.docChanged && !refresh && tr.state.doc.length >= LARGE_SOURCE) {
        return { render, blocks: null, decorations: value.decorations.map(tr.changes) };
      }
      const blocks =
        tr.docChanged || refresh || !value.blocks ? tokenizeSource(tr.state.doc.toString()) : value.blocks;
      return { render, blocks, decorations: islandDecorations(tr.state, registry, render, blocks) };
    },
    provide: (f) => EditorView.decorations.from(f, (value) => value.decorations),
  });
  const refresher = ViewPlugin.fromClass(
    class {
      timer: ReturnType<typeof setTimeout> | null = null;
      constructor(readonly view: EditorView) {}
      update(update: ViewUpdate) {
        if (!update.docChanged || update.state.field(field).blocks) return;
        if (this.timer) clearTimeout(this.timer);
        this.timer = setTimeout(() => {
          this.timer = null;
          this.view.dispatch({ effects: refreshIslands.of(null) });
        }, REFRESH_AFTER_MS);
      }
      destroy() {
        if (this.timer) clearTimeout(this.timer);
      }
    },
  );
  return [field, refresher];
}

// ── Markdown live preview ──────────────────────────────────────────────────

const HIDDEN_MARKS = new Set(["HeaderMark", "EmphasisMark", "CodeMark", "StrikethroughMark", "LinkMark"]);
const hideMark = Decoration.replace({});
const dimMark = Decoration.mark({ class: "cm-rich-mark" });

function activeLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const first = state.doc.lineAt(range.from).number;
    const last = state.doc.lineAt(range.to).number;
    for (let line = first; line <= last; line += 1) lines.add(line);
  }
  return lines;
}

function previewDecorations(view: EditorView): DecorationSet {
  const { state } = view;
  const active = activeLines(state);
  const ranges: Array<{ from: number; to: number; deco: Decoration }> = [];
  for (const { from, to } of view.visibleRanges) {
    syntaxTree(state).iterate({
      from,
      to,
      enter: (node): boolean | undefined => {
        const name = node.name;
        if (/^ATXHeading(\d)$/.test(name)) {
          const level = name.slice(-1);
          const line = state.doc.lineAt(node.from);
          ranges.push({ from: line.from, to: line.from, deco: Decoration.line({ class: `cm-rich-h${level}` }) });
        }
        if (name === "Blockquote") {
          const first = state.doc.lineAt(node.from).number;
          const last = state.doc.lineAt(node.to).number;
          for (let line = first; line <= last; line += 1) {
            const at = state.doc.line(line).from;
            ranges.push({ from: at, to: at, deco: Decoration.line({ class: "cm-rich-quote" }) });
          }
        }
        if (name === "FencedCode" || name === "CodeBlock") return false;
        if (name === "URL" && node.node.parent?.name === "Link") {
          const line = state.doc.lineAt(node.from).number;
          if (!active.has(line)) ranges.push({ from: node.from - 1, to: node.to + 1, deco: hideMark });
          return undefined;
        }
        if (HIDDEN_MARKS.has(name)) {
          if (name === "CodeMark" && node.node.parent?.name !== "InlineCode") return undefined;
          if (name === "LinkMark" && node.node.parent?.name !== "Link") return undefined;
          const mark = state.sliceDoc(node.from, node.to);
          if (name === "LinkMark" && (mark === "(" || mark === ")")) return undefined;
          const line = state.doc.lineAt(node.from).number;
          const end = name === "HeaderMark" && state.sliceDoc(node.to, node.to + 1) === " " ? node.to + 1 : node.to;
          ranges.push({ from: node.from, to: end, deco: active.has(line) ? dimMark : hideMark });
        }
        return undefined;
      },
    });
  }
  ranges.sort((a, b) => a.from - b.from || a.to - b.to);
  const builder = new RangeSetBuilder<Decoration>();
  let lastTo = -1;
  for (const range of ranges) {
    if (range.from === range.to) {
      builder.add(range.from, range.to, range.deco);
      continue;
    }
    if (range.from < lastTo) continue;
    builder.add(range.from, range.to, range.deco);
    lastTo = range.to;
  }
  return builder.finish();
}

const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet;
    constructor(view: EditorView) {
      this.decorations = previewDecorations(view);
    }
    update(update: ViewUpdate) {
      if (update.docChanged || update.viewportChanged || update.selectionSet) {
        this.decorations = previewDecorations(update.view);
      }
    }
  },
  { decorations: (plugin) => plugin.decorations },
);

// ── {{variables}} ───────────────────────────────────────────────────────────

const VARIABLE_CLASS: Record<VariableState, string> = {
  declared: "cm-rich-var cm-rich-var-declared",
  undeclared: "cm-rich-var cm-rich-var-undeclared",
  literal: "cm-rich-var cm-rich-var-literal",
  unbound: "cm-rich-var cm-rich-var-unbound",
};

function variableHighlighter(getVariables: () => readonly DeclaredVariable[] | null): Extension {
  const matcher = new MatchDecorator({
    regexp: /\{\{[^{}\n]+\}\}/g,
    decoration: (match) => {
      const info = classifyVariable(match[0], getVariables());
      return Decoration.mark({ class: VARIABLE_CLASS[info.state], attributes: { title: info.title } });
    },
  });
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      constructor(view: EditorView) {
        this.decorations = matcher.createDeco(view);
      }
      update(update: ViewUpdate) {
        this.decorations = matcher.updateDeco(update, this.decorations);
      }
    },
    { decorations: (plugin) => plugin.decorations },
  );
}

// ── Find highlights ─────────────────────────────────────────────────────────

export const setFindHighlights = StateEffect.define<Array<{ from: number; to: number; current: boolean }>>();

const findField = StateField.define<DecorationSet>({
  create: () => Decoration.none,
  update: (value, tr) => {
    let next = value.map(tr.changes);
    for (const effect of tr.effects) {
      if (effect.is(setFindHighlights)) {
        const builder = new RangeSetBuilder<Decoration>();
        for (const range of [...effect.value].sort((a, b) => a.from - b.from)) {
          if (range.to <= range.from) continue;
          builder.add(range.from, range.to, Decoration.mark({ class: range.current ? "cm-rich-find-current" : "cm-rich-find" }));
        }
        next = builder.finish();
      }
    }
    return next;
  },
  provide: (field) => EditorView.decorations.from(field),
});

export function livePreviewExtensions(options: {
  registry: IslandPortalRegistry;
  getVariables: () => readonly DeclaredVariable[] | null;
}): Extension[] {
  return [livePreview, variableHighlighter(options.getVariables), islandField(options.registry), findField];
}
