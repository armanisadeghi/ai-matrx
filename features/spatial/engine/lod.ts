/**
 * Spatial view — level of detail and ZOOM-PACED STREAMING (pure).
 *
 * Semantic zoom (Pad++, 1994): at far zoom an item shows a different, more
 * abstract representation, not a shrunken copy. We add the twist nobody ships:
 * the LIVE UPDATE RATE of a streaming tile follows how much of it you can
 * actually see.
 *
 *   read      — body text is legible (≥ READABLE_PX on screen): commit every
 *               animation frame, i.e. token by token.
 *   glance    — shapes and headings visible, words not: commit in batches and
 *               land each batch with a soft reveal, so it still reads as
 *               continuous motion.
 *   overview  — the tile is a postage stamp: the body is replaced by a
 *               counter-scaled title card + progress, and the hidden body
 *               does not commit at all (the card shows progress from the
 *               source's coarse status).
 *   offscreen — culled: nothing commits; the tile catches up in one step the
 *               moment it re-enters the viewport.
 *
 * Nothing upstream is throttled — every token still lands in the accumulator
 * (or Redux) at full rate. Pacing only decides when a TILE re-renders what
 * has already arrived, so zooming in always shows the complete, current text.
 */

export type DetailTier = "read" | "glance" | "overview";
export type PaceTier = DetailTier | "offscreen";

/** Body text size inside tiles, in world px. */
export const BODY_FONT_PX = 14;
/** On-screen body size at which text is legible. */
export const READABLE_PX = 9.5;
/** Below this zoom a tile body is abstracted away entirely. */
export const OVERVIEW_ZOOM = 0.28;

export function detailTierForZoom(z: number): DetailTier {
  if (BODY_FONT_PX * z >= READABLE_PX) return "read";
  if (z >= OVERVIEW_ZOOM) return "glance";
  return "overview";
}

/** Milliseconds between commits per tier. 0 = every animation frame. */
export const PACE_MS: Record<PaceTier, number> = {
  read: 0,
  glance: 900,
  overview: Number.POSITIVE_INFINITY,
  offscreen: Number.POSITIVE_INFINITY,
};

/** Duration of the reveal that lands a batched commit — a little shorter than
 * the batch interval so each batch settles before the next arrives, which is
 * what makes discrete commits read as one continuous flow. */
export function revealMsForTier(tier: PaceTier): number {
  const pace = PACE_MS[tier];
  if (pace === 0 || !Number.isFinite(pace)) return 0;
  return Math.round(pace * 0.7);
}

/**
 * Decide whether a tile should commit now.
 *  - pending === false: nothing new arrived → never.
 *  - read tier: always (the caller schedules on rAF).
 *  - tier just got MORE detailed than the last commit's tier: commit
 *    immediately — you zoomed in, you see the latest, no waiting.
 *  - otherwise: when the tier's interval has elapsed.
 */
export function shouldCommit(args: {
  pending: boolean;
  tier: PaceTier;
  lastCommitTier: PaceTier;
  msSinceLastCommit: number;
}): boolean {
  const { pending, tier, lastCommitTier, msSinceLastCommit } = args;
  if (!pending) return false;
  if (!Number.isFinite(PACE_MS[tier])) return false;
  if (TIER_RANK[tier] > TIER_RANK[lastCommitTier]) return true;
  return msSinceLastCommit >= PACE_MS[tier];
}

const TIER_RANK: Record<PaceTier, number> = {
  offscreen: 0,
  overview: 1,
  glance: 2,
  read: 3,
};

/** Human label for the HUD. */
export const TIER_LABEL: Record<DetailTier, string> = {
  read: "Reading — live token by token",
  glance: "Glance — batched with soft reveal",
  overview: "Overview — title cards and progress",
};
