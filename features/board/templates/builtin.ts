/**
 * BUILT-IN BOARD TEMPLATES (SI-13) — owned by the platform, shipped in code the way the Traveling SMM OS
 * sample is for pages (not a user's saved board, so nothing to delete or lose). Each is a factory returning a
 * fresh BoardDocument, so every use gets its own tile ids and its own notes: a note tile with a `seed` creates
 * its own Note the first time it opens, and a chat tile with no id starts its own conversation.
 *
 * A person's own saved templates (a board labeled `template`, `features/spaces/state/templates.ts`) are listed
 * beside these in the same gallery.
 *
 * TODO(social tiles): when the social lane's tiles land (post, profile, video), swap the "post" / "video" /
 * "competitor" notes below for them; the wiring (lines) and layout stay.
 */

import type { BoardDocument, BoardEdge, BoardGroup, BoardNode } from "../board/document";

export const BUILTIN_PREFIX = "builtin:";

export interface BuiltinBoardTemplate {
  /** Gallery key, `builtin:<id>`; also what a preset's `starter` names. */
  key: string;
  title: string;
  /** One line under the title in the picker. */
  summary: string;
  build: () => BoardDocument;
}

const uid = () => crypto.randomUUID();

type Rect = { x: number; y: number; w: number; h: number };

const note = (title: string, rect: Rect, seed: string): BoardNode => ({
  id: uid(),
  rect,
  title,
  source: { kind: "entity", entity: "note", id: null, meta: { seed } },
});
const chat = (title: string, rect: Rect): BoardNode => ({
  id: uid(),
  rect,
  title,
  source: { kind: "entity", entity: "chat", id: null },
});
const writeUp = (title: string, rect: Rect, markdown: string): BoardNode => ({
  id: uid(),
  rect,
  title,
  source: { kind: "text", markdown },
});
const frame = (title: string, rect: Rect, noteText?: string): BoardGroup => ({ id: uid(), rect, title, ...(noteText ? { note: noteText } : {}) });
const line = (from: BoardNode, to: BoardNode): BoardEdge => ({ id: uid(), from: from.id, to: to.id });

function doc(nodes: BoardNode[], groups: BoardGroup[], edges: BoardEdge[]): BoardDocument {
  return { camera: { x: 0, y: 0, z: 0.6 }, nodes, groups, edges, shapes: [] };
}

const COL = { note: { w: 460, h: 420 }, chat: { w: 520, h: 640 }, small: { w: 460, h: 300 } };

function viralBreakdown(): BoardDocument {
  const post = note("The post", { x: 0, y: 0, ...COL.note }, "Paste the post here: its link, the caption, and the numbers you can see (views, likes, comments, shares).");
  const talk = chat("Break it down", { x: 560, y: 0, ...COL.chat });
  const why = note(
    "Why it worked",
    { x: 1180, y: 0, ...COL.note },
    "Hook (first 3 seconds):\n\nStructure:\n\nWhat made people share it:\n\nWhat I can borrow, in my own voice:\n",
  );
  const guide = writeUp("How to use this board", { x: 0, y: 500, ...COL.small }, "1. Paste the post on the left.\n2. Ask the chat to break down the hook, structure and why it spread. The line from the post gives the chat that note.\n3. Keep what you will borrow in the last note.");
  return doc([post, talk, why, guide], [frame("Viral breakdown", { x: -40, y: -80, w: 1740, h: 800 })], [line(post, talk), line(talk, why)]);
}

function repurposeVideo(): BoardDocument {
  const video = note("The long video", { x: 0, y: 0, ...COL.note }, "Paste the video link and its transcript here.");
  const talk = chat("Find the clips", { x: 560, y: 0, ...COL.chat });
  const shorts = [1, 2, 3].map((n, i) =>
    note(`Short ${n}`, { x: 1180, y: i * 340, w: 460, h: 300 }, `Clip ${n}\nStart and end:\nHook line:\nCaption:\n`),
  );
  const nodes = [video, talk, ...shorts];
  return doc(nodes, [frame("One long video, three shorts", { x: -40, y: -80, w: 1740, h: 1120 })], [line(video, talk), ...shorts.map((s) => line(talk, s))]);
}

function swipeFile(): BoardDocument {
  const who = note("Competitors", { x: 0, y: 0, ...COL.note }, "List the accounts you are watching, one per line, with their link and what they are known for.");
  const talk = chat("What are they doing?", { x: 560, y: 0, ...COL.chat });
  const swipe = note("Swipe file", { x: 1180, y: 0, ...COL.note }, "Posts worth keeping (link, why it stands out):\n\n");
  const patterns = note("Patterns to steal", { x: 1180, y: 500, ...COL.small }, "Formats that keep working:\n\nHooks that keep working:\n\nWhat nobody is doing yet:\n");
  return doc([who, talk, swipe, patterns], [frame("Competitor swipe file", { x: -40, y: -80, w: 1740, h: 900 })], [line(who, talk), line(talk, swipe), line(talk, patterns)]);
}

export const BUILTIN_BOARD_TEMPLATES: readonly BuiltinBoardTemplate[] = [
  { key: `${BUILTIN_PREFIX}viral-breakdown`, title: "Viral breakdown", summary: "Paste a post, ask why it spread, keep what you will borrow.", build: viralBreakdown },
  { key: `${BUILTIN_PREFIX}repurpose-video`, title: "Repurpose one long video into shorts", summary: "One video in, a chat to find the clips, three shorts out.", build: repurposeVideo },
  { key: `${BUILTIN_PREFIX}competitor-swipe-file`, title: "Competitor swipe file", summary: "Who you watch, what they do, the patterns worth stealing.", build: swipeFile },
];

export function builtinTemplateByKey(key: string): BuiltinBoardTemplate | undefined {
  return BUILTIN_BOARD_TEMPLATES.find((t) => t.key === key);
}
