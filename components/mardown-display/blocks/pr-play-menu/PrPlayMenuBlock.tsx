"use client";

/**
 * PrPlayMenuBlock — the block-registry face of `pr_play_menu` (the PR Director's menu of plays).
 *
 * A thin adapter: the bridge in `features/content-ir/kinds/pr-play-menu.ts` reads the payload into plays, and
 * this renders THE ONE menu component (`PrPlayMenuView`) with the conversation the answer lives in, so a
 * pressed play becomes that conversation's next turn.
 */

import { PrPlayMenuView } from "@/features/marketing/pr/director/PrPlayMenuView";
import type { PrPlayView } from "@/features/content-ir/kinds/pr-play-menu";

export interface PrPlayMenuBlockProps {
  serverData: Record<string, unknown>;
  conversationId?: string;
}

export default function PrPlayMenuBlock({ serverData, conversationId }: PrPlayMenuBlockProps) {
  const plays = Array.isArray(serverData.plays) ? (serverData.plays as PrPlayView[]) : [];
  const nextMove = typeof serverData.nextMove === "string" ? serverData.nextMove : "";
  return <PrPlayMenuView plays={plays} nextMove={nextMove} conversationId={conversationId ?? null} />;
}
