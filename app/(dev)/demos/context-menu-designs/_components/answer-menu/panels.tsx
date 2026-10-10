"use client";

// Chat answer menu — proposal (Arman, 2026-10-10). Mock panels only: every row says what it would
// run. Labels come from the real chat answer action registry (features/rich-document/actions/handlers);
// nothing here is wired to production and the real Alchemy package is untouched.

import { useState, type ComponentType, type KeyboardEvent } from "react";
import {
  Activity,
  AtSign,
  AudioLines,
  BookOpenCheck,
  Braces,
  Bug,
  Code,
  Contact,
  Copy,
  Download,
  Eraser,
  EyeOff,
  FileCode,
  FileText,
  Folder,
  GitBranch,
  GitCompare,
  Globe,
  Info,
  Layers,
  LifeBuoy,
  Link,
  Link2,
  ListTodo,
  Mail,
  MessageSquareText,
  NotebookPen,
  Pencil,
  Pin,
  Play,
  Printer,
  RotateCcw,
  Save,
  ScanSearch,
  Search,
  Send,
  Shapes,
  Share2,
  Shrink,
  ChartColumn,
  FlaskConical,
  Webhook,
  StickyNote,
  Table2,
  Trash2,
  Users,
  Variable,
  Wand2,
  Zap,
} from "lucide-react";
import { toast } from "@/lib/toast";

export type Icon = ComponentType<{ className?: string | undefined }>;

/** ONE icon treatment for every mock on this page: same size, same colour. */
export const ICON_CLASS = "h-4 w-4 shrink-0 text-muted-foreground";

export interface MockRow {
  id: string;
  label: string;
  icon: Icon;
  badge?: string | undefined;
  tone?: "destructive" | undefined;
  /** A checkbox row (view option), e.g. "Pinned only". */
  checkbox?: boolean | undefined;
}

export interface MockSection {
  label?: string | undefined;
  rows: MockRow[];
}

export interface MockPanelDef {
  key: string;
  title: string;
  note: string;
  search?: boolean | undefined;
  /** "This answer / Whole conversation" toggle at the top (Alchemy). */
  scope?: boolean | undefined;
  sections: MockSection[];
  footer?: MockRow | undefined;
  /** Empty libraries named here are hidden from the panel. */
  hiddenEmpty?: string[] | undefined;
}

export const would = (label: string) => toast.info(`Would run: ${label}`);

const r = (id: string, label: string, icon: Icon, extra: Partial<MockRow> = {}): MockRow => ({
  id,
  label,
  icon,
  ...extra,
});

export const COPY_LINK_PANEL: MockPanelDef = {
  key: "copy-link",
  title: "Copy link…",
  note: "Links for people, references for agents, in one place.",
  sections: [
    {
      label: "Links",
      rows: [
        r("link-message", "Copy link to this message", Link),
        r("link-conversation", "Copy link to this conversation", Link2),
      ],
    },
    {
      label: "For agents",
      rows: [
        r("ref-message", "Copy reference to this message", Braces),
        r("ref-conversation", "Copy reference to this conversation", Braces),
      ],
    },
  ],
  footer: r("reference-anything", "Reference anything…", AtSign),
};

export const SAVE_TO_PANEL: MockPanelDef = {
  key: "save-to",
  title: "Save to…",
  note: "Fourteen Save rows become one searchable picker.",
  search: true,
  sections: [
    {
      rows: [
        r("notes", "Notes", StickyNote),
        r("scratch", "Scratch", NotebookPen),
        r("document", "Document", FileText),
        r("task", "Task", ListTodo),
        r("rulebook", "Rulebook", BookOpenCheck),
        r("template", "Message template", MessageSquareText),
        r("files", "Files", Folder),
        r("code", "Code", Code),
        r("flashcards", "Flashcards / quiz", Layers),
        r("table", "Table", Table2),
        r("shapes", "Shapes", Shapes),
        r("contact", "Contact", Contact),
        r("context-value", "Context value", Variable),
        r("code-scratch", "Code to Scratch", FileCode),
      ],
    },
  ],
};

export const ALCHEMY_PANEL: MockPanelDef = {
  key: "alchemy",
  title: "Alchemy…",
  note: "Proposed Alchemy additions: one scope toggle, every format.",
  scope: true,
  search: true,
  sections: [
    {
      label: "Copy",
      rows: [
        r("copy-md", "Markdown", Copy),
        r("copy-text", "Text", Copy),
        r("copy-thinking", "With thinking", Copy),
        r("copy-html-source", "HTML source", Copy),
        r("copy-html-page", "HTML page", Copy),
        r("copy-tsv", "Table (TSV)", Table2),
        r("copy-csv", "Table (CSV)", Table2),
      ],
    },
    {
      label: "Download",
      rows: [
        r("dl-pdf", "PDF", Download),
        r("dl-word", "Word", Download),
        r("dl-html", "HTML", Download),
        r("dl-md", "Markdown", Download),
      ],
    },
    {
      label: "Share",
      rows: [
        r("publish-html", "Publish HTML", Globe),
        r("share-webpage", "Share as webpage", Share2),
        r("google-doc", "Google Doc", FileText),
        r("email-me", "Email to me", Mail),
      ],
    },
    {
      label: "Print",
      rows: [r("print", "Print", Printer), r("print-all", "All blocks", Printer, { checkbox: true })],
    },
    {
      label: "Spoken summary",
      rows: [r("summary-play", "Play", Play), r("summary-save", "Save", Save)],
    },
    {
      label: "Compare",
      rows: [
        r("compare-clipboard", "With clipboard", GitCompare),
        r("compare-set-base", "Set as base", GitCompare),
        r("compare-base", "With base", GitCompare),
      ],
    },
  ],
};

export const RUN_AGENT_PANEL: MockPanelDef = {
  key: "run-agent",
  title: "Run an agent…",
  note: "Three quick rows, then every library; empty libraries hide.",
  search: true,
  sections: [
    {
      rows: [
        r("send-agent", "Send to an agent…", Send),
        r("clean-up", "Clean up", Eraser),
        r("help-with", "Help with this…", LifeBuoy),
      ],
    },
    {
      label: "AI Actions",
      rows: [r("improve", "Improve Writing", Wand2), r("chart", "Chart this data", ChartColumn)],
    },
    {
      label: "Agents",
      rows: [r("agent-research", "Research Assistant", Webhook), r("agent-review", "Clinical Note Reviewer", Webhook)],
    },
    {
      label: "My Items",
      rows: [r("my-shortcut", "Patient letter shortcut", Zap)],
    },
  ],
  hiddenEmpty: ["Org Items"],
};

export const CONVERSATION_PANEL: MockPanelDef = {
  key: "conversation",
  title: "Conversation…",
  note: "Whole-chat actions, off the answer root.",
  sections: [
    {
      rows: [
        r("rename", "Rename", Pencil),
        r("share", "Share", Users),
        r("duplicate", "Duplicate", Copy),
        r("find", "Find in conversation", Search),
        r("pinned-only", "Pinned only", Pin, { checkbox: true }),
      ],
    },
    { rows: [r("export", "Export conversation…", FlaskConical, { badge: "Alchemy" })] },
  ],
};

export const CREATOR_PANEL: MockPanelDef = {
  key: "creator",
  title: "Creator tools…",
  note: "Only creators and admins see this row.",
  sections: [
    {
      rows: [r("analyze", "Analyze response", ScanSearch), r("debug", "Debug stream", Bug)],
    },
    {
      label: "Server",
      rows: [
        r("fork-at", "Fork at this message", GitBranch),
        r("fork-before", "Fork before this message", GitBranch),
        r("hide", "Hide from model", EyeOff),
        r("trash-this", "Trash this message", Trash2),
        r("trash-from", "Trash from here", Trash2),
        r("dry-run", "Dry-run: trash from here", Activity),
        r("summarize", "Replace with a summary", Shrink),
        r("restore", "Restore compaction", RotateCcw),
      ],
    },
    { rows: [r("surface", "Surface details", Info)] },
  ],
};

export const ROOT_PANELS = {
  "copy-link": COPY_LINK_PANEL,
  "save-to": SAVE_TO_PANEL,
  alchemy: ALCHEMY_PANEL,
  "run-agent": RUN_AGENT_PANEL,
  conversation: CONVERSATION_PANEL,
  creator: CREATOR_PANEL,
} as const;

function stopMenuTypeahead(e: KeyboardEvent<HTMLInputElement>) {
  // Inside a Radix menu, letters would jump to rows; Escape and arrows still reach the menu.
  if (e.key !== "Escape" && e.key !== "ArrowDown" && e.key !== "ArrowUp") e.stopPropagation();
}

/** One mock panel. Rendered inside a root-menu submenu and standalone in a popover. */
export function MockPanel({ def, onClose }: { def: MockPanelDef; onClose?: (() => void) | undefined }) {
  const [query, setQuery] = useState("");
  const [scope, setScope] = useState<"answer" | "conversation">("answer");
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const q = query.trim().toLowerCase();
  const sections = def.sections
    .map((s) => ({
      ...s,
      rows: s.rows.filter((row) => !q || `${s.label ?? ""} ${row.label}`.toLowerCase().includes(q)),
    }))
    .filter((s) => s.rows.length > 0);

  const run = (row: MockRow) => {
    if (row.checkbox) {
      setChecked((c) => ({ ...c, [row.id]: !c[row.id] }));
      return;
    }
    const where = def.scope ? ` (${scope === "answer" ? "this answer" : "whole conversation"})` : "";
    would(`${def.title.replace("…", "")} › ${row.label}${where}`);
    onClose?.();
  };

  return (
    <div className="flex w-72 max-w-[calc(100vw-2rem)] flex-col text-sm" data-mock-panel={def.key}>
      {def.scope ? (
        <div className="flex gap-1 border-b border-border p-1.5">
          {(["answer", "conversation"] as const).map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => setScope(s)}
              className={`flex-1 rounded-md px-2 py-1 text-xs ${
                scope === s ? "bg-accent font-medium text-foreground" : "text-muted-foreground hover:bg-accent/60"
              }`}
            >
              {s === "answer" ? "This answer" : "Whole conversation"}
            </button>
          ))}
        </div>
      ) : null}
      {def.search ? (
        <div className="flex items-center gap-2 border-b border-border px-2.5 py-1.5">
          <Search className={ICON_CLASS} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            onKeyDown={stopMenuTypeahead}
            placeholder="Search…"
            className="min-w-0 flex-1 bg-transparent text-base outline-none placeholder:text-muted-foreground md:text-sm"
          />
        </div>
      ) : null}
      <div className="max-h-[min(60vh,420px)] overflow-y-auto p-1">
        {sections.length === 0 ? <div className="px-2 py-3 text-xs text-muted-foreground">No match</div> : null}
        {sections.map((s, i) => (
          <div key={s.label ?? i} className={i > 0 ? "mt-1 border-t border-border pt-1" : ""}>
            {s.label ? (
              <div className="px-2 pb-0.5 pt-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                {s.label}
              </div>
            ) : null}
            {s.rows.map((row) => {
              const RowIcon = row.icon;
              return (
                <button
                  key={row.id}
                  type="button"
                  onClick={() => run(row)}
                  className="flex w-full items-center gap-2 rounded-sm px-2 py-1.5 text-left hover:bg-accent focus-visible:bg-accent focus-visible:outline-none"
                >
                  <RowIcon className={ICON_CLASS} />
                  <span className="min-w-0 flex-1 truncate">{row.label}</span>
                  {row.checkbox ? (
                    <span
                      className={`h-3.5 w-3.5 rounded-sm border border-border ${
                        checked[row.id] ? "bg-primary" : "bg-transparent"
                      }`}
                    />
                  ) : null}
                  {row.badge ? (
                    <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] text-muted-foreground">{row.badge}</span>
                  ) : null}
                </button>
              );
            })}
          </div>
        ))}
        {def.hiddenEmpty?.length && !q ? (
          <div className="mt-1 border-t border-border px-2 pb-1 pt-1.5 text-[11px] text-muted-foreground">
            Hidden while empty: {def.hiddenEmpty.join(", ")}
          </div>
        ) : null}
      </div>
      {def.footer ? (
        <div className="border-t border-border p-1">
          <button
            type="button"
            onClick={() => run(def.footer!)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-border px-2 py-1.5 hover:bg-accent"
          >
            <def.footer.icon className={ICON_CLASS} />
            {def.footer.label}
          </button>
        </div>
      ) : null}
    </div>
  );
}
