/**
 * Mending a Studio board that was made before a starter owned its notes: a note tile whose note is not there
 * (filed in another organization, or never filed) is given a fresh note from the starter's words (the tile files
 * it when it opens, in the board's organization), or - when the starter has no such tile - is taken off the board
 * with its lines. Pure core + one async wrapper that reads the board, checks the notes, and saves the mend.
 */

import type { BoardDocument } from "@/features/board/board/document";
import { builtinTemplateByKey } from "@/features/board/templates/builtin";
import { noteLabelFromText, noteSeed } from "@/features/board/items/work-sources";
import { getBoard, saveBoardDocument } from "@/features/board/persistence/boardsService";
import { STUDIO_STARTER_TEMPLATE } from "./studio-boards";
import { withAccountTiles } from "./studio-starter";
import type { AccountTileSeed } from "../board-accounts";

/**
 * The words each starter note tile begins with, by tile name - and by the name the tile took from the OLD seed's
 * first line (a tile used to be renamed after "Hook (first 3 seconds):"), so a board made then is still recognised.
 */
export type StarterNote = { title: string; seed: string };

function starterSeeds(): Map<string, StarterNote> {
  const out = new Map<string, StarterNote>();
  const built = builtinTemplateByKey(STUDIO_STARTER_TEMPLATE)?.build();
  for (const n of built?.nodes ?? []) {
    const seed = noteSeed(n.source);
    if (!seed) continue;
    const held = { title: n.title, seed };
    out.set(noteLabelFromText(n.title), held);
    const legacy = seed.split("\n").map((l) => l.trim()).filter(Boolean)[1];
    if (legacy) out.set(noteLabelFromText(legacy), held);
  }
  return out;
}

export function repairDanglingNotes(doc: BoardDocument, missing: ReadonlySet<string>, seeds: ReadonlyMap<string, StarterNote> = starterSeeds()): BoardDocument {
  if (missing.size === 0) return doc;
  const dropped = new Set<string>();
  const nodes = doc.nodes.flatMap((n) => {
    if (n.source.kind !== "entity" || n.source.entity !== "note" || !n.source.id || !missing.has(n.source.id)) return [n];
    const held = seeds.get(noteLabelFromText(n.title));
    if (!held) {
      dropped.add(n.id);
      return [];
    }
    return [{ ...n, title: held.title, source: { kind: "entity" as const, entity: "note", id: null, meta: { seed: held.seed } } }];
  });
  return { ...doc, nodes, edges: doc.edges.filter((e) => !dropped.has(e.from) && !dropped.has(e.to)) };
}

export function hasProfileTiles(doc: BoardDocument): boolean {
  return doc.nodes.some((n) => n.source.kind === "entity" && n.source.entity === "social-profile");
}

/** Put the brand's accounts on a board that has none. Returns whether it changed the board. */
export async function addAccountsToStudioBoard(boardId: string, accounts: readonly AccountTileSeed[]): Promise<boolean> {
  const board = await getBoard(boardId);
  if (!board || hasProfileTiles(board.doc) || accounts.length === 0) return false;
  await saveBoardDocument(boardId, withAccountTiles(board.doc, accounts), {
    expectedVersion: board.version,
    baseFingerprint: board.fingerprint,
    base: board.doc,
  });
  return true;
}
