/**
 * Context-menu testing suite — page registry.
 *
 * Single source of truth for both the hub (`/ssr/context-menu`) and the
 * layout nav strip. Adding a new advanced testing page is a 2-step change:
 *
 *   1. Drop a `page.tsx` under `/ssr/context-menu/<slug>/page.tsx`.
 *   2. Add an entry to `CONTEXT_MENU_PAGES` below.
 *
 * Both the hub cards and the nav buttons are derived from this array. No
 * second copy to keep in sync.
 *
 * Entries are rendered in the order they appear here. Use `status` to
 * mark in-progress work — the hub renders a "wip" badge and the nav
 * button is still clickable so you can iterate live.
 */

import type { LucideIcon } from "lucide-react";
import {
  FlaskConical,
  LayoutGrid,
  Microscope,
  GitCompareArrows,
} from "lucide-react";

export type PageStatus = "stable" | "wip" | "planned";

export interface ContextMenuPage {
  /** URL slug under `/ssr/context-menu/`. Empty string = the hub itself. */
  slug: string;
  /** Short label for the nav and hub card. */
  title: string;
  /** One-liner used in the nav tooltip and hub card body. */
  tagline: string;
  /** Longer paragraph rendered on the hub card. */
  description: string;
  /** Lucide icon shown in nav + hub card. */
  icon: LucideIcon;
  /** When `"planned"`, the card is greyed out and the link is disabled. */
  status: PageStatus;
  /** Hidden from nav strip when true (still in hub). Defaults to false. */
  hiddenFromNav?: boolean;
}

export const CONTEXT_MENU_BASE = "/demos/ssr/context-menu" as const;

export const CONTEXT_MENU_PAGES: ContextMenuPage[] = [
  {
    slug: "canonical",
    title: "Canonical Proving Ground",
    tagline:
      "One core menu behind four wrappers (none/agent/notes/code) + extraSections injection + live Diff.",
    description:
      "The single page to validate the system as we build it. The SAME UniversalContextMenuV2 is rendered behind four wrapper configurations so you can confirm parity and per-surface tuning. The Notes panel demonstrates the `extraSections` injection contract (Save/Export/Move/Delete rendered by the core, described by the wrapper). The bottom section runs the Diff system live — right-click → Compare → 'Compare with clipboard', plus an inline DiffViewer and 'Open in window'.",
    icon: GitCompareArrows,
    status: "wip",
  },
  {
    slug: "lab",
    title: "Diagnostic Lab",
    tagline:
      "Single trigger + every inspector. Watch the menu fetch, resolve scope, and apply surface mappings live.",
    description:
      "The exhaustive view. One right-click target wired to a scope picker, surface picker, placement-mode toggles, contextData JSON editor, and a live applicationScope preview. Right side stacks JSON inspectors for the API response, Redux shortcuts/categories/blocks (with resolved scope), hook output, surface registry, and a raw `agx_context_menu_view` query. Use this first when 'I should see X but don't'.",
    icon: Microscope,
    status: "stable",
  },
  {
    slug: "scenarios",
    title: "Scenario Matrix",
    tagline:
      "Five live panels exercising different placement / context combinations side-by-side.",
    description:
      "Multi-panel smoke test. Each panel pins a different combination of `addedContexts`, `excludedContexts`, `placementMode`, editability, and `contextData` shape. Use this to verify behavioural deltas at a glance — code-editor vs content-editor visibility, read-only hiding, restrictive filters, the disable showcase, etc.",
    icon: LayoutGrid,
    status: "stable",
  },
  // ── Placeholders for the advanced tests Arman flagged ───────────────────
  // Each is hidden from the nav until the page actually exists, but stays
  // visible on the hub as a planned card so the future scope is documented.
  {
    slug: "surface-mappings",
    title: "Surface Mappings",
    tagline:
      "Resolve (agentId × surfaceName × scope) → value_mappings live; preview what mapScopeToInstanceWithSurface emits.",
    description:
      "Planned. Pick an agent + surface + scope, see the most-specific row from `agx_agent_surface`, and watch `mapScopeToInstanceWithSurface` produce variable + context entries from a sample applicationScope. The missing piece for diagnosing 'surface picked but values didn't land'.",
    icon: FlaskConical,
    status: "planned",
    hiddenFromNav: true,
  },
  {
    slug: "launch-inspector",
    title: "Launch Inspector",
    tagline:
      "Fire a specific shortcut with a hand-crafted applicationScope and inspect the assembled request envelope.",
    description:
      "Planned. Pick a shortcut from the menu (or by id), edit a sample applicationScope, watch the full `launchAgentExecution` pipeline produce its conversation, request body, variable values, context entries, and active-request state. The full agent execution flow with everything pinned.",
    icon: FlaskConical,
    status: "planned",
    hiddenFromNav: true,
  },
];

/** Helper: split into "show in nav" vs everything-else for the hub. */
export function getNavPages(): ContextMenuPage[] {
  return CONTEXT_MENU_PAGES.filter(
    (p) => p.status !== "planned" && !p.hiddenFromNav,
  );
}
