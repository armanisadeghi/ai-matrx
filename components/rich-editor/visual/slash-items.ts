// components/rich-editor/visual/slash-items.ts
//
// The "/" menu — Notion's insert-anything menu over THIS editor's verbs
// (core/commands.ts). Every entry writes exactly the markdown a person would
// type by hand; islands open in their own editor at once.

import type { Editor } from "@tiptap/core";
import {
  AlertTriangle,
  Braces,
  CheckSquare,
  Code,
  FileText,
  Footprints,
  Heading1,
  Heading2,
  Heading3,
  ImagePlus,
  Info,
  Lightbulb,
  List,
  ListOrdered,
  Minus,
  Quote,
  SeparatorHorizontal,
  Shapes,
  Sigma,
  Table,
  type LucideIcon,
} from "lucide-react";
import {
  insertCodeBlock,
  insertFootnote,
  insertInlineMath,
  insertIsland,
  insertMathBlock,
  insertPageBreak,
  setCallout,
  toggleTaskList,
  type CalloutType,
} from "../core/commands";
import { markAutoEdit } from "./auto-edit";

export interface SlashHost {
  pickKind: () => Promise<string | null>;
  pickImage: () => void;
}

export interface SlashItem {
  id: string;
  title: string;
  description: string;
  group: string;
  icon: LucideIcon;
  keywords: string[];
  run: (editor: Editor, host: SlashHost) => void;
}

const callout = (type: CalloutType, icon: LucideIcon, title: string): SlashItem => ({
  id: `callout-${type.toLowerCase()}`,
  title,
  description: `${/^[aeiou]/i.test(title) ? "An" : "A"} ${title.toLowerCase()} callout (> [!${type}])`,
  group: "Callouts",
  icon,
  keywords: ["callout", "admonition", "alert", type.toLowerCase()],
  run: (editor) => {
    setCallout(editor, type);
  },
});

export const SLASH_ITEMS: readonly SlashItem[] = [
  { id: "text", title: "Text", description: "Plain paragraph", group: "Basic", icon: FileText, keywords: ["paragraph", "normal"], run: (e) => void e.chain().focus().setParagraph().run() },
  { id: "h1", title: "Heading 1", description: "Big section heading", group: "Basic", icon: Heading1, keywords: ["title", "#"], run: (e) => void e.chain().focus().setHeading({ level: 1 }).run() },
  { id: "h2", title: "Heading 2", description: "Medium section heading", group: "Basic", icon: Heading2, keywords: ["subtitle", "##"], run: (e) => void e.chain().focus().setHeading({ level: 2 }).run() },
  { id: "h3", title: "Heading 3", description: "Small section heading", group: "Basic", icon: Heading3, keywords: ["###"], run: (e) => void e.chain().focus().setHeading({ level: 3 }).run() },
  { id: "bullets", title: "Bulleted list", description: "A simple list", group: "Basic", icon: List, keywords: ["ul", "unordered", "-"], run: (e) => void e.chain().focus().toggleBulletList().run() },
  { id: "numbers", title: "Numbered list", description: "Steps in order", group: "Basic", icon: ListOrdered, keywords: ["ol", "ordered", "1."], run: (e) => void e.chain().focus().toggleOrderedList().run() },
  { id: "todo", title: "Checklist", description: "Tasks with checkboxes", group: "Basic", icon: CheckSquare, keywords: ["task", "todo", "checkbox", "[ ]"], run: (e) => void toggleTaskList(e) },
  { id: "quote", title: "Quote", description: "A quoted passage", group: "Basic", icon: Quote, keywords: ["blockquote", ">"], run: (e) => void e.chain().focus().toggleBlockquote().run() },
  { id: "table", title: "Table", description: "Rows and columns", group: "Basic", icon: Table, keywords: ["grid", "columns"], run: (e) => void e.chain().focus().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run() },
  { id: "divider", title: "Divider", description: "A horizontal rule", group: "Basic", icon: Minus, keywords: ["hr", "rule", "line", "---"], run: (e) => void e.chain().focus().setHorizontalRule().run() },
  callout("NOTE", Info, "Note"),
  callout("TIP", Lightbulb, "Tip"),
  callout("IMPORTANT", Info, "Important"),
  callout("WARNING", AlertTriangle, "Warning"),
  callout("CAUTION", AlertTriangle, "Caution"),
  {
    id: "code",
    title: "Code block",
    description: "Code with a language",
    group: "Insert",
    icon: Code,
    keywords: ["```", "snippet", "program"],
    run: (e) => markAutoEdit(e, insertCodeBlock(e)),
  },
  {
    id: "equation",
    title: "Equation",
    description: "Display math ($$…$$) with live preview",
    group: "Insert",
    icon: Sigma,
    keywords: ["math", "latex", "katex", "formula", "$$"],
    run: (e) => markAutoEdit(e, insertMathBlock(e)),
  },
  {
    id: "inline-equation",
    title: "Inline equation",
    description: "Math inside a sentence ($…$)",
    group: "Insert",
    icon: Sigma,
    keywords: ["math", "inline", "latex", "$"],
    run: (e) => void insertInlineMath(e, "x"),
  },
  {
    id: "variable",
    title: "Variable",
    description: "A {{variable}} filled in at run time",
    group: "Insert",
    icon: Braces,
    keywords: ["{{", "placeholder", "field", "input"],
    run: (e) => void e.chain().focus().insertContent("{{").run(),
  },
  {
    id: "kind",
    title: "Structured block",
    description: "A kind from the shape registry",
    group: "Insert",
    icon: Shapes,
    keywords: ["kind", "shape", "component", "json", "block"],
    run: (e, host) => {
      void host.pickKind().then((raw) => {
        if (raw) insertIsland(e, raw, "json");
      });
    },
  },
  {
    id: "image",
    title: "Image",
    description: "Upload a picture",
    group: "Insert",
    icon: ImagePlus,
    keywords: ["picture", "photo", "upload", "img"],
    run: (_e, host) => host.pickImage(),
  },
  {
    id: "footnote",
    title: "Footnote",
    description: "A numbered note at the end",
    group: "Insert",
    icon: Footprints,
    keywords: ["reference", "note", "[^1]"],
    run: (e) => void insertFootnote(e),
  },
  {
    id: "page-break",
    title: "Page break",
    description: "Start a new page when printed",
    group: "Insert",
    icon: SeparatorHorizontal,
    keywords: ["print", "pdf", "new page", "pagebreak"],
    run: (e) => void insertPageBreak(e),
  },
];

/** Filter by title and keywords, best matches first. */
export function filterSlashItems(query: string): SlashItem[] {
  const q = query.trim().toLowerCase();
  if (!q) return [...SLASH_ITEMS];
  const scored = SLASH_ITEMS.map((item) => {
    const title = item.title.toLowerCase();
    const score = title.startsWith(q)
      ? 3
      : title.includes(q)
        ? 2
        : item.keywords.some((keyword) => keyword.toLowerCase().includes(q))
          ? 1
          : 0;
    return { item, score };
  }).filter((entry) => entry.score > 0);
  scored.sort((a, b) => b.score - a.score);
  return scored.map((entry) => entry.item);
}
