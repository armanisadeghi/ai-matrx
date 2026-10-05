"use client";

// features/spaces/editor/slash-items.tsx — the "/" menu, in Notion's order and groups (B4).
//
// Only blocks that work today are listed (a phase-2 block appears when it is built). Notion's Media,
// Database, Inline and Embed groups arrive with phase 2/3.

import { insertOrUpdateBlockForSlashMenu } from "@blocknote/core";
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
} from "lucide-react";

import type { SpacesEditor } from "./schema";

const ICON = 18;

type SpacesPartialBlock = Parameters<SpacesEditor["insertBlocks"]>[0][number];

export interface SlashContext {
  createSubpage: () => Promise<string | null>;
  pickPage: () => Promise<string | null>;
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

export function slashItems(editor: SpacesEditor, ctx: SlashContext): DefaultReactSuggestionItem[] {
  const set = (block: SpacesPartialBlock) => () => {
    insertOrUpdateBlockForSlashMenu(editor, block);
  };
  const basic = "Basic blocks";
  const advanced = "Advanced blocks";
  const media = "Media";
  return [
    { title: "Text", subtext: "Just start writing with plain text.", aliases: ["text", "paragraph", "p"], group: basic, icon: <Type size={ICON} />, onItemClick: set({ type: "paragraph" }) },
    { title: "Heading 1", subtext: "Big section heading.", aliases: ["h1", "#", "heading1"], group: basic, icon: <Heading1 size={ICON} />, onItemClick: set({ type: "heading", props: { level: 1 } }) },
    { title: "Heading 2", subtext: "Medium section heading.", aliases: ["h2", "##", "heading2"], group: basic, icon: <Heading2 size={ICON} />, onItemClick: set({ type: "heading", props: { level: 2 } }) },
    { title: "Heading 3", subtext: "Small section heading.", aliases: ["h3", "###", "heading3"], group: basic, icon: <Heading3 size={ICON} />, onItemClick: set({ type: "heading", props: { level: 3 } }) },
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
        void ctx.createSubpage().then((spaceId) => {
          if (spaceId) insertOrUpdateBlockForSlashMenu(editor, { type: "page", props: { spaceId } });
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
      onItemClick: () => {
        void ctx.pickPage().then((spaceId) => {
          if (spaceId) insertOrUpdateBlockForSlashMenu(editor, { type: "linkToPage", props: { spaceId } });
        });
      },
    },
    { title: "Code", subtext: "Capture a code snippet.", aliases: ["code", "```", "snippet"], group: media, icon: <Code size={ICON} />, onItemClick: set({ type: "codeBlock" }) },
    { title: "Toggle heading 1", subtext: "Hide content inside a large heading.", aliases: ["toggleh1", "th1"], group: advanced, icon: <ChevronRight size={ICON} />, onItemClick: set({ type: "heading", props: { level: 1, isToggleable: true } }) },
    { title: "Toggle heading 2", subtext: "Hide content inside a medium heading.", aliases: ["toggleh2", "th2"], group: advanced, icon: <ChevronRight size={ICON} />, onItemClick: set({ type: "heading", props: { level: 2, isToggleable: true } }) },
    { title: "Toggle heading 3", subtext: "Hide content inside a small heading.", aliases: ["toggleh3", "th3"], group: advanced, icon: <ChevronRight size={ICON} />, onItemClick: set({ type: "heading", props: { level: 3, isToggleable: true } }) },
    { title: "2 columns", subtext: "Create 2 columns of blocks.", aliases: ["columns", "col2"], group: advanced, icon: <Columns2 size={ICON} />, onItemClick: set(columns(2)) },
    { title: "3 columns", subtext: "Create 3 columns of blocks.", aliases: ["columns", "col3"], group: advanced, icon: <Columns3 size={ICON} />, onItemClick: set(columns(3)) },
    { title: "4 columns", subtext: "Create 4 columns of blocks.", aliases: ["columns", "col4"], group: advanced, icon: <Columns4 size={ICON} />, onItemClick: set(columns(4)) },
    { title: "5 columns", subtext: "Create 5 columns of blocks.", aliases: ["columns", "col5"], group: advanced, icon: <Columns4 size={ICON} />, onItemClick: set(columns(5)) },
  ];
}
