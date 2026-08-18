// features/connectors/types.ts
//
// The config type for the connector catalogue.
//
// A connector is one external system a user can attach to their account so
// agents can reach it. Adding a new one is ONE entry in `registry.ts` — no
// component change, no branch in the strip.

import type { ComponentType } from "react";

/** Stable connector id. Kebab-case, provider-scoped, never renamed. */
export type ConnectorId = string;

/**
 * Where a connector is allowed to appear.
 *
 * - `strip`     — the one-line reminder under the agent input. Reserved for the
 *                 few connections that change what a normal conversation can do.
 * - `directory` — the full "all your connections" surface. Everything lives
 *                 here; niche connectors live ONLY here.
 *
 * A connector with `["directory"]` is not lesser — it is simply too specific to
 * earn a slot under the input.
 */
export type ConnectorSurface = "strip" | "directory";

/** What the user's account looks like for this connector, right now. */
export type ConnectorStatus =
  /** Attached and usable. */
  | "connected"
  /** Not attached — the one-click offer. */
  | "not_connected"
  /** We do not support it yet; the config names the coming-soon promise. */
  | "unavailable";

export interface ConnectorLogoProps {
  /** Brand color when true; `currentColor` when false. */
  colored?: boolean;
  className?: string;
}

/** A brand mark. Local inline SVG or a Lucide icon adapted via `lucideMark`. */
export type ConnectorLogo = ComponentType<ConnectorLogoProps>;

export interface ConnectorDefinition {
  /** Stable id, generic to the provider — never bakes today's feature set in. */
  id: ConnectorId;
  /** Display name. Carries today's truth; may widen as the capability widens. */
  name: string;
  /** One user-facing line: what connecting unlocks. No jargon, no feature list. */
  blurb: string;
  /** Local brand mark. Never a hotlinked remote logo. */
  logo: ConnectorLogo;
  /** Surfaces this connector may appear on. Explicit, never inferred. */
  surfaces: ConnectorSurface[];
  /**
   * Where the user manages an existing connection. Rendered as a real door on
   * a connected chip (CLAUDE.md § NO DEAD ENDS).
   */
  manageHref?: string;
  /**
   * Set ONLY when the connector is not connectable yet. The id must exist in
   * `lib/coming-soon/registry.ts`; clicking announces that registered promise
   * instead of raising a connect intent.
   */
  comingSoonId?: string;
}

/**
 * How a surface tells the strip what is connected. Supply either — a set of
 * connected ids (the common case) or a resolver (when a surface computes
 * per-connector health itself). `resolveStatus` wins where both are given.
 */
export interface ConnectorStatusSource {
  /** Ids the signed-in user has already connected. */
  connectedIds?: Iterable<ConnectorId>;
  /** Full per-connector resolver. Overrides `connectedIds`. */
  resolveStatus?: (connector: ConnectorDefinition) => ConnectorStatus;
}
