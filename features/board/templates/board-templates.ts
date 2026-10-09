/**
 * BOARD TEMPLATES (SI-13) on the SAME mechanism as page templates: a board is labeled through a `labeled`
 * association to the `document_label`/`template` category (`features/spaces/state/templates.ts`, source
 * `board`); "Use template" is `duplicateBoard`. Built-in templates (`builtin.ts`) ship from code.
 */

import { listTemplateIds, setTemplate } from "@/features/spaces/state/templates";
import {
  createBoardFromDocument,
  duplicateBoard,
  getBoardsByIds,
  type LoadedBoard,
} from "../persistence/boardsService";
import type { JsonObject } from "@/types/json";
import { cloneBoardContent } from "./clone-content";
import { BUILTIN_BOARD_TEMPLATES, builtinTemplateByKey } from "./builtin";
import type { BoardDocument } from "../board/document";

export interface BoardTemplateEntry {
  /** `builtin:<id>` or the saved board's id. */
  key: string;
  title: string;
  builtin: boolean;
  /** The tiles to preview. */
  doc: BoardDocument;
}

/** Built-in templates first, then the person's saved ones (boards labeled `template` that they can read). */
export async function listBoardTemplates(): Promise<BoardTemplateEntry[]> {
  const builtin: BoardTemplateEntry[] = BUILTIN_BOARD_TEMPLATES.map((t) => ({ key: t.key, title: t.title, builtin: true, doc: t.build() }));
  const ids = await listTemplateIds("board");
  const saved = (await getBoardsByIds(ids)).map((b) => ({ key: b.id, title: b.title, builtin: false, doc: b.doc }));
  return [...builtin, ...saved];
}

export function isBoardTemplate(templateIds: readonly string[] | null, boardId: string): boolean {
  return !!templateIds && templateIds.includes(boardId);
}

export const saveBoardAsTemplate = (boardId: string, on: boolean) => setTemplate(boardId, on, "board");

/**
 * The default name of a board made from a template: "<template name> — <date>", so a copy never reads
 * like the original (or like a brand's Studio) in a list or a picker.
 */
export function templateBoardTitle(templateTitle: string, now: Date = new Date()): string {
  const date = now.toLocaleDateString("en-US", { month: "short", day: "numeric" });
  return `${templateTitle.trim() || "Board"} — ${date}`;
}

/** "Use template": a new board in the organization, from a built-in or a saved template. */
export async function makeBoardFromTemplate(
  key: string,
  organizationId: string | null,
  title: string,
  settings?: JsonObject,
  /** Built-in templates only: adds to the fresh document before it is stored (the Studio adds the brand's own accounts). */
  extend?: (doc: BoardDocument) => BoardDocument,
): Promise<LoadedBoard> {
  const builtin = builtinTemplateByKey(key);
  if (builtin) {
    const doc = builtin.build();
    return createBoardFromDocument({ organizationId, title, doc: extend ? extend(doc) : doc, settings });
  }
  // A saved template is a board: its notes and documents are the AUTHOR'S records, so the copy gets clones of them
  // (`clone-content.ts` holds the per-type ruling), never the same records.
  return duplicateBoard(key, { title, dropBrand: true, cloneContent: (doc) => cloneBoardContent(doc) });
}
