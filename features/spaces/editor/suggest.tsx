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

import { createExtension, createStyleSpec } from "@blocknote/core";
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
// A plain DOM mark (not a React mark view): a React-drawn mark re-mounts as text is typed into it, which loses the caret.
export const SuggestionStyle = createStyleSpec(
  { type: "suggestion", propSchema: "string" },
  {
    render: (value) => {
      const s = readSuggestion(value);
      const dom = document.createElement("span");
      dom.className = "spaces-suggestion";
      if (s) {
        dom.dataset.suggestionKind = s.kind;
        dom.dataset.suggestionId = s.id;
      }
      dom.dataset.suggestion = value ?? "";
      return { dom, contentDOM: dom };
    },
    parse: (el) => el.getAttribute("data-suggestion") || undefined,
  },
);

// ── suggest mode: user edits become marks ─────────────────────────────────────────────────────────────
const SKIP = "spacesSuggestSkip";
const key = new PluginKey("spacesSuggest");

function suggestionOf(marks: readonly Mark[], type: MarkType): SpaceSuggestion | null {
  const m = marks.find((x) => x.type === type);
  return m ? readSuggestion(m.attrs.stringValue) : null;
}

const markFor = (type: MarkType, kind: "insert" | "delete", by: string, id = crypto.randomUUID()): Mark =>
  type.create({ stringValue: JSON.stringify({ id, kind, by, at: new Date().toISOString() } satisfies SpaceSuggestion) });

/** My own insert suggestion right before `pos` (typing on continues the same suggestion). */
function myInsertBefore(state: EditorState, pos: number, type: MarkType, by: string): Mark | null {
  const $p = state.doc.resolve(pos);
  const before = $p.nodeBefore;
  const m = before?.isText ? before.marks.find((x) => x.type === type) : undefined;
  const s = m ? readSuggestion(m.attrs.stringValue) : null;
  return m && s?.kind === "insert" && s.by === by ? m : null;
}

/** Mark [from, to) for deletion (my own pending inserts inside it really go); returns the transaction. */
function markDeleted(state: EditorState, from: number, to: number, type: MarkType, by: string): Transaction {
  const tr = state.tr;
  const own: Array<[number, number]> = [];
  const del = markFor(type, "delete", by);
  state.doc.nodesBetween(from, to, (node, at) => {
    if (!node.isText) return true;
    const s = suggestionOf(node.marks, type);
    const lo = Math.max(at, from);
    const hi = Math.min(at + node.nodeSize, to);
    if (s?.kind === "insert" && s.by === by) own.push([lo, hi]);
    else if (s?.kind !== "delete") tr.addMark(lo, hi, del);
    return false;
  });
  for (const [lo, hi] of own.reverse()) tr.delete(lo, hi);
  tr.setMeta(SKIP, true);
  return tr;
}

export const suggestMode = createExtension(() => ({
  key: "spacesSuggestMode",
  prosemirrorPlugins: [
    new Plugin({
      key,
      props: {
        // Backspace / Delete in suggest mode strike the text instead of removing it.
        handleKeyDown(view, event) {
          if (!isSuggesting() || !me || (event.key !== "Backspace" && event.key !== "Delete")) return false;
          if (event.metaKey || event.ctrlKey || event.altKey) return false;
          const type = view.state.schema.marks.suggestion;
          const { from, to, empty, $from } = view.state.selection;
          if (!type || !$from.parent.isTextblock) return false;
          let a = from;
          let b = to;
          if (empty) {
            if (event.key === "Backspace") {
              if ($from.parentOffset === 0) return false;
              a = from - 1;
            } else {
              if ($from.parentOffset === $from.parent.content.size) return false;
              b = to + 1;
            }
          } else if (!view.state.doc.resolve(b).sameParent($from)) return false;
          const tr = markDeleted(view.state, a, b, type, me);
          const caret = event.key === "Backspace" ? tr.mapping.map(a, -1) : tr.mapping.map(b, 1);
          tr.setSelection(TextSelection.create(tr.doc, caret));
          view.dispatch(tr);
          return true;
        },
        // Typing over a selection: the selection is struck and the new text is an insert suggestion.
        handleTextInput(view, from, to, text) {
          if (!isSuggesting() || !me || from === to) return false;
          const type = view.state.schema.marks.suggestion;
          if (!type || !view.state.doc.resolve(from).sameParent(view.state.doc.resolve(to))) return false;
          const tr = markDeleted(view.state, from, to, type, me);
          const at = tr.mapping.map(to, 1);
          tr.insert(at, view.state.schema.text(text, [markFor(type, "insert", me)]));
          tr.setSelection(TextSelection.create(tr.doc, at + text.length));
          view.dispatch(tr);
          return true;
        },
      },
      // Anything this person inserts in suggest mode carries an insert suggestion.
      appendTransaction(trs, oldState, newState) {
        if (!isSuggesting() || !me) return null;
        const type = newState.schema.marks.suggestion;
        if (!type) return null;
        const mine = trs.filter((t) => t.docChanged && !t.getMeta(SKIP) && !t.getMeta("y-sync$") && t.getMeta("addToHistory") !== false);
        if (!mine.length) return null;
        const ranges: Array<[number, number]> = [];
        for (const t of mine) {
          // Map every inserted range to the final document.
          const idx = trs.indexOf(t);
          t.steps.forEach((step, i) => {
            if (!(step instanceof ReplaceStep)) return;
            const { from, slice } = step as unknown as { from: number; slice: Slice };
            if (!slice.content.size) return;
            let lo = from;
            let hi = from + slice.content.size;
            for (let j = i + 1; j < t.steps.length; j++) {
              const m = t.mapping.maps[j];
              lo = m.map(lo, 1);
              hi = m.map(hi, -1);
            }
            for (let k = idx + 1; k < trs.length; k++) {
              lo = trs[k].mapping.map(lo, 1);
              hi = trs[k].mapping.map(hi, -1);
            }
            if (hi > lo) ranges.push([lo, hi]);
          });
        }
        if (!ranges.length) return null;
        const out = newState.tr;
        for (const [lo, hi] of ranges) {
          const $lo = newState.doc.resolve(lo);
          // Text inside one block only; new blocks (Enter) pass unmarked.
          if (!$lo.parent.isTextblock || !$lo.sameParent(newState.doc.resolve(hi))) continue;
          const keep = myInsertBefore(newState, lo, type, me);
          out.removeMark(lo, hi, type);
          out.addMark(lo, hi, keep ?? markFor(type, "insert", me));
        }
        if (!out.docChanged) return null;
        out.setMeta(SKIP, true);
        void oldState;
        return out;
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
