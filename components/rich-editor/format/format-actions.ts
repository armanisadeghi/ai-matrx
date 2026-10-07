// components/rich-editor/format/format-actions.ts
//
// THE formatting actions of the ONE selection toolbar — bold, italic, strike,
// inline code, link, H1–H3, lists, quote, code block — for EVERY engine:
// Source (CodeMirror) and every textarea through their `markdownFormat` zone
// half, and the visual editor (Tiptap) through the resolver it registers when
// its chunk loads. This module carries no Tiptap, and the toolbar root imports
// it, so the buttons exist even where the visual editor never loads (notes
// Plain and Split — 2026-10-05 live walk: they showed no formatting at all).

import type { Action, ActionProvider, ClickTarget } from "@ai-matrx/alchemy/actions";
import {
  Bold,
  Code,
  Heading1,
  Heading2,
  Heading3,
  Italic,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  Quote,
  SquareCode,
  Strikethrough,
  type LucideIcon,
} from "lucide-react";
import { registerAlchemyIcon } from "@ai-matrx/rich-content/utils/alchemy-icon-keys";
import { declareSelectionProvider, hostHalf, placeSelectionActions, shownInSelectionMode } from "@ai-matrx/rich-content/selection-toolbar/selection-actions";
import type { FormatCommandId } from "../core/markdown-format";
import { MARKDOWN_FORMAT_HOST_KEY, type FormatTarget, type MarkdownFormatHost } from "./format-target";

type VisualResolver = (target: ClickTarget) => FormatTarget | null;
let visualResolver: VisualResolver | null = null;

/** The visual editor registers how its zone half becomes a FormatTarget (on load). */
export function registerVisualFormatResolver(resolver: VisualResolver): void {
  visualResolver = resolver;
}

/** THE active editor as a FormatTarget, whatever its engine. */
export function formatTargetOf(target: ClickTarget): FormatTarget | null {
  const visual = visualResolver?.(target) ?? null;
  if (visual) return visual;
  const text = hostHalf<MarkdownFormatHost>(target, MARKDOWN_FORMAT_HOST_KEY);
  return text?.kind === "markdown-format" ? text.target : null;
}

interface FormatSpec {
  /** The action id suffix (`selection:format-<id>`), stable since 2026-09-26. */
  id: string;
  command: FormatCommandId;
  label: string;
  icon: LucideIcon;
  /** Lives under More so the strip stays short. */
  more?: boolean;
}

/** One list, every engine. Labels carry the chord the keyboard runs. */
const FORMATS: FormatSpec[] = [
  { id: "bold", command: "bold", label: "Bold (⌘B)", icon: Bold },
  { id: "italic", command: "italic", label: "Italic (⌘I)", icon: Italic },
  { id: "strike", command: "strike", label: "Strikethrough (⌘⇧X)", icon: Strikethrough },
  { id: "code", command: "code", label: "Inline code (⌘E)", icon: Code },
  { id: "link", command: "link", label: "Link (⌘K)", icon: Link2 },
  { id: "h1", command: "heading1", label: "Heading 1", icon: Heading1 },
  { id: "h2", command: "heading2", label: "Heading 2", icon: Heading2 },
  { id: "h3", command: "heading3", label: "Heading 3", icon: Heading3, more: true },
  { id: "quote", command: "quote", label: "Quote", icon: Quote },
  { id: "list", command: "bulletList", label: "Bulleted list (⌘⇧8)", icon: List },
  { id: "numbered", command: "orderedList", label: "Numbered list (⌘⇧7)", icon: ListOrdered, more: true },
  { id: "tasks", command: "taskList", label: "Checklist (⌘⇧9)", icon: ListChecks, more: true },
  { id: "codeblock", command: "codeBlock", label: "Code block", icon: SquareCode, more: true },
];

const ACTIONS: Action[] = FORMATS.map((spec, index) => {
  const id = `selection:format-${spec.id}`;
  return {
    id,
    label: spec.label,
    icon: registerAlchemyIcon(spec.icon),
    category: "edit",
    order: index,
    placement: spec.more ? "overflow" : "primary",
    preserveSelection: true,
    eligible: (t) => {
      const fmt = formatTargetOf(t);
      if (!fmt || !shownInSelectionMode(id, t) || !fmt.canFormat()) return { status: "absent" };
      return { status: "available" };
    },
    pressed: (t: ClickTarget) => formatTargetOf(t)?.isActive(spec.command) ?? false,
    // The pressed state follows the editor (a toggle, a caret move).
    subscribe: (onChange: () => void, t: ClickTarget) => formatTargetOf(t)?.subscribe?.(onChange) ?? (() => undefined),
    run: (t) => {
      formatTargetOf(t)?.run(spec.command);
    },
  };
});

/** The formatting provider (declared on import; the toolbar root imports this module). */
export const formatProvider: ActionProvider = {
  id: "format-commands",
  tier: "T0",
  declaredIds: () => ACTIONS.map((a) => a.id),
  actions: (target) => (formatTargetOf(target) ? placeSelectionActions(ACTIONS, target) : []),
};

declareSelectionProvider(formatProvider);
