// features/context-menu-v3/designs/catalog.ts
//
// The right-click design decision demo (/demos/context-menu-designs): ONE
// catalog of rows (ids shared by every design, so "lossless" is a real id walk)
// and the four arrangements — Today and three competing designs — as pure
// specs. `model.ts` turns a spec into real `@ai-matrx/alchemy` Actions and the
// real MenuModel; nothing here renders. Demo-only: production menus are not
// touched by this folder.

import {
  Archive,
  ArchiveRestore,
  AtSign,
  AudioLines,
  Bell,
  Blocks,
  BookMarked,
  UserCog,
  Building2,
  CalendarCheck,
  ClipboardCopy,
  ClipboardList,
  Copy,
  CopyPlus,
  Database,
  Download,
  Dumbbell,
  ExternalLink,
  FileAudio,
  FileDown,
  FolderCog,
  FolderInput,
  Forward,
  GitCompare,
  GitCompareArrows,
  Headphones,
  History,
  Inbox,
  Info,
  Layers,
  LayoutDashboard,
  Link,
  ListChecks,
  ListTodo,
  MessageSquare,
  MessageSquareWarning,
  PanelsTopLeft,
  Pencil,
  Pin,
  Save,
  Search,
  Settings,
  Share2,
  Shield,
  ShieldCheck,
  SquareArrowOutUpRight,
  SquarePlus,
  Star,
  Stethoscope,
  StickyNote,
  Table2,
  TextSelect,
  Upload,
  User,
  Volume2,
  Cpu,
  Webhook,
  Zap,
} from "lucide-react";
import { registerAlchemyIcon } from "@/components/agent-copy/alchemy-icon-keys";

// Icon KEYS for the model: each Lucide component registered once with the app's icon port, so the
// package's renderers and the demo twin resolve the same glyph (the static name map is curated).
const I = Object.fromEntries(
  Object.entries({ Archive, ArchiveRestore, AtSign, AudioLines, Bell, Blocks, BookMarked, UserCog, Building2, CalendarCheck, ClipboardCopy, ClipboardList, Copy, CopyPlus, Database, Download, Dumbbell, ExternalLink, FileAudio, FileDown, FolderCog, FolderInput, Forward, GitCompare, GitCompareArrows, Headphones, History, Inbox, Info, Layers, LayoutDashboard, Link, ListChecks, ListTodo, MessageSquare, MessageSquareWarning, PanelsTopLeft, Pencil, Pin, Save, Search, Settings, Share2, Shield, ShieldCheck, SquareArrowOutUpRight, SquarePlus, Star, Stethoscope, StickyNote, Table2, TextSelect, Upload, User, Volume2, Cpu, Webhook, Zap }).map(([name, icon]) => [name, registerAlchemyIcon(icon)]),
) as Record<"Archive" | "ArchiveRestore" | "AtSign" | "AudioLines" | "Bell" | "Blocks" | "BookMarked" | "UserCog" | "Building2" | "CalendarCheck" | "ClipboardCopy" | "ClipboardList" | "Copy" | "CopyPlus" | "Database" | "Download" | "Dumbbell" | "ExternalLink" | "FileAudio" | "FileDown" | "FolderCog" | "FolderInput" | "Forward" | "GitCompare" | "GitCompareArrows" | "Headphones" | "History" | "Inbox" | "Info" | "Layers" | "LayoutDashboard" | "Link" | "ListChecks" | "ListTodo" | "MessageSquare" | "MessageSquareWarning" | "PanelsTopLeft" | "Pencil" | "Pin" | "Save" | "Search" | "Settings" | "Share2" | "Shield" | "ShieldCheck" | "SquareArrowOutUpRight" | "SquarePlus" | "Star" | "Stethoscope" | "StickyNote" | "Table2" | "TextSelect" | "Upload" | "User" | "Volume2" | "Cpu" | "Webhook" | "Zap", string>;

export type DesignKey = "today" | "d1" | "d2" | "d3";

/** One row of a design: a leaf, or a submenu (children). Ids are shared across designs. */
export interface DNode {
  id: string;
  label: string;
  icon?: string;
  hint?: string;
  destructive?: boolean;
  /** Divider above this row inside its section / submenu. */
  startsGroup?: boolean;
  /** Viewer rights: greyed with this one-line reason. */
  viewerReason?: string;
  children?: DNode[];
}

export interface DSection {
  /** Only an approved heading (e.g. "Compare"); most sections have none. */
  heading?: string;
  nodes: DNode[];
}

export interface DesignSpec {
  key: DesignKey;
  /** Header line: `label` alone, or `label: text`. */
  header: { label: string; text: string };
  strip: DNode[];
  /** Number of sections drawn ABOVE the icon strip (0 = strip on top, as the package draws it). */
  stripAfter: number;
  sections: DSection[];
}

export interface DesignOptions {
  /** The word the person selected, or null (pointer on the object). */
  selection: string | null;
  viewer: boolean;
  /** The clicked table's name. */
  name: string;
}

export const DESIGN_TABS: { key: DesignKey; label: string }[] = [
  { key: "today", label: "Today" },
  { key: "d1", label: "Design 1" },
  { key: "d2", label: "Design 2" },
  { key: "d3", label: "Design 3" },
];

// ── The object's own actions (a table), in rank order ─────────────────────────

const REASON = {
  rename: "Only editors can rename",
  settings: "Only editors can change settings",
  archive: "Only editors can archive",
  import: "Only editors can import",
} as const;

function obj(viewer: boolean) {
  const v = (reason: string) => (viewer ? { viewerReason: reason } : {});
  return {
    open: { id: "open", label: "Open", icon: I.SquareArrowOutUpRight, hint: "↵" },
    openNewTab: { id: "open-new-tab", label: "Open in new tab", icon: I.ExternalLink },
    copyLink: { id: "copy-link", label: "Copy link", icon: I.Link, hint: "⌘L" },
    share: { id: "share", label: "Share…", icon: I.Share2 },
    duplicate: { id: "duplicate", label: "Duplicate", icon: I.CopyPlus },
    archive: { id: "archive", label: "Archive table", icon: I.Archive, destructive: true, ...v(REASON.archive) },
    rename: { id: "rename", label: "Rename", icon: I.Pencil, ...v(REASON.rename) },
    move: { id: "move", label: "Move to…", icon: I.FolderInput },
    favorite: { id: "favorite", label: "Favorite", icon: I.Star },
    export: { id: "table-export", label: "Export…", icon: I.Download },
    import: { id: "import", label: "Import…", icon: I.Upload, ...v(REASON.import) },
    settings: { id: "settings", label: "Settings", icon: I.Settings, ...v(REASON.settings) },
    history: { id: "history", label: "History", icon: I.History },
    builtOn: {
      id: "built-on",
      label: "Built on it",
      icon: I.Blocks,
      children: [
        { id: "built-forms", label: "Forms", icon: I.ClipboardList },
        { id: "built-bookings", label: "Bookings", icon: I.CalendarCheck },
        { id: "built-checklists", label: "Checklists", icon: I.ListChecks },
        { id: "built-notifications", label: "Notifications", icon: I.Bell },
        { id: "built-portals", label: "Portals", icon: I.PanelsTopLeft },
        { id: "built-inbox", label: "Inbox", icon: I.Inbox },
        { id: "built-dashboards", label: "Dashboards", icon: I.LayoutDashboard },
        { id: "built-archived", label: "Archived records", icon: I.ArchiveRestore },
      ],
    },
  } satisfies Record<string, DNode>;
}

const STRIP: DNode[] = [
  { id: "copy", label: "Copy", icon: I.Copy },
  { id: "speak", label: "Speak", icon: I.Volume2 },
  { id: "find", label: "Find", icon: I.Search },
];

// ── Today's generic rows (the 27 the platform adds to every menu) ─────────────

const G = {
  selectAll: { id: "select-all", label: "Select All", icon: I.TextSelect },
  copyReference: { id: "copy-reference", label: "Copy reference…", icon: I.AtSign },
  compareClipboard: { id: "compare-clipboard", label: "Compare with clipboard", icon: I.GitCompareArrows },
  compareSetBase: { id: "compare-set-base", label: "Set as compare base", icon: I.Pin },
  compareBase: { id: "compare-base", label: "Compare with base", icon: I.GitCompare },
  copyAs: {
    id: "copy-as",
    label: "Copy as",
    icon: I.ClipboardCopy,
    children: [
      { id: "copy-as-markdown", label: "Markdown" },
      { id: "copy-as-text", label: "Plain text" },
      { id: "copy-as-json", label: "JSON" },
      { id: "copy-as-csv", label: "CSV" },
    ],
  },
  export: {
    id: "export",
    label: "Export",
    icon: I.FileDown,
    children: [
      { id: "export-pdf", label: "PDF" },
      { id: "export-word", label: "Word" },
      { id: "export-markdown", label: "Markdown file" },
      { id: "export-print", label: "Print" },
    ],
  },
  save: {
    id: "save",
    label: "Save",
    icon: I.Save,
    children: [
      { id: "save-document", label: "Document" },
      { id: "save-file", label: "File" },
      { id: "save-flashcards", label: "Flashcards" },
    ],
  },
  saveNotes: { id: "save-notes", label: "Save to Notes", icon: I.StickyNote },
  saveTask: { id: "save-task", label: "Save to task", icon: I.ListTodo },
  addRulebook: { id: "add-rulebook", label: "Add to Rulebook", icon: I.BookMarked },
  createTask: { id: "create-task", label: "Create Task", icon: I.SquarePlus },
  sendAgent: { id: "send-agent", label: "Send to another agent…", icon: I.Forward },
  customAgent: { id: "custom-agent", label: "Custom agent…", icon: I.UserCog },
  aiActions: {
    id: "ai-actions",
    label: "AI Actions",
    icon: I.Cpu,
    children: [
      { id: "ai-summarize", label: "Summarize" },
      { id: "ai-explain", label: "Explain" },
      { id: "ai-translate", label: "Translate" },
      { id: "ai-key-points", label: "Extract key points" },
    ],
  },
  agents: {
    id: "agents",
    label: "Agents",
    icon: I.Webhook,
    children: [
      { id: "agent-intake", label: "Intake reviewer" },
      { id: "agent-billing", label: "Billing assistant" },
    ],
  },
  myItems: {
    id: "my-items",
    label: "My Items",
    icon: I.User,
    children: [
      { id: "my-reminder", label: "Patient reminder card" },
      { id: "my-visit-summary", label: "Visit summary template" },
    ],
  },
  orgItems: {
    id: "org-items",
    label: "Org Items",
    icon: I.Building2,
    children: [
      { id: "org-sop", label: "Clinic SOP checker" },
      { id: "org-referral", label: "Referral letter drafter" },
    ],
  },
  chat: { id: "chat", label: "Chat", icon: I.MessageSquare },
  readAloud: { id: "read-aloud", label: "Read aloud", icon: I.Volume2 },
  summarizeListen: { id: "summarize-listen", label: "Summarize & listen", icon: I.Headphones },
  summarizeSilent: { id: "summarize-silent", label: "Summarize without playing", icon: I.FileAudio },
  feedback: { id: "feedback", label: "Submit feedback", icon: I.MessageSquareWarning },
  voiceSettings: { id: "voice-settings", label: "Read-aloud voice settings", icon: I.AudioLines },
  quickActions: {
    id: "quick-actions",
    label: "Quick Actions",
    icon: I.Zap,
    children: [
      { id: "qa-notes", label: "Notes" },
      { id: "qa-tasks", label: "Tasks" },
      { id: "qa-chat", label: "Chat" },
      { id: "qa-data", label: "Data" },
      { id: "qa-files", label: "Files" },
      { id: "qa-voice", label: "Voice Input" },
    ],
  },
  adminTools: {
    id: "admin-tools",
    label: "Admin Tools",
    icon: I.Shield,
    children: [
      { id: "admin-inspect", label: "Inspect surface" },
      { id: "admin-debug", label: "Debug info" },
    ],
  },
  thisPage: {
    id: "this-page",
    label: "This page",
    icon: I.Info,
    children: [
      { id: "page-location", label: "Location" },
      { id: "page-context", label: "Context" },
      { id: "page-agents", label: "Page agents" },
    ],
  },
} satisfies Record<string, DNode>;

/** Today's menu, in order (sections as drawn). */
function todaySections(viewer: boolean): DSection[] {
  const o = obj(viewer);
  return [
    { nodes: [o.open, o.openNewTab, { ...o.favorite, label: "Add to favorites" }] },
    { nodes: [G.selectAll, G.copyReference] },
    { heading: "Compare", nodes: [G.compareClipboard, G.compareSetBase, G.compareBase] },
    { nodes: [G.copyAs, G.export, G.save, G.saveNotes, G.saveTask, G.addRulebook, G.createTask] },
    { nodes: [G.sendAgent, G.customAgent, G.aiActions, G.agents, G.myItems, G.orgItems, G.chat] },
    { nodes: [G.readAloud, G.summarizeListen, G.summarizeSilent] },
    { nodes: [G.feedback, G.voiceSettings, G.quickActions] },
    { nodes: [G.adminTools, G.thisPage] },
  ];
}

/** The rows the baseline counts: today's generic top-level rows (27). */
export const TODAY_ROW_IDS: readonly string[] = todaySections(false)
  .slice(1)
  .flatMap((s) => s.nodes.map((n) => n.id));

/** Every node under today's generic rows (submenu contents included). */
export const TODAY_ALL_GENERIC_IDS: readonly string[] = (() => {
  const out: string[] = [];
  const walk = (nodes: readonly DNode[]) => {
    for (const n of nodes) {
      out.push(n.id);
      if (n.children) walk(n.children);
    }
  };
  for (const s of todaySections(false).slice(1)) walk(s.nodes);
  return out;
})();

/** The platform rows folded into 5 family rows (Designs 1–3). Every today row lives here. */
function platformFamilies(): DNode[] {
  return [
    {
      ...G.copyAs,
      children: [
        ...G.copyAs.children,
        { ...G.copyReference, startsGroup: true },
        { ...G.compareClipboard, startsGroup: true },
        G.compareSetBase,
        G.compareBase,
      ],
    },
    {
      ...G.save,
      children: [
        ...G.save.children,
        { ...G.saveNotes, startsGroup: true },
        G.saveTask,
        G.addRulebook,
        G.createTask,
        { ...G.export, startsGroup: true },
      ],
    },
    {
      id: "family-ai",
      label: "AI Actions",
      icon: I.Cpu,
      children: [G.aiActions, G.agents, G.myItems, G.orgItems, { ...G.sendAgent, startsGroup: true }, G.customAgent, { ...G.chat, startsGroup: true }],
    },
    {
      id: "family-read-aloud",
      label: "Read aloud",
      icon: I.Volume2,
      children: [G.readAloud, G.summarizeListen, G.summarizeSilent, { ...G.voiceSettings, startsGroup: true }],
    },
    {
      ...G.thisPage,
      children: [
        ...G.thisPage.children,
        { ...G.selectAll, startsGroup: true },
        { ...G.quickActions, startsGroup: true },
        G.feedback,
        G.adminTools,
      ],
    },
  ];
}

function header(o: DesignOptions, todayStyle: boolean): DesignSpec["header"] {
  if (o.selection) return { label: "Selected", text: o.selection };
  return todayStyle ? { label: "Table", text: o.name } : { label: `${o.name} · Table`, text: "" };
}

export function buildDesign(key: DesignKey, o: DesignOptions): DesignSpec {
  const t = obj(o.viewer);
  switch (key) {
    case "today":
      return { key, header: header(o, true), strip: STRIP, stripAfter: 0, sections: todaySections(o.viewer) };
    case "d1": {
      const top: DSection = { nodes: [t.open, t.openNewTab, t.copyLink, t.share, t.duplicate, { ...t.archive, startsGroup: true }] };
      const overflow: DSection = {
        nodes: [{ id: "table-more", label: "Table", icon: I.Table2, children: [t.rename, t.move, t.favorite, t.export, t.import, t.settings, t.history, t.builtOn] }],
      };
      const sections = [top, overflow, { nodes: platformFamilies() }];
      // Selected text leads with the clipboard strip; otherwise the object leads and the strip follows it.
      return { key, header: header(o, false), strip: STRIP, stripAfter: o.selection ? 0 : 2, sections };
    }
    case "d2": {
      const strip = [t.open, t.copyLink, t.share, t.duplicate, t.archive, ...(o.selection ? STRIP : [])];
      return {
        key,
        header: header(o, false),
        strip,
        stripAfter: 0,
        sections: [{ nodes: [t.rename, t.move, t.favorite, t.export, t.import, t.settings, t.history, t.builtOn] }, { nodes: platformFamilies() }],
      };
    }
    case "d3": {
      const top: DSection = {
        nodes: [
          { id: "open-menu", label: "Open", icon: I.SquareArrowOutUpRight, children: [t.open, t.openNewTab, t.copyLink] },
          t.share,
          { id: "organize", label: "Organize", icon: I.FolderCog, children: [t.rename, t.duplicate, t.move, t.favorite, { ...t.archive, startsGroup: true }] },
          { id: "data-menu", label: "Data", icon: I.Database, children: [t.export, t.import, t.history, t.settings] },
          t.builtOn,
        ],
      };
      return {
        key,
        header: header(o, false),
        strip: STRIP,
        stripAfter: 1,
        sections: [top, { nodes: [{ id: "ai-matrx", label: "AI Matrx", icon: I.Layers, children: platformFamilies() }] }],
      };
    }
  }
}

/** Design 3's cap: the developer designs to exactly this many top rows. */
export const DESIGN3_TOP_ROW_CAP = 5;

export const CLINIC_TABLES: { id: string; name: string; records: number; updated: string; icon: string }[] = [
  { id: "patient-visits", name: "Patient Visit Tracker", records: 1284, updated: "2h ago", icon: I.Stethoscope },
  { id: "referral-intake", name: "Referral Intake Queue", records: 87, updated: "Today", icon: I.Inbox },
  { id: "home-exercise", name: "Home Exercise Plans", records: 342, updated: "Yesterday", icon: I.Dumbbell },
  { id: "insurance-auth", name: "Insurance Authorizations", records: 156, updated: "Mon", icon: I.ShieldCheck },
];
