"use client";

// Ideas for other content menus (Oct 2026) — the chat answer rules applied elsewhere: ≤ ~9 root
// rows, most-used first, big sets as pickers, no header, Delete last. Every row is an action the
// surface has today, grounded in its real menu or registry, or carries a NEW badge:
//   note        features/notes/components/note-actions/noteMenuRegistry.tsx
//   study guide features/education/study-guides (Ask a question, I don't get this, Find in this guide,
//               Key terms, Link flashcards, Refresh study guide, Edit, Rename, Move to Trash)
//   task        features/tasks/components/TaskDetailsPanel.tsx (Mark complete, Share, open full page,
//               Copy task ID → reference) + its due-date / priority / labels controls
//   document    features/documents (DocumentRecord rename, history tabs) + rich-document
//               annotations (Notes & comments) and export rows
//   source      features/sources/components/SourcesPage.tsx (Open, Archive, Restore) +
//               features/masterwork/kept-sources/useKeptSourceRowActions.tsx (Read the material,
//               Open the file, Open the original)
//   flashcard   features/flashcards/components/home/useFlashcardSetRowActions.tsx (set row)
//   user msg    chat userEditActions (Save & resubmit / Fork & resubmit), "Fork & regenerate from here"

import {
  Archive,
  BookA,
  Braces,
  CalendarDays,
  CircleHelp,
  Ellipsis,
  ExternalLink,
  FilePen,
  FileText,
  Flag,
  FlaskConical,
  FolderInput,
  GitBranch,
  GraduationCap,
  Highlighter,
  History,
  Layers,
  Library,
  Link,
  ListChecks,
  Pencil,
  RefreshCw,
  Save,
  Search,
  Share2,
  SquarePen,
  Tag,
  Trash2,
  Users,
  Webhook,
  Zap,
} from "lucide-react";
import { ItemMenu, type ItemMenuConfig, type ItemMenuEntry, type ItemMenuSection } from "@ai-matrx/design-system/item";
import { Card, TriggerButton, cmd } from "./ChatAnswerMenuProposal";

const NEW = { badge: "NEW" };
const sub = (id: string, label: string, icon: ItemMenuEntry["icon"], rows: string[], extra = {}): ItemMenuEntry =>
  ({
    id,
    label,
    icon,
    kind: "submenu",
    sections: [{ items: rows.map((r) => cmd(`${id}:${r}`, r, icon ?? Zap)) }],
    ...extra,
  }) as ItemMenuEntry;
const menu = (...sections: ItemMenuEntry[][]): ItemMenuConfig => ({
  sections: sections.map((items, i): ItemMenuSection => ({ id: String(i), items })),
});

const IDEAS: { key: string; title: string; note: string; config: ItemMenuConfig }[] = [
  {
    key: "note",
    title: "Note",
    note: "Open first; export rows fold into Alchemy.",
    config: menu(
      [
        cmd("open", "Open", ExternalLink),
        cmd("rename", "Rename", Pencil),
        cmd("share", "Share…", Share2),
        cmd("link", "Copy link…", Link, NEW),
        cmd("move", "Move to folder…", FolderInput),
        cmd("dup", "Duplicate", Layers),
      ],
      [
        cmd("kb", "Add to knowledge base", Library),
        sub("alchemy", "Alchemy…", FlaskConical, ["Export as Markdown", "Print or export as document…"]),
        cmd("agent", "Run an agent…", Webhook, NEW),
      ],
      [cmd("trash", "Move to Trash", Trash2, { tone: "destructive" })],
    ),
  },
  {
    key: "study-guide",
    title: "Study guide",
    note: "Learning verbs first, editing after.",
    config: menu(
      [
        cmd("ask", "Ask a question", CircleHelp),
        cmd("dont-get", "I don't get this", GraduationCap),
        cmd("find", "Find in this guide", Search),
        cmd("terms", "Key terms", BookA),
        cmd("link-fc", "Link flashcards", Layers),
      ],
      [
        cmd("refresh", "Refresh study guide", RefreshCw),
        cmd("edit", "Edit", SquarePen),
        cmd("rename", "Rename", Pencil),
        cmd("alchemy", "Alchemy…", FlaskConical, NEW),
      ],
      [cmd("trash", "Move to Trash", Trash2, { tone: "destructive" })],
    ),
  },
  {
    key: "task",
    title: "Task",
    note: "Complete first; due date and priority as pickers.",
    config: menu(
      [
        cmd("complete", "Mark complete", ListChecks),
        sub("due", "Due date…", CalendarDays, ["Today", "Tomorrow", "Next week", "No due date"]),
        sub("priority", "Priority…", Flag, ["High", "Medium", "Low", "None"]),
        cmd("labels", "Labels…", Tag),
      ],
      [
        cmd("open", "Open full page", ExternalLink),
        cmd("share", "Share…", Share2),
        cmd("ref", "Copy reference", Braces),
        cmd("agent", "Run an agent…", Webhook, NEW),
      ],
      [cmd("delete", "Delete", Trash2, { tone: "destructive" })],
    ),
  },
  {
    key: "document",
    title: "Document",
    note: "Notes and history surface; formats go to Alchemy.",
    config: menu(
      [
        cmd("open", "Open", ExternalLink),
        cmd("rename", "Rename", Pencil),
        cmd("notes", "Notes & comments", Highlighter),
        cmd("history", "Version history", History),
      ],
      [
        cmd("share", "Share as webpage", Share2),
        cmd("link", "Copy link…", Link, NEW),
        sub("alchemy", "Alchemy…", FlaskConical, ["Download as PDF", "Download as Word", "Print / Save PDF", "Send to Google Doc"]),
        cmd("agent", "Run an agent…", Webhook, NEW),
      ],
      [cmd("delete", "Delete", Trash2, { tone: "destructive" })],
    ),
  },
  {
    key: "source",
    title: "Source",
    note: "Reading first; Archive is its last row.",
    config: menu(
      [
        cmd("read", "Read the material", FileText),
        cmd("original", "Open the original", ExternalLink),
        cmd("file", "Open the file", FilePen),
      ],
      [
        cmd("ref", "Copy reference", Braces, NEW),
        cmd("save", "Save to…", Save, NEW),
        cmd("agent", "Run an agent…", Webhook, NEW),
      ],
      [cmd("archive", "Archive", Archive, { tone: "destructive" })],
    ),
  },
  {
    key: "flashcard",
    title: "Flashcard set",
    note: "Study verbs first, organizing after.",
    config: menu(
      [
        cmd("study", "Study", GraduationCap),
        cmd("fast-fire", "Fast Fire drill", Zap),
        cmd("edit", "Edit cards", SquarePen),
        cmd("tab", "Open in new tab", ExternalLink),
      ],
      [
        cmd("rename", "Rename", Pencil),
        cmd("move", "Move to folder", FolderInput),
        cmd("shown", "Shown to…", Users),
        cmd("agent", "Run an agent…", Webhook, NEW),
      ],
      [cmd("archive", "Archive", Archive, { tone: "destructive" })],
    ),
  },
  {
    key: "user-message",
    title: "Your own chat message",
    note: "Four rows: edit, fork, link, delete.",
    config: menu(
      [
        cmd("edit", "Edit & resubmit", SquarePen),
        cmd("fork", "Fork & regenerate", GitBranch),
        cmd("link", "Copy link…", Link),
      ],
      [cmd("delete", "Delete", Trash2, { tone: "destructive" })],
    ),
  },
];

export function ContentMenuIdeas() {
  return (
    <section className="flex flex-col gap-3" data-proposal-section="content-menu-ideas">
      <h2 className="border-t border-border pt-6 text-base font-semibold">Ideas for other content menus</h2>
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-4">
        {IDEAS.map((idea) => (
          <Card key={idea.key} title={idea.title} note={idea.note} badge="Idea">
            <ItemMenu config={idea.config} align="start" contentMinWidth="14rem">
              <TriggerButton icon={Ellipsis} label="Open menu" data-mock-trigger={`idea-${idea.key}`} />
            </ItemMenu>
          </Card>
        ))}
      </div>
    </section>
  );
}
