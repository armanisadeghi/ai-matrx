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

/** "Use template": a new board in the organization, from a built-in or a saved template. */
export async function makeBoardFromTemplate(key: string, organizationId: string | null, title: string): Promise<LoadedBoard> {
  const builtin = builtinTemplateByKey(key);
  if (builtin) return createBoardFromDocument({ organizationId, title, doc: builtin.build() });
  // A saved template is a board: its notes and documents are the AUTHOR'S records, so the copy gets clones of them
  // (`clone-content.ts` holds the per-type ruling), never the same records.
  return duplicateBoard(key, { title, cloneContent: (doc) => cloneBoardContent(doc) });
}
