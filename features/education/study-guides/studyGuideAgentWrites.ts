// features/education/study-guides/studyGuideAgentWrites.ts
//
// Validation for the agent write targets on one study guide
// (`matrx-user/education-study-guide`): `guide_content`, and create / update /
// delete over the two sub-item lists — the person's private highlights and
// notes (`*_personal_notes`) and the shared comment threads
// (`*_guide_comments`). Pure — no React, no store — so every rule is testable
// and each target reads a value one way.
//
// Every problem is a sentence the agent can act on; a list that is partly
// wrong is refused whole, never partly applied, and the refusal lists EVERY
// problem at once (owner ruling 2026-09-27) via `collectProblems`.

import { AnchorBuildError, buildTextAnchor, type TextAnchor } from "@/features/rich-document/annotations/anchor";
import { HIGHLIGHT_COLORS, DEFAULT_HIGHLIGHT_COLOR, type HighlightColor } from "@/features/rich-document/annotations/constants";
import {
  collectProblems,
  ListLevelProblem,
  ProblemList,
  readCollectionList,
  repeatsProblem,
} from "@/features/surfaces/runtime/collection-write-targets";

/** The guide as the parsers need it: its current body and the version anchors name. */
export interface GuideText {
  body: string;
  version: number;
}

/** A saved private highlight / note, as the page holds it. */
export interface CurrentPersonalNote {
  id: string;
  kind: "highlight" | "note";
  quote: string | null;
  note: string;
  color: string;
}

/** A saved comment or reply, as the page holds it. */
export interface CurrentComment {
  id: string;
  /** Null for a thread; the thread's id for a reply. */
  parentId: string | null;
  quote: string | null;
  body: string;
  mine: boolean;
  resolved: boolean;
  version: number | null;
}

const short = (text: string, max = 40) => (text.length > max ? `${text.slice(0, max - 1)}…` : text);

function asObject(where: string, value: unknown, keys: readonly string[]): Record<string, unknown> {
  if (value === null || typeof value !== "object" || Array.isArray(value))
    throw new Error(`${where} must be an object with keys ${keys.join(", ")}; received ${JSON.stringify(value)}.`);
  const record = value as Record<string, unknown>;
  const unknownKeys = Object.keys(record).filter((k) => !keys.includes(k));
  if (unknownKeys.length > 0)
    throw new Error(`${where} does not accept ${unknownKeys.join(", ")}. Allowed keys: ${keys.join(", ")}.`);
  return record;
}

function optionalText(where: string, key: string, raw: unknown): string | undefined {
  if (raw === undefined || raw === null) return undefined;
  if (typeof raw !== "string") throw new Error(`${where}.${key} must be text; received ${JSON.stringify(raw)}.`);
  return raw;
}

function idOf(where: string, entry: unknown): string {
  const id = entry !== null && typeof entry === "object" && !Array.isArray(entry) ? (entry as { id?: unknown }).id : entry;
  if (typeof id !== "string" || !id.trim()) throw new Error(`${where}.id is required.`);
  return id.trim();
}

function parseColor(where: string, raw: unknown): HighlightColor | undefined {
  if (raw === undefined || raw === null) return undefined;
  const color = String(raw).trim().toLowerCase();
  if (!(HIGHLIGHT_COLORS as readonly string[]).includes(color))
    throw new Error(`${where}.color must be one of ${HIGHLIGHT_COLORS.join(", ")}; received ${JSON.stringify(raw)}.`);
  return color as HighlightColor;
}

/**
 * Pin a quote to the guide: it must occur in the body exactly once. Returns
 * the text_anchor the sidecar stores (the same builder a mouse selection uses).
 */
export function anchorForQuote(where: string, quote: string, guide: GuideText): TextAnchor {
  if (!quote.trim()) throw new Error(`${where}.quote cannot be empty; omit it for the whole guide.`);
  const first = guide.body.indexOf(quote);
  if (first < 0)
    throw new Error(
      `${where}.quote "${short(quote)}" is not in the guide's text. Copy it exactly from study_guide.content (the markdown, markup included).`,
    );
  let count = 0;
  for (let at = first; at >= 0; at = guide.body.indexOf(quote, at + 1)) count += 1;
  if (count > 1)
    throw new Error(
      `${where}.quote "${short(quote)}" appears ${count} times in the guide. Add surrounding words so it appears once.`,
    );
  try {
    return buildTextAnchor(guide.body, first, first + quote.length, guide.version);
  } catch (e) {
    throw new Error(`${where}.quote cannot be pinned: ${e instanceof AnchorBuildError ? e.message : String(e)}`);
  }
}

// ─── guide_content ───────────────────────────────────────────────────────────

/** Read the `guide_content` value (the seam has already resolved any anchored edit). */
export function parseGuideContentValue(value: unknown, currentBody: string): string {
  if (typeof value !== "string")
    throw new Error("guide_content expects the guide's complete new markdown body as a string (or an anchored edit).");
  if (!value.trim()) throw new Error("guide_content cannot empty the guide. Send the full new text.");
  if (value === currentBody) throw new Error("guide_content is identical to the guide's current text; nothing to save.");
  return value;
}

// ─── study guides (Notes-backed collection) ────────────────────────────────

export interface CreateStudyGuidePlan {
  title: string;
  content: string;
}

/**
 * The reader can create only ordinary Notes records marked for Education.
 * Keep this parser here with the rest of the page's agent-write validation so
 * manual and agent-created guides receive the same title/body contract.
 */
export function parseCreateStudyGuidesValue(value: unknown): CreateStudyGuidePlan[] {
  const target = "create_study_guides";
  const list = readCollectionList(target, "study guides", value, 10);
  return collectProblems(
    target,
    list,
    (entry, i): CreateStudyGuidePlan => {
      const where = `${target}[${i}]`;
      const record = asObject(where, entry, ["title", "content"]);
      const rawTitle = optionalText(where, "title", record.title);
      const title = rawTitle === undefined ? "" : rawTitle.trim();
      if (!title) throw new Error(`${where}.title is required.`);
      if (/\r|\n/.test(title)) throw new Error(`${where}.title must be a single line.`);
      const content = optionalText(where, "content", record.content);
      return { title, content: content === undefined ? "" : content };
    },
    {
      nameOf: (entry) => rawText(entry, "title"),
      listChecks: (items) => [
        repeatsProblem(target, items.map((item) => (item.ok ? item.value?.title : undefined)), "title"),
      ],
    },
  );
}

export interface DeleteStudyGuidePlan {
  id: string;
  title: string;
}

export interface CurrentStudyGuide {
  id: string;
  title: string;
  version: number;
}

export interface UpdateStudyGuidePlan {
  id: string;
  /** The effective title after this write, used for messages and name stability. */
  title: string;
  version: number;
  content?: string;
  changed: string[];
}

export function parseUpdateStudyGuidesValue(
  value: unknown,
  current: readonly CurrentStudyGuide[],
): UpdateStudyGuidePlan[] {
  const target = "update_study_guides";
  const list = readCollectionList(target, "study guides", value, 10);
  return collectProblems(
    target,
    list,
    (entry, i): UpdateStudyGuidePlan => {
      const where = `${target}[${i}]`;
      const record = asObject(where, entry, ["id", "title", "content"]);
      const id = idOf(where, record);
      const guide = current.find((item) => item.id === id);
      if (!guide) throw new ListLevelProblem(`${where}.id "${id}" is not one of this person's loaded study guides.`);
      const rawTitle = optionalText(where, "title", record.title);
      const title = rawTitle === undefined ? undefined : rawTitle.trim();
      if (title !== undefined && !title) throw new Error(`${where}.title cannot be empty.`);
      if (title !== undefined && /\r|\n/.test(title)) throw new Error(`${where}.title must be a single line.`);
      const content = optionalText(where, "content", record.content);
      const changed = [
        ...(title !== undefined && title !== guide.title ? ["title"] : []),
        ...(content !== undefined ? ["content"] : []),
      ];
      if (changed.length === 0) throw new Error(`${where} changes nothing on "${guide.title}".`);
      return { ...guide, ...(title !== undefined ? { title } : {}), ...(content !== undefined ? { content } : {}), changed };
    },
    { listChecks: (items) => [repeatsProblem(target, items.map((item) => rawId(item.raw)), "id", "Merge the changes into one entry.")] },
  );
}

/** Archive only guides the loaded library identified for this agent run. */
export function parseDeleteStudyGuidesValue(
  value: unknown,
  current: readonly Pick<CurrentStudyGuide, "id" | "title">[],
): DeleteStudyGuidePlan[] {
  const target = "delete_study_guides";
  const list = readCollectionList(target, "study guides", value, 10);
  return collectProblems(
    target,
    list,
    (entry, i): DeleteStudyGuidePlan => {
      const id = idOf(`${target}[${i}]`, entry);
      const guide = current.find((item) => item.id === id);
      if (!guide)
        throw new ListLevelProblem(`${target}[${i}] "${id}" is not one of this person's loaded study guides.`);
      return { id, title: guide.title };
    },
    { listChecks: (items) => [repeatsProblem(target, items.map((item) => rawId(item.raw)), "id")] },
  );
}

// ─── personal notes (private highlights + whole-guide notes) ─────────────────

export interface CreatePersonalNotePlan {
  quote: string | null;
  anchor: TextAnchor | null;
  note: string;
  color: HighlightColor;
}

const PERSONAL_CREATE_KEYS = ["quote", "note", "color"] as const;

/** A raw entry's text field, trimmed, when it is text (labels, repeats). */
function rawText(entry: unknown, key: string): string | undefined {
  if (entry === null || typeof entry !== "object" || Array.isArray(entry)) return undefined;
  const v = (entry as Record<string, unknown>)[key];
  return typeof v === "string" && v.trim() ? v.trim() : undefined;
}

/** A raw entry's id (the entry itself or its `id`), trimmed, when it is text. */
function rawId(entry: unknown): string | undefined {
  const id = entry !== null && typeof entry === "object" && !Array.isArray(entry) ? (entry as { id?: unknown }).id : entry;
  return typeof id === "string" && id.trim() ? id.trim() : undefined;
}

export function parseCreatePersonalNotesValue(
  value: unknown,
  guide: GuideText,
  current: readonly CurrentPersonalNote[],
): CreatePersonalNotePlan[] {
  const target = "create_personal_notes";
  const list = readCollectionList(target, "personal_notes", value);
  return collectProblems(
    target,
    list,
    (entry, i): CreatePersonalNotePlan => {
      const where = `${target}[${i}]`;
      const record = asObject(where, entry, PERSONAL_CREATE_KEYS);
      const problems = new ProblemList(where);
      const quote = problems.check(() => optionalText(where, "quote", record.quote));
      const note = (problems.check(() => optionalText(where, "note", record.note)) ?? "").trim();
      const color = problems.check(() => parseColor(where, record.color)) ?? DEFAULT_HIGHLIGHT_COLOR;
      if (record.quote == null && !note)
        problems.add(`${where} needs a quote (to highlight a passage) or a note (a note on the whole guide).`);
      const anchor = quote === undefined ? null : problems.check(() => anchorForQuote(where, quote, guide));
      problems.throwIfAny();
      return { quote: quote ?? null, anchor: anchor ?? null, note, color };
    },
    {
      nameOf: (entry) => {
        const label = rawText(entry, "quote") ?? rawText(entry, "note");
        return label ? short(label) : undefined;
      },
      listChecks: (items) => {
        const out: (string | undefined)[] = [
          repeatsProblem(target, items.map((it) => (it.ok && it.value!.quote ? it.value!.quote : undefined)), "quote"),
          repeatsProblem(target, items.map((it) => (it.ok && !it.value!.quote ? it.value!.note : undefined)), "whole-guide note"),
        ];
        for (const it of items) {
          if (!it.ok) continue;
          const plan = it.value!;
          const clash = plan.quote
            ? current.find((c) => c.kind === "highlight" && c.quote === plan.quote)
            : current.find((c) => c.kind === "note" && c.note.trim() === plan.note);
          if (clash)
            out.push(
              plan.quote
                ? `${target}[${it.index}]: the person already highlighted "${short(plan.quote)}" (id ${clash.id}). Change it with update_personal_notes instead.`
                : `${target}[${it.index}]: the person already has that note (id ${clash.id}).`,
            );
        }
        return out;
      },
    },
  );
}

export interface UpdatePersonalNotePlan {
  id: string;
  name: string;
  note?: string;
  color?: HighlightColor;
  changed: string[];
}

export function parseUpdatePersonalNotesValue(
  value: unknown,
  current: readonly CurrentPersonalNote[],
): UpdatePersonalNotePlan[] {
  const target = "update_personal_notes";
  const list = readCollectionList(target, "personal_notes", value);
  return collectProblems(
    target,
    list,
    (entry, i): UpdatePersonalNotePlan => {
      const where = `${target}[${i}]`;
      const record = asObject(where, entry, ["id", "note", "color"]);
      const id = idOf(where, record);
      const item = current.find((c) => c.id === id);
      if (!item)
        throw new ListLevelProblem(
          `${where}.id "${id}" is not one of the person's highlights or notes on this guide (see personal_annotations).`,
        );
      const problems = new ProblemList(where);
      const note = problems.check(() => optionalText(where, "note", record.note));
      const color = problems.check(() => parseColor(where, record.color));
      if (color !== undefined && item.kind !== "highlight")
        problems.add(`${where} sets a color, but ${id} is a whole-guide note; only highlights have a color.`);
      if (note !== undefined && item.kind === "note" && !note.trim())
        problems.add(`${where} would empty a whole-guide note; remove it with delete_personal_notes instead.`);
      problems.throwIfAny();
      const changed = [
        ...(note !== undefined && note.trim() !== item.note.trim() ? ["note"] : []),
        ...(color !== undefined && color !== item.color ? ["color"] : []),
      ];
      if (changed.length === 0) throw new Error(`${where} changes nothing on ${id}: send a different note or color.`);
      return {
        id,
        name: item.quote ? `highlight "${short(item.quote)}"` : `note "${short(item.note)}"`,
        ...(changed.includes("note") ? { note: note!.trim() } : {}),
        ...(changed.includes("color") ? { color } : {}),
        changed,
      };
    },
    { listChecks: (items) => [repeatsProblem(target, items.map((it) => rawId(it.raw)), "id", "Merge the changes into one entry.")] },
  );
}

export function parseDeletePersonalNotesValue(
  value: unknown,
  current: readonly CurrentPersonalNote[],
): CurrentPersonalNote[] {
  const target = "delete_personal_notes";
  const list = readCollectionList(target, "personal_notes", value);
  return collectProblems(
    target,
    list,
    (entry, i) => {
      const id = idOf(`${target}[${i}]`, entry);
      const item = current.find((c) => c.id === id);
      if (!item)
        throw new ListLevelProblem(`${target}[${i}] "${id}" is not one of the person's highlights or notes on this guide.`);
      return item;
    },
    { listChecks: (items) => [repeatsProblem(target, items.map((it) => rawId(it.raw)), "id")] },
  );
}

// ─── comments (shared threads, replies, suggestions) ─────────────────────────

export interface CreateCommentPlan {
  body: string;
  quote: string | null;
  anchor: TextAnchor | null;
  suggestedText: string | null;
  parentId: string | null;
}

const COMMENT_CREATE_KEYS = ["body", "quote", "suggested_text", "reply_to"] as const;

export function parseCreateGuideCommentsValue(
  value: unknown,
  guide: GuideText,
  current: readonly CurrentComment[],
): CreateCommentPlan[] {
  const target = "create_guide_comments";
  const list = readCollectionList(target, "guide_comments", value);
  return collectProblems(
    target,
    list,
    (entry, i): CreateCommentPlan => {
      const where = `${target}[${i}]`;
      const record = asObject(where, entry, COMMENT_CREATE_KEYS);
      const problems = new ProblemList(where);
      const body = (problems.check(() => optionalText(where, "body", record.body)) ?? "").trim();
      if (!body && (record.body == null || typeof record.body === "string"))
        problems.add(`${where}.body is required: the comment's text.`);
      const quote = problems.check(() => optionalText(where, "quote", record.quote));
      const suggested = problems.check(() => optionalText(where, "suggested_text", record.suggested_text));
      const replyTo = problems.check(() => optionalText(where, "reply_to", record.reply_to))?.trim();
      if (replyTo !== undefined) {
        const thread = current.find((c) => c.id === replyTo);
        if (!thread) problems.add(`${where}.reply_to "${replyTo}" is not a comment thread on this guide (see guide_comments).`);
        else if (thread.parentId)
          problems.add(`${where}.reply_to "${replyTo}" is a reply; reply to its thread ${thread.parentId} instead.`);
        if (quote !== undefined || suggested !== undefined)
          problems.add(`${where} is a reply, so it takes only body (a reply sits under its thread's passage).`);
        problems.throwIfAny();
        return { body, quote: null, anchor: null, suggestedText: null, parentId: replyTo };
      }
      if (suggested !== undefined && quote === undefined && record.quote == null)
        problems.add(`${where}.suggested_text replaces a passage, so it needs quote (the exact text it replaces).`);
      const anchor = quote === undefined ? null : problems.check(() => anchorForQuote(where, quote, guide));
      problems.throwIfAny();
      return {
        body,
        quote: quote ?? null,
        anchor: anchor ?? null,
        suggestedText: suggested ?? null,
        parentId: null,
      };
    },
    {
      nameOf: (entry) => {
        const body = rawText(entry, "body");
        return body ? short(body) : undefined;
      },
      listChecks: (items) => {
        const out: (string | undefined)[] = [
          repeatsProblem(
            target,
            items.map((it) => (it.ok ? `${it.value!.parentId ?? ""}|${it.value!.quote ?? ""}|${it.value!.body}` : undefined)),
            "comment",
          ),
        ];
        for (const it of items) {
          if (!it.ok) continue;
          const plan = it.value!;
          const dup = current.find(
            (c) => c.mine && c.body.trim() === plan.body && (c.parentId ?? null) === plan.parentId && (c.quote ?? null) === plan.quote,
          );
          if (dup) out.push(`${target}[${it.index}]: the person already posted "${short(plan.body)}" here (id ${dup.id}).`);
        }
        return out;
      },
    },
  );
}

export interface UpdateCommentPlan {
  id: string;
  name: string;
  body?: string;
  base: { body: string; version: number | null };
  resolved?: boolean;
  changed: string[];
}

export function parseUpdateGuideCommentsValue(
  value: unknown,
  current: readonly CurrentComment[],
): UpdateCommentPlan[] {
  const target = "update_guide_comments";
  const list = readCollectionList(target, "guide_comments", value);
  return collectProblems(
    target,
    list,
    (entry, i): UpdateCommentPlan => {
      const where = `${target}[${i}]`;
      const record = asObject(where, entry, ["id", "body", "resolved"]);
      const id = idOf(where, record);
      const item = current.find((c) => c.id === id);
      if (!item) throw new ListLevelProblem(`${where}.id "${id}" is not a comment on this guide (see guide_comments).`);
      const problems = new ProblemList(where);
      const body = problems.check(() => optionalText(where, "body", record.body))?.trim();
      const resolved = record.resolved;
      if (resolved !== undefined && resolved !== null && typeof resolved !== "boolean")
        problems.add(`${where}.resolved must be true (resolve the thread) or false (reopen it).`);
      if (body !== undefined && !item.mine)
        problems.add(`${where} edits a comment someone else wrote; only the person's own comments (mine: true) can be edited.`);
      if (body !== undefined && !body) problems.add(`${where}.body cannot be empty; delete the comment instead.`);
      if (typeof resolved === "boolean" && item.parentId)
        problems.add(`${where} resolves a reply; resolve its thread ${item.parentId} instead.`);
      problems.throwIfAny();
      const changed = [
        ...(body !== undefined && body !== item.body.trim() ? ["body"] : []),
        ...(typeof resolved === "boolean" && resolved !== item.resolved ? ["resolved"] : []),
      ];
      if (changed.length === 0) throw new Error(`${where} changes nothing on ${id}: send a different body or resolved state.`);
      return {
        id,
        name: `comment "${short(item.body)}"`,
        ...(changed.includes("body") ? { body } : {}),
        ...(changed.includes("resolved") ? { resolved: resolved as boolean } : {}),
        base: { body: item.body, version: item.version },
        changed,
      };
    },
    { listChecks: (items) => [repeatsProblem(target, items.map((it) => rawId(it.raw)), "id", "Merge the changes into one entry.")] },
  );
}

export function parseDeleteGuideCommentsValue(
  value: unknown,
  current: readonly CurrentComment[],
): CurrentComment[] {
  const target = "delete_guide_comments";
  const list = readCollectionList(target, "guide_comments", value);
  return collectProblems(
    target,
    list,
    (entry, i) => {
      const id = idOf(`${target}[${i}]`, entry);
      const item = current.find((c) => c.id === id);
      if (!item) throw new ListLevelProblem(`${target}[${i}] "${id}" is not a comment on this guide.`);
      if (!item.mine)
        throw new Error(`${target}[${i}] "${id}" was written by someone else; only the person's own comments can be deleted.`);
      return item;
    },
    { listChecks: (items) => [repeatsProblem(target, items.map((it) => rawId(it.raw)), "id")] },
  );
}
