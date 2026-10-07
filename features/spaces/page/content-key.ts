// features/spaces/page/content-key.ts — when a page's body counts as changed (and so is saved).

import type { SpaceBlock, SpaceDoc } from "../contract";

const plain = (blk: SpaceBlock) => (blk.text ?? []).map((x) => x.text).join("");

/** A page body with nothing in it: no blocks, or only empty text lines (the editor's starting line). */
export function isBlankBody(blocks: SpaceBlock[] | undefined): boolean {
  return (blocks ?? []).every((blk) => blk.type === "text" && !blk.children?.length && plain(blk) === "");
}

/** What a save writes, as one comparable string: a save whose content is already stored is skipped.
 *  A body of only empty lines is the same as no body: the editor's starting line on a page stored with
 *  no blocks is not a change (opening a page never writes a version — it would refuse the write of
 *  whoever is filling that page, e.g. the sample being added). */
export const contentKey = (d: Pick<SpaceDoc, "title" | "icon" | "cover" | "settings" | "blocks">) =>
  JSON.stringify([d.title, d.icon ?? null, d.cover ?? null, d.settings, isBlankBody(d.blocks) ? [] : d.blocks], skipPaintedSize);

/** A database block's `paintedSize` (database-host.tsx) rides along with a save; it never makes one. */
function skipPaintedSize(key: string, value: unknown): unknown {
  return key === "paintedSize" ? undefined : value;
}
