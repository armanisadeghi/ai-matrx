/**
 * The Studio's starter document: the Viral breakdown template plus the brand's own accounts as profile tiles
 * (a fresh Studio is never blind to the accounts the brand already tracks). Pure.
 */

import type { BoardDocument, BoardGroup, BoardNode } from "@/features/board/board/document";
import type { AccountTileSeed } from "../board-accounts";

const TILE = { w: 620, h: 700 };
const GAP = 40;
/** Below the template (its frame ends at y 820, its guide tile at y 920), with room for the frame title. */
const ROW_Y = 1040;

export function withAccountTiles(doc: BoardDocument, accounts: readonly AccountTileSeed[]): BoardDocument {
  if (accounts.length === 0) return doc;
  const nodes: BoardNode[] = accounts.map((a, i) => ({
    id: crypto.randomUUID(),
    rect: { x: i * (TILE.w + GAP), y: ROW_Y, ...TILE },
    title: a.title,
    source: { kind: "entity", entity: "social-profile", id: a.profileId, meta: { platform: a.platform } },
  }));
  const frame: BoardGroup = {
    id: crypto.randomUUID(),
    title: "Your accounts",
    rect: { x: -40, y: ROW_Y - 80, w: accounts.length * (TILE.w + GAP) + GAP, h: TILE.h + 120 },
  };
  return { ...doc, nodes: [...doc.nodes, ...nodes], groups: [...doc.groups, frame] };
}
