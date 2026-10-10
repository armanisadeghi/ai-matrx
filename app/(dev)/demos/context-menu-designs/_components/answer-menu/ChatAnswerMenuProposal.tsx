"use client";

// Chat answer menu — proposal (Oct 2026). Mock menus on the real primitives: `ItemMenu`
// (@ai-matrx/design-system/item, the same menu every record row uses) for root menus, the
// design-system Popover for standalone panels, and the design-system ContextMenu for right-click.
// Every row only says what it would run. Production chat menus are untouched.

import { useState, type ReactNode } from "react";
import {
  ArrowDownToLine,
  BookmarkPlus,
  ChevronDown,
  Copy,
  Ellipsis,
  FileInput,
  FileText,
  FlaskConical,
  GitBranch,
  History,
  Link,
  ListPlus,
  MessagesSquare,
  Pin,
  Quote,
  RefreshCw,
  Replace,
  Save,
  Search,
  SquarePen,
  ThumbsDown,
  ThumbsUp,
  Trash2,
  Volume2,
  Webhook,
  Wrench,
  Zap,
  ClipboardCopy,
  Download,
  Paperclip,
  Info,
  Highlighter,
} from "lucide-react";
import { ItemMenu, type ItemMenuConfig, type ItemMenuEntry } from "@ai-matrx/design-system/item";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
  ContextMenuSub,
  ContextMenuSubContent,
  ContextMenuSubTrigger,
  ContextMenuTrigger,
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@ai-matrx/design-system";
import {
  ALCHEMY_PANEL,
  CONVERSATION_PANEL,
  COPY_LINK_PANEL,
  CREATOR_PANEL,
  ICON_CLASS,
  MockPanel,
  RUN_AGENT_PANEL,
  SAVE_TO_PANEL,
  would,
  type Icon,
  type MockPanelDef,
} from "./panels";

// ── shared bits ─────────────────────────────────────────────────────────────────────────────

export function Card({
  title,
  note,
  badge,
  children,
}: {
  title: string;
  note: string;
  badge?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div className="flex min-w-0 flex-col gap-2 rounded-lg border border-border bg-card p-3">
      <div className="flex items-center gap-2">
        <h3 className="truncate text-sm font-semibold">{title}</h3>
        {badge ? (
          <span className="rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
            {badge}
          </span>
        ) : null}
      </div>
      <p className="truncate text-xs text-muted-foreground" title={note}>
        {note}
      </p>
      <div className="flex flex-wrap items-center gap-2">{children}</div>
    </div>
  );
}

export function TriggerButton({ icon: I, label, ...rest }: { icon: Icon; label: string } & React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...rest}
      className="inline-flex h-7 items-center gap-1.5 rounded-md border border-border px-2 text-xs hover:bg-accent"
    >
      <I className={ICON_CLASS} />
      {label}
    </button>
  );
}

export const cmd = (id: string, label: string, icon: Icon, extra: Partial<ItemMenuEntry> = {}): ItemMenuEntry =>
  ({ id, label, icon, onSelect: () => would(label), ...extra }) as ItemMenuEntry;

const panelSub = (def: MockPanelDef, icon: Icon, extra: Partial<ItemMenuEntry> = {}): ItemMenuEntry =>
  ({
    id: def.key,
    label: def.title,
    icon,
    kind: "submenu",
    sections: [],
    renderContent: (onClose: () => void) => <MockPanel def={def} onClose={onClose} />,
    ...extra,
  }) as ItemMenuEntry;

function PanelPopover({ def, icon }: { def: MockPanelDef; icon: Icon }) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <TriggerButton icon={icon} label={`Open ${def.title.replace("…", "")}`} data-mock-trigger={def.key} />
      </PopoverTrigger>
      <PopoverContent align="start" className="w-auto p-0">
        <MockPanel def={def} onClose={() => setOpen(false)} />
      </PopoverContent>
    </Popover>
  );
}

// ── the "…" root ───────────────────────────────────────────────────────────────────────────

interface RootFlags {
  own: boolean;
  creator: boolean;
  contextual: boolean;
}

function answerRoot({ own, creator, contextual }: RootFlags): ItemMenuConfig {
  const when = { badge: "When relevant", hidden: !contextual };
  return {
    sections: [
      {
        id: "primary",
        items: [
          cmd("regenerate", "Regenerate", RefreshCw),
          cmd("branch", "Branch in new chat", GitBranch),
          cmd("quote", "Quote in reply", Quote),
        ],
      },
      {
        id: "contextual",
        items: [
          cmd("apply", "Apply to source", FileInput, when),
          cmd("replace", "Replace", Replace, when),
          cmd("insert", "Insert below", ListPlus, when),
          cmd("shortcut", "Save as shortcut", Zap, when),
          cmd("bind", "Bind to this page", Paperclip, when),
          cmd("chat-mode", "Continue in chat mode", MessagesSquare, when),
          cmd("notes", "Notes & comments", Highlighter, when),
          cmd("versions", "Version history (3)", History, when),
        ],
      },
      {
        id: "more",
        items: [
          panelSub(COPY_LINK_PANEL, Link),
          panelSub(SAVE_TO_PANEL, Save),
          panelSub(ALCHEMY_PANEL, FlaskConical),
          panelSub(RUN_AGENT_PANEL, Webhook),
          panelSub(CONVERSATION_PANEL, MessagesSquare),
          panelSub(CREATOR_PANEL, Wrench, { hidden: !creator }),
        ],
      },
      { id: "danger", items: [cmd("delete", "Delete", Trash2, { tone: "destructive", hidden: !own })] },
    ],
  };
}

const COPY_SPLIT: ItemMenuConfig = {
  sections: [
    {
      items: [
        cmd("copy-raw", "Copy raw", Copy),
        cmd("copy-formatted", "Copy formatted", ClipboardCopy),
        cmd("copy-ai", "Copy for AI (with context)", Webhook),
      ],
    },
  ],
};

function Toggle({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <label className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
      {label}
    </label>
  );
}

function BarIcon({ icon: I, label }: { icon: Icon; label: string }) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={() => would(label)}
      className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
    >
      <I className={ICON_CLASS} />
    </button>
  );
}

/** A sample answer with the proposed bar: split Copy, the existing bar icons, and the new "…". */
function AnswerBarDemo() {
  const [flags, setFlags] = useState<RootFlags>({ own: true, creator: true, contextual: false });
  const set = (k: keyof RootFlags) => (v: boolean) => setFlags((f) => ({ ...f, [k]: v }));
  return (
    <div className="flex flex-col gap-3 rounded-lg border border-border bg-card p-3">
      <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
        <h3 className="text-sm font-semibold">Answer bar · Copy split + &quot;…&quot; menu</h3>
        <Toggle label="Own / editable message" checked={flags.own} onChange={set("own")} />
        <Toggle label="Creator or admin" checked={flags.creator} onChange={set("creator")} />
        <Toggle label="Contextual rows" checked={flags.contextual} onChange={set("contextual")} />
      </div>
      <div className="rounded-md bg-textured p-3 text-sm leading-relaxed">
        Start the patient on a home exercise plan of three sessions a week, then review range of motion
        at the two-week follow-up.
      </div>
      <div className="flex items-center gap-0.5" data-mock-answer-bar>
        <div className="inline-flex items-center rounded-md hover:bg-accent/40">
          <BarIcon icon={Copy} label="Copy raw" />
          <ItemMenu config={COPY_SPLIT} align="start" contentMinWidth="14rem">
            <button
              type="button"
              aria-label="Copy options"
              data-mock-trigger="copy-split"
              className="inline-flex h-7 w-5 items-center justify-center rounded-md hover:bg-accent"
            >
              <ChevronDown className="h-3 w-3 text-muted-foreground" />
            </button>
          </ItemMenu>
        </div>
        <BarIcon icon={Volume2} label="Speak" />
        <BarIcon icon={Pin} label="Pin" />
        <BarIcon icon={ThumbsUp} label="Helpful" />
        <BarIcon icon={ThumbsDown} label="Not helpful" />
        <BarIcon icon={SquarePen} label="Edit content" />
        <ItemMenu config={answerRoot(flags)} align="start" contentMinWidth="15rem">
          <button
            type="button"
            aria-label="More actions"
            data-mock-trigger="answer-root"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md hover:bg-accent"
          >
            <Ellipsis className={ICON_CLASS} />
          </button>
        </ItemMenu>
      </div>
    </div>
  );
}

// ── right-click ────────────────────────────────────────────────────────────────────────────

interface RcRow {
  label: string;
  icon: Icon;
  sub?: string[] | undefined;
}

/** Today's v3 universal rows on an answer, minus the header title, Quick Actions and Chat. */
const RIGHT_CLICK: RcRow[][] = [
  [
    { label: "Copy", icon: Copy },
    { label: "Speak", icon: Volume2 },
    { label: "Find & Replace", icon: Search },
    { label: "Select All", icon: ListPlus },
  ],
  [
    { label: "Copy as", icon: ClipboardCopy, sub: ["Markdown", "Plain text", "HTML"] },
    { label: "Export", icon: ArrowDownToLine, sub: ["PDF", "Word", "HTML", "Markdown"] },
    { label: "Download PDF", icon: Download },
    { label: "Download Word", icon: Download },
    { label: "Download HTML", icon: Download },
    { label: "Save as PDF Document", icon: FileText },
    { label: "Attach To", icon: Paperclip },
  ],
  [
    { label: "AI Actions", icon: Zap, sub: ["Improve Writing", "Chart this data"] },
    { label: "Agents", icon: Webhook, sub: ["Research Assistant", "Clinical Note Reviewer"] },
    { label: "Summarize & listen", icon: Volume2 },
  ],
  [
    { label: "Submit feedback", icon: BookmarkPlus },
    { label: "This page", icon: Info, sub: ["Surface details"] },
  ],
];

function RightClickDemo() {
  return (
    <Card title="Right-click on an answer" note="Full menu stays; no header, no Quick Actions, no Chat row.">
      <ContextMenu>
        <ContextMenuTrigger asChild>
          <div
            data-mock-trigger="right-click"
            className="w-full rounded-md border border-dashed border-border bg-textured p-3 text-sm"
          >
            Right-click this answer text.
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent className="min-w-[14rem]">
          {RIGHT_CLICK.map((group, gi) => (
            <div key={gi}>
              {gi > 0 ? <ContextMenuSeparator /> : null}
              {group.map((row) => {
                const I = row.icon;
                return row.sub ? (
                  <ContextMenuSub key={row.label}>
                    <ContextMenuSubTrigger className="gap-2">
                      <I className={ICON_CLASS} />
                      {row.label}
                    </ContextMenuSubTrigger>
                    <ContextMenuSubContent>
                      {row.sub.map((s) => (
                        <ContextMenuItem key={s} onSelect={() => would(`${row.label} › ${s}`)}>
                          {s}
                        </ContextMenuItem>
                      ))}
                    </ContextMenuSubContent>
                  </ContextMenuSub>
                ) : (
                  <ContextMenuItem key={row.label} className="gap-2" onSelect={() => would(row.label)}>
                    <I className={ICON_CLASS} />
                    {row.label}
                  </ContextMenuItem>
                );
              })}
            </div>
          ))}
        </ContextMenuContent>
      </ContextMenu>
    </Card>
  );
}

// ── removed, and why ───────────────────────────────────────────────────────────────────────

const REMOVED: [string, string][] = [
  ["Header", "No reference product has one"],
  ["Copy, Speak, Pin, Read aloud, Helpful, Not helpful, Edit content", "Already on the bar"],
  ["Find & Replace", "Nothing to replace on an answer"],
  ["Select All", "⌘A"],
  ["Filter box", "Not needed at 9 rows"],
  ["Open in full-screen editor", "A toggle inside the editor"],
  ["Ask a follow-up", "The same as Quote"],
  ["Custom agent", "The same as Send to an agent"],
  ["Save as PDF Document", "A 4th PDF path"],
  ["Chat, Quick Actions", "Unrelated app launchers"],
  ["Submit feedback", "Thumbs-down covers it"],
  ["Voice settings", "Belongs in the player / settings"],
  ["Admin Tools", "App-wide"],
  ["Code-block rows", "They stay in the code block menu"],
];

function RemovedList() {
  return (
    <div className="flex flex-col gap-2 rounded-lg border border-border bg-card p-3" data-mock-removed>
      <h3 className="text-sm font-semibold">Removed, and why</h3>
      <div className="grid grid-cols-1 gap-x-6 gap-y-1 text-xs sm:grid-cols-2">
        {REMOVED.map(([what, why]) => (
          <div key={what} className="flex min-w-0 items-baseline gap-2">
            <Trash2 className="h-3 w-3 shrink-0 translate-y-0.5 text-muted-foreground" />
            <span className="min-w-0 font-medium line-through decoration-muted-foreground/60">{what}</span>
            <span className="ml-auto shrink-0 text-muted-foreground">{why}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── section ────────────────────────────────────────────────────────────────────────────────

const PANEL_CARDS: { def: MockPanelDef; icon: Icon; badge?: string }[] = [
  { def: COPY_LINK_PANEL, icon: Link },
  { def: SAVE_TO_PANEL, icon: Save },
  { def: ALCHEMY_PANEL, icon: FlaskConical, badge: "Mock" },
  { def: RUN_AGENT_PANEL, icon: Webhook },
  { def: CONVERSATION_PANEL, icon: MessagesSquare },
  { def: CREATOR_PANEL, icon: Wrench, badge: "Creators" },
];

export function ChatAnswerMenuProposal() {
  return (
    <section className="flex flex-col gap-3" data-proposal-section="chat-answer-menu">
      <h2 className="border-t border-border pt-6 text-base font-semibold">Chat answer menu — proposal (Oct 2026)</h2>
      <AnswerBarDemo />
      <div className="grid grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3">
        <Card title="Answer bar Copy menu" note="One click copies raw; the chevron holds three rows." badge="Built">
          <ItemMenu config={COPY_SPLIT} align="start" contentMinWidth="14rem">
            <TriggerButton icon={Copy} label="Open Copy menu" data-mock-trigger="copy-card" />
          </ItemMenu>
        </Card>
        {PANEL_CARDS.map(({ def, icon, badge }) => (
          <Card key={def.key} title={def.title} note={def.note} badge={badge}>
            <PanelPopover def={def} icon={icon} />
          </Card>
        ))}
        <RightClickDemo />
      </div>
      <RemovedList />
    </section>
  );
}
