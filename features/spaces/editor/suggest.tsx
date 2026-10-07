"use client";

// features/spaces/editor/suggest.tsx — Notion's "Suggest edits" (N3).
//
// A person in suggest mode never changes the page's text directly: what they type is kept as an INSERT
// suggestion (underlined in their name), and what they delete stays in place as a DELETE suggestion
// (struck through). Each run carries the stored span mark `suggestion: { id, kind, by, at }`
// (lib/spaces-blocks RichSpan) — a BlockNote string style here, a ProseMirror mark underneath, so the live
// room (Yjs) carries it like any other mark. Clicking a suggestion opens its card: Accept / Reject, for
// anyone who can edit the page (the owner or an editor). Suggest mode is this person's own view switch on
// this page (kept on this device), never a permission.

import { createExtension } from "@blocknote/core";
import { createReactStyleSpec } from "@blocknote/react";
import { Plugin, PluginKey, TextSelection, type EditorState, type Transaction } from "@tiptap/pm/state";
import { ReplaceStep } from "@tiptap/pm/transform";
import type { Mark, MarkType, Node as PmNode, Slice } from "@tiptap/pm/model";
import type { EditorView } from "@tiptap/pm/view";
import { Check, X } from "lucide-react";
import { useEffect, useState, useSyncExternalStore } from "react";

import type { SpaceSuggestion } from "@/lib/spaces-blocks/types";

// ── who is suggesting (per page, this device) ────────────────────────────────────────────────────────
const KEY = (pageId: string) => `spaces:suggesting:${pageId}`;
const listeners = new Set<() => void>();
let me: string | null = null;
let current: string | null = null;

/** The signed-in person's id, the author of their suggestions. */
export function setSuggestAuthor(userId: string | null): void {
  me = userId;
}
/** The page the open editor shows (suggest mode is per page). */
export function setSuggestPage(pageId: string | null): void {
  current = pageId;
  for (const l of listeners) l();
}
export function isSuggesting(pageId: string | null = current): boolean {
  if (!pageId || typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(KEY(pageId)) === "1";
  } catch {
    return false;
  }
}
export function setSuggesting(pageId: string, on: boolean): void {
  try {
    if (on) window.localStorage.setItem(KEY(pageId), "1");
    else window.localStorage.removeItem(KEY(pageId));
  } catch {
    // view state only
  }
  for (const l of listeners) l();
}
export function useSuggesting(pageId: string | null): boolean {
  return useSyncExternalStore(
    (l) => {
      listeners.add(l);
      return () => listeners.delete(l);
    },
    () => isSuggesting(pageId),
    () => false,
  );
}

export const readSuggestion = (raw: unknown): SpaceSuggestion | null => {
  if (typeof raw !== "string" || !raw) return null;
  try {
    const v = JSON.parse(raw) as SpaceSuggestion;
    return v && (v.kind === "insert" || v.kind === "delete") && v.id && v.by && v.at ? v : null;
  } catch {
    return null;
  }
};

// ── the style (a ProseMirror mark named "suggestion", attr stringValue = the JSON) ────────────────────
export const SuggestionStyle = createReactStyleSpec(
  { type: "suggestion", propSchema: "string" },
  {
    render: ({ value, contentRef }) => {
      const s = readSuggestion(value);
      return <span ref={contentRef} className="spaces-suggestion" data-suggestion-kind={s?.kind} data-suggestion-id={s?.id} data-suggestion={value ?? ""} />;
    },
  },
);

// ── suggest mode: user edits become marks ─────────────────────────────────────────────────────────────
const SKIP = "spacesSuggestSkip";
const key = new PluginKey("spacesSuggest");

function suggestionOf(marks: readonly Mark[], type: MarkType): SpaceSuggestion | null {
  const m = marks.find((x) => x.type === type);
  return m ? readSuggestion(m.attrs.stringValue) : null;
}

/** One user change (a single text replace inside one block) rewritten as suggestions; anything else passes. */
function rewrite(state: EditorState, tr: Transaction, type: MarkType): Transaction | null {
  const by = me;
  if (!by || tr.steps.length !== 1 || !(tr.steps[0] instanceof ReplaceStep)) return null;
  const step = tr.steps[0] as unknown as { from: number; to: number; slice: Slice };
  const { from, to, slice } = step;
  const a = state.doc.resolve(from);
  const b = state.doc.resolve(to);
  if (!a.sameParent(b) || !a.parent.isTextblock || slice.openStart || slice.openEnd) return null;
  let inlineOnly = true;
  slice.content.forEach((n) => {
    if (!n.isInline) inlineOnly = false;
  });
  if (!inlineOnly) return null;
  const out = state.tr;
  const stamp = new Date().toISOString();
  const id = crypto.randomUUID();
  const mark = (kind: "insert" | "delete"): Mark => type.create({ stringValue: JSON.stringify({ id, kind, by, at: stamp } satisfies SpaceSuggestion) });
  // Deleted text: my own pending insert really goes; anything else stays, marked for deletion.
  const own: Array<[number, number]> = [];
  if (to > from) {
    state.doc.nodesBetween(from, to, (node, at) => {
      if (!node.isText) return true;
      const s = suggestionOf(node.marks, type);
      const lo = Math.max(at, from);
      const hi = Math.min(at + node.nodeSize, to);
      if (s?.kind === "insert" && s.by === by) own.push([lo, hi]);
      else if (s?.kind !== "delete") out.addMark(lo, hi, mark("delete"));
      return false;
    });
    for (const [lo, hi] of [...own].reverse()) out.delete(lo, hi);
  }
  const backwards = state.selection.empty && state.selection.from === to && to > from && !slice.content.size;
  let caret = backwards ? out.mapping.map(from, -1) : out.mapping.map(to, 1);
  if (slice.content.size) {
    const at = out.mapping.map(to, 1);
    out.insert(at, slice.content);
    out.addMark(at, at + slice.content.size, mark("insert"));
    caret = at + slice.content.size;
  }
  out.setSelection(TextSelection.create(out.doc, Math.min(caret, out.doc.content.size)));
  out.setMeta(SKIP, true);
  return out;
}

export const suggestMode = createExtension(() => ({
  key: "spacesSuggestMode",
  prosemirrorPlugins: [
    new Plugin({
      key,
      view(view: EditorView) {
        (key as unknown as { view?: EditorView }).view = view;
        return {};
      },
      filterTransaction(tr, state) {
        if (!tr.docChanged || tr.getMeta(SKIP) || !isSuggesting() || !me) return true;
        // Changes from the live room and from undo pass; only this person's own edits are rewritten.
        if (tr.getMeta("y-sync$") || tr.getMeta("addToHistory") === false) return true;
        const type = state.schema.marks.suggestion;
        const view = (key as unknown as { view?: EditorView }).view;
        if (!type || !view) return true;
        const next = rewrite(state, tr, type);
        if (!next) return true;
        queueMicrotask(() => view.dispatch(next));
        return false;
      },
    }),
  ],
}));

// ── accept / reject ───────────────────────────────────────────────────────────────────────────────────
/** Every text range of one suggestion, in document order. */
function rangesOf(doc: PmNode, type: MarkType, id: string): Array<{ from: number; to: number; s: SpaceSuggestion }> {
  const out: Array<{ from: number; to: number; s: SpaceSuggestion }> = [];
  doc.descendants((node, pos) => {
    if (!node.isText) return true;
    const s = suggestionOf(node.marks, type);
    if (s?.id === id) out.push({ from: pos, to: pos + node.nodeSize, s });
    return false;
  });
  return out;
}

/** Accept or reject one suggestion (both its insert and delete runs). */
export function resolveSuggestion(view: EditorView, id: string, accept: boolean): void {
  const type = view.state.schema.marks.suggestion;
  if (!type) return;
  const tr = view.state.tr;
  for (const r of rangesOf(view.state.doc, type, id).reverse()) {
    const goes = (r.s.kind === "insert") !== accept; // reject insert, accept delete
    if (goes) tr.delete(r.from, r.to);
    else tr.removeMark(r.from, r.to, type);
  }
  tr.setMeta(SKIP, true);
  view.dispatch(tr);
}

const names = new Map<string, string>();
/** A person's name for suggestion cards (the page registers the signed-in person; others read "Someone"). */
export function setSuggestName(userId: string, name: string): void {
  names.set(userId, name);
}

/** The card of the suggestion under a click: who, what, Accept / Reject (editors only). */
export function SuggestionCard({ getView, canResolve }: { getView: () => EditorView | null; canResolve: boolean }) {
  const [open, setOpen] = useState<{ s: SpaceSuggestion; left: number; top: number } | null>(null);
  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      const view = getView();
      const target = e.target as HTMLElement | null;
      if (!view || !target || !view.dom.contains(target)) return;
      const el = target.closest("[data-suggestion-id]") as HTMLElement | null;
      if (!el) return setOpen(null);
      const s = readSuggestion(el.getAttribute("data-suggestion"));
      if (!s) return;
      const r = el.getBoundingClientRect();
      setOpen({ s, left: r.left, top: r.bottom + 6 });
    };
    document.addEventListener("click", onClick, true);
    return () => document.removeEventListener("click", onClick, true);
  }, [getView]);
  const view = getView();
  if (!open || !view) return null;
  const done = (accept: boolean) => {
    resolveSuggestion(view, open.s.id, accept);
    setOpen(null);
  };
  return (
    <div className="spaces-suggestion-card" style={{ left: open.left, top: open.top }} data-testid="spaces-suggestion-card" role="dialog" aria-label="Suggestion">
      <div className="spaces-suggestion-who">
        <span>{open.s.by === me ? "You" : (names.get(open.s.by) ?? "Someone")}</span>
        <span className="spaces-suggestion-kind">{open.s.kind === "insert" ? "Add" : "Delete"}</span>
      </div>
      {canResolve ? (
        <div className="spaces-suggestion-actions">
          <button type="button" aria-label="Accept suggestion" onClick={() => done(true)}>
            <Check size={14} strokeWidth={2} />
          </button>
          <button type="button" aria-label="Reject suggestion" onClick={() => done(false)}>
            <X size={14} strokeWidth={2} />
          </button>
        </div>
      ) : null}
    </div>
  );
}
