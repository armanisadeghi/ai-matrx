// features/context-menu-v3/regroup/proposed-grouping.ts
//
// THE PROPOSED GROUPING, v2 (2026-09-28, after Arman's review of v1: "we should
// distinguish between a few things better: Copy (as various things), Download
// (becomes some sort of external file), Convert (becomes something different in
// our system…), Action (Publish HTML, etc.)… we still need more categories…
// the more of [sub-menus] we do, the better").
//
// Every submenu is named by its OUTCOME — what the person gets — in one plain
// word. Applied ONLY where a MenuRegroupContext asks for it (the regroup demo);
// no production menu uses it until Arman approves. Plain data over the
// registry's own action ids and categories: the rows themselves come from the
// registry, never from this file.

import {
  ArrowRightLeft,
  Copy,
  Download,
  GitCompareArrows,
  Globe,
  History,
  Pencil,
  Share2,
  Shield,
  Tags,
  ThumbsUp,
  Volume2,
} from "lucide-react";
import { registerAlchemyIcon } from "@ai-matrx/rich-content/utils/alchemy-icon-keys";
import { AGENT_ICON } from "@/components/icons/domain-icons";
import type { MenuGrouping } from "./grouping";

const icon = (c: unknown) => registerAlchemyIcon(c);

export const PROPOSED_MENU_GROUPING: MenuGrouping = {
  name: "v2 — grouped by what you get",
  minMembers: 2,
  // `category` + `order` place each submenu row among the others (the package's
  // group order): Edit, Copy, Download, Convert to, Publish, Share, Organize,
  // History, AI, Read aloud, Compare, Feedback, Admin.
  groups: [
    { key: "edit", label: "Edit", definition: "Change this item where it is: edit, rewrite, open in an editor, run, delete.", icon: icon(Pencil), category: "edit", order: 0 },
    { key: "copy", label: "Copy", definition: "It lands on your clipboard, in the form you pick: text, Markdown, rich text, HTML, a table, JSON, a reference.", icon: icon(Copy), category: "copy", order: 0 },
    { key: "download", label: "Download", definition: "It becomes a file outside the app: Markdown, PDF, Word, HTML — or a printout.", icon: icon(Download), category: "export", order: 0 },
    { key: "convert", label: "Convert to", definition: "It becomes a new thing inside the app: a note, document, task, file, flashcards, quiz, template, contact, data table.", icon: icon(ArrowRightLeft), category: "save", order: 0 },
    { key: "publish", label: "Publish", definition: "It goes out to the world: a public web page or published HTML anyone with the link can open.", icon: icon(Globe), category: "share", order: 0 },
    { key: "share", label: "Share", definition: "It goes to specific people or places: share with someone, send to Google Docs, email it.", icon: icon(Share2), category: "share", order: 1 },
    { key: "organize", label: "Organize", definition: "It stays what it is, but gets filed: attached to a project or context, pinned, annotated.", icon: icon(Tags), category: "history", order: 0 },
    { key: "history", label: "History", definition: "Earlier versions: view the history, fork from a point in it.", icon: icon(History), category: "history", order: 1 },
    { key: "ai", label: "AI", definition: "An AI works on it: ask, chat, run an agent or AI action, regenerate.", icon: icon(AGENT_ICON), category: "ai", order: 0 },
    { key: "listen", label: "Read aloud", definition: "You hear it: read it aloud, a spoken summary, the voice settings.", icon: icon(Volume2), category: "listen", order: 0 },
    { key: "compare", label: "Compare", definition: "You see it side by side with something else: the clipboard or a saved base.", icon: icon(GitCompareArrows), category: "study", order: 0 },
    { key: "feedback", label: "Feedback", definition: "Tell us how it went: thumbs up or down, report a problem.", icon: icon(ThumbsUp), category: "feedback", order: 1 },
    { key: "admin", label: "Admin", definition: "Creator and admin tools: inspect, debug, server-side message surgery. Admins only.", icon: icon(Shield), category: "admin", order: 0 },
  ],
  rules: [
    // ── The page's own rows that DUPLICATE a category (Arman, 2026-09-28: "the
    // more of that we do, the better"): they move into that category, and merge
    // into the universal row that does the same thing when it is in the menu.
    // Only genuinely unique record actions (Open, Take, Duplicate, Move to Trash…)
    // stay at the top.
    { when: { pageOwnLabels: ["^copy( to clipboard)?$"] }, to: { kind: "group", key: "copy" }, mergeWithIds: ["cm:copy", "copy"] },
    { when: { pageOwnLabels: ["^copy\\b"] }, to: { kind: "group", key: "copy" } },
    {
      when: { pageOwnLabels: ["^(export|download)( as)? markdown"] },
      to: { kind: "group", key: "download" },
      mergeWithIds: ["save-as-file"],
    },
    { when: { pageOwnLabels: ["^(export|download)\\b", "^print\\b"] }, to: { kind: "group", key: "download" } },
    { when: { pageOwnLabels: ["^share( link)?…?$"] }, to: { kind: "group", key: "share" }, mergeWithIds: ["cm:share"] },
    { when: { pageOwnLabels: ["^(share|send|email)\\b"] }, to: { kind: "group", key: "share" } },
    { when: { pageOwnLabels: ["^publish\\b"] }, to: { kind: "group", key: "publish" } },
    { when: { pageOwnLabels: ["^(convert|save to|save as|create (a )?(task|note|document))\\b"] }, to: { kind: "group", key: "convert" } },
    { when: { pageOwnLabels: ["^(move to folder|add tags?|tags?|attach)\\b"] }, to: { kind: "group", key: "organize" } },
    { when: { pageOwnLabels: ["^(read aloud|listen)\\b"] }, to: { kind: "group", key: "listen" } },
    { when: { pageOwnLabels: ["^compare\\b"] }, to: { kind: "group", key: "compare" } },
    { when: { pageOwnLabels: ["^save$"] }, to: { kind: "top" }, mergeWithIds: ["cm:save"] },
    // A conversation's own rows, by id (their labels are computed at open).
    {
      when: { ids: ["conversation-copy-plain", "conversation-copy-markdown", "conversation-copy-formatted", "conversation-copy-for-ai", "conversation-copy-link"] },
      to: { kind: "group", key: "copy" },
    },
    { when: { idPrefixes: ["conversation-download-"] }, to: { kind: "group", key: "download" } },
    {
      when: { ids: ["conversation-save-to-notes", "conversation-create-document", "conversation-create-task"] },
      to: { kind: "group", key: "convert" },
    },
    { when: { ids: ["conversation-share", "conversation-email-to-me"] }, to: { kind: "group", key: "share" } },
    { when: { ids: ["conversation-open-in-new-chat"] }, to: { kind: "group", key: "ai" } },
    { when: { ids: ["conversation-rename", "conversation-duplicate"] }, to: { kind: "group", key: "edit" } },

    // The clicked thing's remaining own rows (a quiz row's Open / Take / Archive,
    // a note's Duplicate / Move to Trash) come first, as they are.
    { when: { pageOwn: true }, to: { kind: "page-first" } },
    // The universal verb strip (icons across the top) stays exactly as it is.
    {
      when: { ids: ["cm:copy", "cm:cut", "cm:paste", "cm:undo", "cm:redo", "cm:find", "copy", "cm:select-all"] },
      to: { kind: "top" },
    },
    // Quick Actions is already one submenu of quick tools; the page submenu is last;
    // an editor's own Save / Delete stay one click away.
    { when: { ids: ["cm:quick-actions", "cm:save", "cm:delete"], categories: ["surface-info"] }, to: { kind: "top" } },

    {
      when: {
        ids: ["cm:copy-as", "cm:json", "cm:insert-reference", "copy-html-page", "conversation-copy-link"],
        categories: ["copy"],
      },
      to: { kind: "group", key: "copy" },
    },
    {
      when: { ids: ["cm:export", "save-as-file", "download-pdf", "download-docx", "download-html", "print", "full-print"] },
      to: { kind: "group", key: "download" },
    },
    { when: { ids: ["html-preview", "share-webpage"] }, to: { kind: "group", key: "publish" } },
    {
      when: { ids: ["cm:share", "send-google-doc", "email-to-me", "conversation-share"] },
      to: { kind: "group", key: "share" },
    },
    {
      when: { ids: ["cm:attach", "attach-artifact-to-chat", "set-context-value", "pin-message", "notes-and-comments"] },
      to: { kind: "group", key: "organize" },
    },
    {
      when: { ids: ["cm:view-history", "edit-history", "fork-at-message", "fork-and-regenerate"] },
      to: { kind: "group", key: "history" },
    },
    {
      when: { ids: ["cm:compare", "compare-with-clipboard", "set-compare-base", "compare-with-base"] },
      to: { kind: "group", key: "compare" },
    },
    {
      when: { ids: ["cm:speak", "cm:listen", "tts-voice-settings"], categories: ["listen"] },
      to: { kind: "group", key: "listen" },
    },
    {
      when: {
        ids: ["cm:chat", "regenerate-response", "regenerate-latest", "continue-in-chat", "send-to-agent", "code-block-chart"],
        idPrefixes: ["cm:placement:", "cm:cat:", "cm:agents"],
        categories: ["ai", "ask"],
      },
      to: { kind: "group", key: "ai" },
    },
    {
      when: {
        ids: [
          "edit",
          "edit-and-resubmit",
          "open-fullscreen-editor",
          "delete-message",
          "code-block-open-in-editor",
          "code-block-apply-to-file",
          "code-block-run",
          "replace-selection",
          "insert-below",
          "conversation-rename",
          "conversation-duplicate",
        ],
      },
      to: { kind: "group", key: "edit" },
    },
    { when: { ids: ["thumbs-up", "thumbs-down", "submit-feedback"], categories: ["feedback"] }, to: { kind: "group", key: "feedback" } },
    { when: { ids: ["cm:admin"], categories: ["creator", "admin"] }, to: { kind: "group", key: "admin" } },
    // Everything that makes a new thing in the app — checked after the rows
    // above because the registry files several of them under "save".
    { when: { ids: ["cm:convert", "add-to-rulebook"], categories: ["save", "study", "export"] }, to: { kind: "group", key: "convert" } },
  ],
  // A row no rule names stays at the top level where the package places it —
  // and the demo's Categories section lists it under "No category yet".
  fallback: { kind: "top" },
};
