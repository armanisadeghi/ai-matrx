// features/spaces/page/unsaved.ts — a save that does not land never loses what the person wrote.
//
// The page as the person sees it is kept on this device (per page) whenever a save is refused or fails,
// and while the page is left with changes still waiting; a successful save clears it. On the next open
// a kept copy newer than what is stored is put back ("Unsaved changes restored"). A snapshot this
// editor can already tell the database would refuse is never sent: the person is told what is wrong in
// plain words and the edits stay in the editor (and on the device) until the next change saves them.

import { validateSnapshot } from "@/lib/spaces-blocks/schema";

import type { SpaceDoc } from "../contract";
import { contentKey } from "./content-key";

type Body = Pick<SpaceDoc, "title" | "icon" | "cover" | "settings" | "blocks" | "properties">;

/** One kept copy: the page body and the stored version it was edited from. */
export interface UnsavedCopy {
  v: 1;
  spaceId: string;
  baseVersion: number;
  keptAt: number;
  doc: Body;
}

/** The slice of Storage used (localStorage in the app, a map in tests). */
export type KeepStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const key = (spaceId: string) => `spaces:unsaved:${spaceId}`;

export function deviceStorage(): KeepStorage | null {
  try {
    return typeof window !== "undefined" ? window.localStorage : null;
  } catch {
    return null;
  }
}

export function keepUnsaved(storage: KeepStorage | null, spaceId: string, doc: Body, baseVersion: number): void {
  if (!storage) return;
  const copy: UnsavedCopy = { v: 1, spaceId, baseVersion, keptAt: Date.now(), doc: { title: doc.title, icon: doc.icon, cover: doc.cover, settings: doc.settings, properties: doc.properties, blocks: doc.blocks } };
  try {
    storage.setItem(key(spaceId), JSON.stringify(copy));
  } catch {
    // Storage full or blocked: the edits are still in the editor and the room.
  }
}

export function readUnsaved(storage: KeepStorage | null, spaceId: string): UnsavedCopy | null {
  if (!storage) return null;
  try {
    const raw = storage.getItem(key(spaceId));
    if (!raw) return null;
    const copy = JSON.parse(raw) as UnsavedCopy;
    return copy && copy.v === 1 && copy.spaceId === spaceId && Array.isArray(copy.doc?.blocks) ? copy : null;
  } catch {
    return null;
  }
}

export function forgetUnsaved(storage: KeepStorage | null, spaceId: string): void {
  try {
    storage?.removeItem(key(spaceId));
  } catch {
    // nothing to clear
  }
}

const wroteKey = (spaceId: string) => `spaces:wrote:${spaceId}`;

/** This device stored `version` of the page (a save it made landed). */
export function noteWritten(storage: KeepStorage | null, spaceId: string, version: number): void {
  try {
    storage?.setItem(wroteKey(spaceId), String(version));
  } catch {
    // Storage blocked: a kept copy older than the stored version is then offered, never applied.
  }
}

/** The newest version of the page this device stored itself (null: none known). */
export function wroteVersion(storage: KeepStorage | null, spaceId: string): number | null {
  try {
    const v = Number(storage?.getItem(wroteKey(spaceId)));
    return Number.isFinite(v) && v > 0 ? v : null;
  } catch {
    return null;
  }
}

/**
 * A change is kept on this device the moment it is made when this member made it (a typed title, a
 * cover, a block), when this member is the host (it writes everyone's), or when a copy is already kept.
 * A change only a peer made is in the room and the peer's own device.
 */
export function keepsChange(args: { local: boolean; host: boolean; keptLocally: boolean }): boolean {
  return args.local || args.host || args.keptLocally;
}

/**
 * What to do with a kept copy when the page opens:
 *   forget — it is what is stored (the last save, or the save sent as the tab closed, landed);
 *   apply  — it is newer than what is stored: put it back without a word. That is so when it was edited
 *            from the stored version, or when the stored version is one this device wrote itself (a save
 *            that landed while later edits were still waiting);
 *   ask    — someone else stored a newer version since: offer it, never overwrite theirs.
 */
export function restoreDecision(args: {
  copy: UnsavedCopy;
  /** The stored page: its content key (page/content-key.ts) and version. */
  stored: { key: string; version: number };
  wrote: number | null;
}): "forget" | "apply" | "ask" {
  const { copy, stored, wrote } = args;
  if (contentKey(copy.doc) === stored.key) return "forget";
  if (copy.baseVersion >= stored.version) return "apply";
  if (wrote !== null && stored.version <= wrote) return "apply";
  return "ask";
}

/** What the database would refuse in this body (BLOCK-SCHEMA's rules, mirrored by validateSnapshot). */
export function snapshotProblems(doc: Body): string[] {
  return validateSnapshot({ v: 1, icon: doc.icon ?? null, cover: doc.cover ?? null, settings: doc.settings, ...(doc.properties?.length ? { properties: doc.properties } : {}), blocks: doc.blocks });
}

/** A refusal (ours or the database's) in plain words. */
export function plainSaveError(detail: string): string {
  const kept = "Your changes are kept here.";
  if (/column/i.test(detail)) return `Not saved: these columns can't be stored as they are. ${kept}`;
  if (/used twice/i.test(detail)) return `Not saved: two blocks on this page share one id. ${kept}`;
  if (/not a valid snapshot|is not a stored block type|carries no text|holds no children|must be/i.test(detail)) return `Not saved: a block on this page can't be stored as it is. ${kept}`;
  return detail ? `Not saved: ${detail.replace(/\.$/, "")}. ${kept}` : `We couldn't save this page. ${kept}`;
}

export type SaveAttempt = { ok: true; saved: SpaceDoc } | { ok: false; refused: boolean; message: string; error: unknown };

/**
 * One save: a body the database would refuse is not sent; a refusal or failure keeps the body on this
 * device; a stored save clears it. `refused` = it will be refused again until the page changes.
 */
export async function attemptSave(args: {
  spaceId: string;
  doc: SpaceDoc;
  baseVersion: number;
  storage: KeepStorage | null;
  save: (doc: SpaceDoc, baseVersion: number) => Promise<SpaceDoc>;
}): Promise<SaveAttempt> {
  const { spaceId, doc, baseVersion, storage } = args;
  const problems = snapshotProblems(doc);
  if (problems.length) {
    keepUnsaved(storage, spaceId, doc, baseVersion);
    return { ok: false, refused: true, message: plainSaveError(problems[0]), error: new Error(problems.join("\n")) };
  }
  try {
    const saved = await args.save(doc, baseVersion);
    forgetUnsaved(storage, spaceId);
    return { ok: true, saved };
  } catch (error) {
    keepUnsaved(storage, spaceId, doc, baseVersion);
    // The database's refusal (22023 "not a valid snapshot: …") can arrive as a plain error object.
    const raw = error instanceof Error ? error.message : error && typeof error === "object" && "message" in error ? String((error as { message: unknown }).message) : "";
    const refused = /not a valid snapshot/i.test(raw);
    return { ok: false, refused, message: refused ? plainSaveError(raw) : plainSaveError(raw || ""), error };
  }
}
