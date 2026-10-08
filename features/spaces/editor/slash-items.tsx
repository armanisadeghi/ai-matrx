"use client";

// features/spaces/editor/slash-items.tsx — the "/" menu, in Notion's order and groups (B4).
//
// Media (image, video, audio, file, PDF) open Notion's Upload | Embed link picker (media-insert.tsx);
// "/embed" and the provider items open Embed link; Inline puts a mention, date or equation in the line.

import type { DefaultReactSuggestionItem } from "@blocknote/react";
import {
  ChevronRight,
  Code,
  Columns2,
  Columns3,
  Columns4,
  FileText,
  Heading1,
  Heading2,
  Heading3,
  Lightbulb,
  Link2,
  List,
  ListChecks,
  ListOrdered,
  ListTree,
  Minus,
  Quote,
  Type,
  Table2,
  Kanban,
  Database,
  PieChart,
  Sigma,
  PanelTop,
  RefreshCw,
  MousePointerClick,
  Image as ImageIcon,
  Video,
  AudioLines,
  Paperclip,
  FileType2,
  Bookmark,
  Globe,
  AtSign,
  CalendarDays,
  SquareFunction,
  Heading4,
} from "lucide-react";
import { SuggestionMenu } from "@blocknote/core";

import type { PickedSource } from "../data/SourcePicker";
import { newViewId, type SpaceDbView } from "../data/sources";
import type { SpacesEditor } from "./schema";
import { insertAtSlash, slashTarget } from "./slash-insert";
import { blockElement, openMediaPicker, type MediaKind, type PickedMedia } from "./media-insert";
import { EMBED_PROVIDERS, GENERIC_EMBED, type EmbedProvider } from "./embed-providers";

const ICON = 18;

type SpacesPartialBlock = Parameters<SpacesEditor["insertBlocks"]>[0][number];

export interface SlashContext {
  createSubpage: () => Promise<string | null>;
  /** A page to link to — or one made on the spot ("New page “X”", `created`: a sub-page of this page). */
  pickPage: (options?: { createFirst?: boolean }) => Promise<{ spaceId: string; created: boolean } | null>;
  /** "Linked view of database" / "Chart": the records the block shows (data/SourcePicker). */
  pickSource: () => Promise<PickedSource | null>;
  /**
   * "Database - Inline" / "Database - Full page" (Notion): a NEW table made in the page's organization.
   * Inline answers the table (a block shows it here); full page answers the sub-page that shows it.
   */
  newDatabase: (fullPage: boolean) => Promise<{ table: PickedSource; pageId?: string } | null>;
  /** "Database with AI" (mandate spaces.design_database): a NEW table designed from the person's words, with its views. */
  designDatabase?: () => Promise<{ table: PickedSource; views: SpaceDbView[] } | null>;
  /** C18 "Synced block": a new synced source Space under this page (its id), or null. */
  createSyncedSource?: () => Promise<string | null>;
}

function stored(type: string, props: Record<string, unknown>): SpacesPartialBlock {
  return { type, props: { data: JSON.stringify({ props }) } } as unknown as SpacesPartialBlock;
}

function databaseBlock(src: PickedSource, view: SpaceDbView | SpaceDbView[], linked: boolean): SpacesPartialBlock {
  const views = Array.isArray(view) ? view : [view];
  return stored("database", {
    source: src.entity ? { kind: "entity", token: src.entity } : { kind: "table", tableId: src.tableId },
    inline: true,
    title: src.name,
    ...(src.sample ? { sample: src.sample } : {}),
    linked,
    views,
    activeViewId: views[0]?.id,
  });
}

/** N1: Notion's Tabs block — two named tabs, each with an empty line to type in. */
function tabsBlock(): SpacesPartialBlock {
  return {
    type: "tabs",
    children: [1, 2].map((n) => ({ type: "tab", props: { name: `Tab ${n}` }, children: [{ type: "paragraph" }] })),
  } as unknown as SpacesPartialBlock;
}

function columns(count: number): SpacesPartialBlock {
  return {
    type: "columnList" as const,
    children: Array.from({ length: count }, () => ({
      type: "column" as const,
      props: { width: 1 / count },
      children: [{ type: "paragraph" as const }],
    })),
  };
}

/**
 * Link to page / `[[` / `[+`: pick a page and link it where the caret was; a page made from the picker
 * ("New page “X”") is this page's sub-page and lands as its page block, ready to open (Notion).
 */
export function linkPageAt(editor: SpacesEditor, ctx: SlashContext, at: string | null, createFirst = false): void {
  void ctx.pickPage({ createFirst }).then((picked) => {
    if (!picked) return;
    insertAtSlash(editor, at, picked.created ? { type: "page", props: { spaceId: picked.spaceId } } : { type: "linkToPage", props: { spaceId: picked.spaceId } });
  });
}

/** "/image" … "/pdf", "/bookmark", "/embed" and the providers: the picker opens under the line, the block lands there. */
function mediaAt(editor: SpacesEditor, kind: MediaKind | "embed" | "bookmark", provider?: EmbedProvider): () => void {
  return () => {
    const at = slashTarget(editor);
    // The "/" menu closes first; the picker opens on the next frame under the line the "/" was on.
    window.requestAnimationFrame(() =>
      openMediaPicker({
        kind,
        provider: provider?.key,
        anchor: blockElement(at),
        onPick: (picked: PickedMedia) => {
          const type = kind === "bookmark" ? "bookmark" : kind;
          insertAtSlash(editor, at, stored(type, { ...picked }));
        },
      }),
    );
  };
}

/** Inline items: open the "@" menu on the caret (Notion's Mention a person / page, Date or reminder). */
function openMentionMenu(editor: SpacesEditor, seed = ""): void {
  window.requestAnimationFrame(() => {
    editor.getExtension(SuggestionMenu)?.openSuggestionMenu("@", { deleteTriggerCharacter: true, ignoreQueryLength: true });
    if (seed) editor.insertInlineContent(seed);
  });
}

export function slashItems(editor: SpacesEditor, ctx: SlashContext): DefaultReactSuggestionItem[] {
  // Every item lands where its "/" was typed — named at the click, inserted by id (slash-insert.ts).
  const set = (block: SpacesPartialBlock) => () => {
    insertAtSlash(editor, slashTarget(editor), block);
  };
  const basic = "Basic blocks";
  const advanced = "Advanced blocks";
  const media = "Media";
  const database = "Database";
  const inline = "Inline";
  const embeds = "Embeds";
  const withSource = (make: (src: PickedSource) => SpacesPartialBlock) => () => {
    const at = slashTarget(editor);
    void ctx.pickSource().then((src) => {
      if (src) insertAtSlash(editor, at, make(src));
    });
  };
  return [
    { title: "Text", subtext: "Just start writing with plain text.", aliases: ["text", "paragraph", "p"], group: basic, icon: <Type size={ICON} />, onItemClick: set({ type: "paragraph" }) },
    { title: "Heading 1", subtext: "Big section heading.", aliases: ["h1", "#", "heading1"], group: basic, icon: <Heading1 size={ICON} />, onItemClick: set({ type: "heading", props: { level: 1 } }) },
    { title: "Heading 2", subtext: "Medium section heading.", aliases: ["h2", "##", "heading2"], group: basic, icon: <Heading2 size={ICON} />, onItemClick: set({ type: "heading", props: { level: 2 } }) },
    { title: "Heading 3", subtext: "Small section heading.", aliases: ["h3", "###", "heading3"], group: basic, icon: <Heading3 size={ICON} />, onItemClick: set({ type: "heading", props: { level: 3 } }) },
    { title: "Heading 4", subtext: "Smallest section heading.", aliases: ["h4", "####", "heading4"], group: basic, icon: <Heading4 size={ICON} />, onItemClick: set({ type: "heading", props: { level: 4 } } as unknown as SpacesPartialBlock) },
    { title: "Bulleted list", subtext: "Create a simple bulleted list.", aliases: ["bullet", "ul", "-"], group: basic, icon: <List size={ICON} />, onItemClick: set({ type: "bulletListItem" }) },
    { title: "Numbered list", subtext: "Create a list with numbering.", aliases: ["numbered", "ol", "1."], group: basic, icon: <ListOrdered size={ICON} />, onItemClick: set({ type: "numberedListItem" }) },
    { title: "To-do list", subtext: "Track tasks with a to-do list.", aliases: ["todo", "checkbox", "[]"], group: basic, icon: <ListChecks size={ICON} />, onItemClick: set({ type: "checkListItem" }) },
    { title: "Toggle list", subtext: "Toggles can hide and show content inside.", aliases: ["toggle", ">"], group: basic, icon: <ListTree size={ICON} />, onItemClick: set({ type: "toggleListItem" }) },
    {
      title: "Page",
      subtext: "Embed a sub-page inside this page.",
      aliases: ["page", "subpage"],
      group: basic,
      icon: <FileText size={ICON} />,
      onItemClick: () => {
        const at = slashTarget(editor);
        void ctx.createSubpage().then((spaceId) => {
          if (spaceId) insertAtSlash(editor, at, { type: "page", props: { spaceId } });
        });
      },
    },
    { title: "Callout", subtext: "Make writing stand out.", aliases: ["callout", "note", "info"], group: basic, icon: <Lightbulb size={ICON} />, onItemClick: set({ type: "callout", props: { icon: "Lightbulb", backgroundColor: "gray" } }) },
    { title: "Quote", subtext: "Capture a quote.", aliases: ["quote", "blockquote", '"'], group: basic, icon: <Quote size={ICON} />, onItemClick: set({ type: "quote" }) },
    {
      title: "Divider",
      subtext: "Visually divide blocks.",
      aliases: ["divider", "hr", "---", "line"],
      group: basic,
      icon: <Minus size={ICON} />,
      onItemClick: set({ type: "divider" }),
    },
    {
      title: "Link to page",
      subtext: "Link to an existing page.",
      aliases: ["link", "linkpage", "mention page"],
      group: basic,
      icon: <Link2 size={ICON} />,
      onItemClick: () => linkPageAt(editor, ctx, slashTarget(editor)),
    },
    { title: "Table", subtext: "Add a simple table to this page.", aliases: ["table", "simple table"], group: basic, icon: <Table2 size={ICON} />, onItemClick: set({ type: "table", content: { type: "tableContent", rows: [{ cells: ["", "", ""] }, { cells: ["", "", ""] }, { cells: ["", "", ""] }] } } as unknown as SpacesPartialBlock) },
    { title: "Table view", subtext: "Show records from a table as a table.", aliases: ["database", "inline", "table view"], group: database, icon: <Table2 size={ICON} />, onItemClick: withSource((s) => databaseBlock(s, { id: newViewId(), name: "Table", layout: "grid" }, false)) },
    { title: "Board view", subtext: "Show records as a board.", aliases: ["board", "kanban"], group: database, icon: <Kanban size={ICON} />, onItemClick: withSource((s) => databaseBlock(s, { id: newViewId(), name: "Board", layout: "kanban" }, false)) },
    {
      title: "Database - Inline",
      subtext: "Add a new database to this page.",
      aliases: ["database", "database inline", "inline", "new table", "table"],
      group: database,
      icon: <Database size={ICON} />,
      onItemClick: () => {
        const at = slashTarget(editor);
        void ctx.newDatabase(false).then((made) => {
          if (made) insertAtSlash(editor, at, databaseBlock(made.table, { id: newViewId(), name: "Table", layout: "grid" }, false));
        });
      },
    },
    {
      title: "Database - Full page",
      subtext: "Add a new database as a sub-page.",
      aliases: ["database", "database full page", "full page", "new table"],
      group: database,
      icon: <Database size={ICON} />,
      onItemClick: () => {
        const at = slashTarget(editor);
        void ctx.newDatabase(true).then((made) => {
          if (made?.pageId) insertAtSlash(editor, at, { type: "page", props: { spaceId: made.pageId } });
        });
      },
    },
    ...(ctx.designDatabase
      ? [
          {
            title: "Database with AI",
            subtext: "Describe what to track; AI designs it.",
            aliases: ["ai database", "database ai", "design database", "ai table"],
            group: database,
            icon: <Database size={ICON} />,
            onItemClick: () => {
              const at = slashTarget(editor);
              void ctx.designDatabase?.().then((made) => {
                if (made) insertAtSlash(editor, at, databaseBlock(made.table, made.views, false));
              });
            },
          },
        ]
      : []),
    { title: "Linked view of database", subtext: "Show a view of an existing database.", aliases: ["linked", "database", "view"], group: database, icon: <Database size={ICON} />, onItemClick: withSource((s) => databaseBlock(s, { id: newViewId(), name: "All", layout: "grid" }, true)) },
    { title: "Chart", subtext: "Chart the records of a database.", aliases: ["chart", "donut", "graph"], group: database, icon: <PieChart size={ICON} />, onItemClick: withSource((s) => databaseBlock(s, { id: newViewId(), name: s.name, layout: "chart", chart: { type: "donut", groupBy: null, op: "count", centerValue: true } }, true)) },
    { title: "Image", subtext: "Upload or embed with a link.", aliases: ["image", "img", "picture", "photo"], group: media, icon: <ImageIcon size={ICON} />, onItemClick: mediaAt(editor, "image") },
    { title: "Bookmark", subtext: "Save a link as a visual bookmark.", aliases: ["bookmark", "link preview", "url"], group: media, icon: <Bookmark size={ICON} />, onItemClick: mediaAt(editor, "bookmark") },
    { title: "Video", subtext: "Embed from YouTube, Vimeo…", aliases: ["video", "youtube", "vimeo", "movie"], group: media, icon: <Video size={ICON} />, onItemClick: mediaAt(editor, "video") },
    { title: "Audio", subtext: "Embed audio from a file or link.", aliases: ["audio", "sound", "music", "mp3"], group: media, icon: <AudioLines size={ICON} />, onItemClick: mediaAt(editor, "audio") },
    { title: "Code", subtext: "Capture a code snippet.", aliases: ["code", "```", "snippet"], group: media, icon: <Code size={ICON} />, onItemClick: set({ type: "codeBlock" }) },
    { title: "File", subtext: "Upload or embed with a link.", aliases: ["file", "attachment", "upload"], group: media, icon: <Paperclip size={ICON} />, onItemClick: mediaAt(editor, "file") },
    { title: "Mention a person", subtext: "Ping someone so they get a notification.", aliases: ["person", "mention", "@", "people", "user"], group: inline, icon: <AtSign size={ICON} />, onItemClick: () => openMentionMenu(editor) },
    { title: "Mention a page", subtext: "Link to a page with a mention.", aliases: ["mention page", "page mention", "@page"], group: inline, icon: <FileText size={ICON} />, onItemClick: () => openMentionMenu(editor) },
    { title: "Date or reminder", subtext: "Add a date or a reminder.", aliases: ["date", "reminder", "remind", "today", "@date"], group: inline, icon: <CalendarDays size={ICON} />, onItemClick: () => openMentionMenu(editor, "today") },
    {
      title: "Inline equation",
      subtext: "Insert a math equation in the line.",
      aliases: ["inline equation", "inline math", "tex", "$"],
      group: inline,
      icon: <SquareFunction size={ICON} />,
      onItemClick: () => editor.insertInlineContent([{ type: "inlineEquation", props: { span: JSON.stringify({ text: "x", equation: "x" }) } }, " "] as never),
    },
    { title: GENERIC_EMBED.title, subtext: GENERIC_EMBED.subtext, aliases: GENERIC_EMBED.aliases, group: embeds, icon: <Globe size={ICON} />, onItemClick: mediaAt(editor, "embed") },
    { title: "PDF", subtext: "Embed a PDF to read in the page.", aliases: ["pdf", "document"], group: embeds, icon: <FileType2 size={ICON} />, onItemClick: mediaAt(editor, "pdf") },
    ...EMBED_PROVIDERS.map((p) => ({ title: p.title, subtext: p.subtext, aliases: p.aliases, group: embeds, icon: <Globe size={ICON} />, onItemClick: mediaAt(editor, "embed", p) })),
    { title: "Table of contents", subtext: "Show an outline of this page.", aliases: ["toc", "contents", "outline"], group: advanced, icon: <ListTree size={ICON} />, onItemClick: set(stored("tableOfContents", {})) },
    { title: "Block equation", subtext: "Display a standalone math equation.", aliases: ["math", "equation", "tex", "latex"], group: advanced, icon: <Sigma size={ICON} />, onItemClick: set(stored("equation", { expression: "E = mc^2" })) },
    { title: "Breadcrumb", subtext: "Show where this page sits.", aliases: ["breadcrumb", "path"], group: advanced, icon: <ChevronRight size={ICON} />, onItemClick: set(stored("breadcrumb", {})) },
    { title: "Toggle heading 1", subtext: "Hide content inside a large heading.", aliases: ["toggleh1", "th1"], group: advanced, icon: <ChevronRight size={ICON} />, onItemClick: set({ type: "heading", props: { level: 1, isToggleable: true } }) },
    { title: "Toggle heading 2", subtext: "Hide content inside a medium heading.", aliases: ["toggleh2", "th2"], group: advanced, icon: <ChevronRight size={ICON} />, onItemClick: set({ type: "heading", props: { level: 2, isToggleable: true } }) },
    { title: "Toggle heading 3", subtext: "Hide content inside a small heading.", aliases: ["toggleh3", "th3"], group: advanced, icon: <ChevronRight size={ICON} />, onItemClick: set({ type: "heading", props: { level: 3, isToggleable: true } }) },
    ...(ctx.createSyncedSource
      ? [
          {
            title: "Synced block",
            subtext: "Sync content across pages.",
            aliases: ["synced", "sync", "synced block"],
            group: advanced,
            icon: <RefreshCw size={ICON} />,
            onItemClick: () => {
              const at = slashTarget(editor);
              void ctx.createSyncedSource!().then((sourceId) => {
                if (sourceId) insertAtSlash(editor, at, stored("synced", { sourceId }));
              });
            },
          },
        ]
      : []),
    { title: "Button", subtext: "Run actions with one click.", aliases: ["button", "action"], group: advanced, icon: <MousePointerClick size={ICON} />, onItemClick: set(stored("button", { label: "New button", actions: [] })) },
    { title: "Tabs", subtext: "Show content in named tabs.", aliases: ["tabs", "tab"], group: advanced, icon: <PanelTop size={ICON} />, onItemClick: set(tabsBlock()) },
    { title: "2 columns", subtext: "Create 2 columns of blocks.", aliases: ["columns", "col2"], group: advanced, icon: <Columns2 size={ICON} />, onItemClick: set(columns(2)) },
    { title: "3 columns", subtext: "Create 3 columns of blocks.", aliases: ["columns", "col3"], group: advanced, icon: <Columns3 size={ICON} />, onItemClick: set(columns(3)) },
    { title: "4 columns", subtext: "Create 4 columns of blocks.", aliases: ["columns", "col4"], group: advanced, icon: <Columns4 size={ICON} />, onItemClick: set(columns(4)) },
    { title: "5 columns", subtext: "Create 5 columns of blocks.", aliases: ["columns", "col5"], group: advanced, icon: <Columns4 size={ICON} />, onItemClick: set(columns(5)) },
  ];
}
