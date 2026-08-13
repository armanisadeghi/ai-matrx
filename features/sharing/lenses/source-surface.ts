/**
 * THE SOURCE SURFACE of a share — where a recipient goes to make their own.
 *
 * 🚨 A share page may NEVER send its recipient to `/sign-up` or `/login`.
 * Everything basic on this platform is free up front; a recipient who is
 * impressed by a shared report must land on the REAL feature that produced it,
 * not on a wall. That is the whole referral mechanic: the share is the ad, the
 * feature is the demo, and gating happens later, on advanced capability.
 *
 * One href serves BOTH audiences, because module routes already carry the
 * marketing/workspace duality (`.claude/skills/module-landing-pages`): a
 * signed-in visitor gets the workspace, an anonymous visitor gets that
 * feature's marketing landing — never an error, never a login bounce. So this
 * registry answers one question per share type: **which feature made this?**
 *
 * Prefer, in order:
 *   1. a PUBLIC tool the visitor can use immediately, signed out
 *      (e.g. `seo_collection_run` → `/seo/ai-visibility`);
 *   2. the feature's module route (workspace for members, landing for guests);
 *   3. `/features` — the directory of every module landing. Guest-safe,
 *      useful signed in, and never a dead end.
 *
 * Adding a share type = one entry. Polymorphic tokens dispatch on the resolved
 * payload exactly like `./metadata.ts` and `./kind-instance.tsx`.
 */

import { readKeywordResearchArtifact } from "@/features/marketing/seo/keyword-research/data/artifact";

/**
 * The minimum a caller must know: the entity token, plus (for polymorphic
 * tokens) the resolved payload. Structural on purpose — BOTH public lanes pass
 * it: `/s/[token]` (`ResolvedShareToken`) and `/p/e/[type]/[id]`
 * (`PublicResource`). Neither lane may grow its own copy of this decision.
 */
export interface ShareSourceInput {
  resourceType?: string | null;
  resource?: Record<string, unknown> | null;
}

export interface ShareSourceSurface {
  /** Real, guest-safe destination. Never an auth route. */
  href: string;
  /** Verb-first label for the CTA button. */
  label: string;
}

/**
 * The floor. `/features` lists every module landing, so it renders for an
 * anonymous visitor and is still the right jumping-off point signed in.
 */
export const DEFAULT_SHARE_SOURCE_SURFACE: ShareSourceSurface = {
  href: "/features",
  label: "See what AI Matrx does",
};

type Resolver = (input: ShareSourceInput) => ShareSourceSurface | null;

const KEYWORD_RESEARCH_SURFACE: ShareSourceSurface = {
  // Signed in → the keyword-research workbench. Signed out → the marketing
  // landing the /marketing layout serves guests on any /marketing/* URL.
  // When a public, signed-out keyword-research tool ships (it should — this is
  // exactly the kind of thing we give away), point this at it instead.
  href: "/marketing/keyword-research",
  label: "Research your own keywords",
};

const SHARE_SOURCE_SURFACES: Record<string, Resolver> = {
  // Polymorphic token — dispatch on the payload shape, same as the lens.
  content_ir_kind_instance: (input) =>
    readKeywordResearchArtifact(input.resource?.["data"])
      ? KEYWORD_RESEARCH_SURFACE
      : null,
  // A real public tool: an anonymous visitor can run their own check now.
  seo_collection_run: () => ({
    href: "/seo/ai-visibility",
    label: "Check your own brand",
  }),
  web_page: () => ({ href: "/seo/page-audit", label: "Audit your own page" }),
  web_snapshot: () => ({ href: "/seo/page-audit", label: "Audit your own page" }),
  note: () => ({ href: "/notes", label: "Start your own notes" }),
  working_document: () => ({ href: "/documents", label: "Write your own" }),
  code_file: () => ({ href: "/code", label: "Open the code workspace" }),
  code_folder: () => ({ href: "/code", label: "Open the code workspace" }),
  conversation: () => ({ href: "/chat", label: "Start your own chat" }),
  file: () => ({ href: "/files", label: "Open your own files" }),
  folder: () => ({ href: "/files", label: "Open your own files" }),
  // The education HUB, not /education/flashcards: the hub is the "land with a
  // CTA" surface valuable to both audiences, and the flashcards workspace has
  // no verified guest branch.
  fc_card: () => ({ href: "/education", label: "Study your own set" }),
  fc_set: () => ({ href: "/education", label: "Study your own set" }),
  canvas_item: () => ({ href: "/canvas/discover", label: "Explore canvases" }),
  shared_canvas_item: () => ({
    href: "/canvas/discover",
    label: "Explore canvases",
  }),
  agent: () => ({ href: "/agents", label: "Build your own agent" }),
};

/** Always returns a real destination — never an auth route. */
export function resolveShareSourceSurface(
  input: ShareSourceInput,
): ShareSourceSurface {
  const resolver = input.resourceType
    ? SHARE_SOURCE_SURFACES[input.resourceType]
    : undefined;
  return (resolver ? resolver(input) : null) ?? DEFAULT_SHARE_SOURCE_SURFACE;
}
