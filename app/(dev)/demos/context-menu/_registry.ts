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

export type PageStatus = "stable" | "wip" | "planned";

/** Serializable icon key — resolved to Lucide components on the client. */
export type ContextMenuIconKey =
  | "git-compare-arrows"
  | "microscope"
  | "layout-grid"
  | "flask-conical";

export interface ContextMenuPage {
  /** URL slug under `/ssr/context-menu/`. Empty string = the hub itself. */
  slug: string;
  /** Short label for the nav and hub card. */
  title: string;
  /** One-liner used in the nav tooltip and hub card body. */
  tagline: string;
  /** Longer paragraph rendered on the hub card. */
  description: string;
  /** Icon key resolved via `_registry.icons.tsx` in client components. */
  icon: ContextMenuIconKey;
  /** When `"planned"`, the card is greyed out and the link is disabled. */
  status: PageStatus;
  /** Hidden from nav strip when true (still in hub). Defaults to false. */
  hiddenFromNav?: boolean;
}

export const CONTEXT_MENU_BASE = "/demos/context-menu" as const;

export const CONTEXT_MENU_PAGES: ContextMenuPage[] = [
  {
    slug: "canonical",
    title: "Canonical Proving Ground",
    tagline:
      "One core menu behind four production-target wrappers + live Diff.",
    description:
      "Validate the system as we build it. Panel 1 is raw core (no surface). Panels 2–4 use production-target wiring via shared demo panels: agent-builder (full agent scope), notes (full matrx-user/notes scope + extraSections), code editor (/code vsc_* contract). Diff playground at the bottom.",
    icon: "git-compare-arrows",
    status: "wip",
  },
  {
    slug: "lab",
    title: "Diagnostic Lab",
    tagline:
      "Single trigger + every inspector. Surface picker loads production-target context JSON.",
    description:
      "Exhaustive harness for debugging the v2 menu. Pick a surface (notes, code-editor, agent-builder) and the contextData editor auto-fills the canonical payload shape. Scope picker, placement toggles, API/Redux/hook inspectors, raw DB view query.",
    icon: "microscope",
    status: "stable",
  },
  {
    slug: "scenarios",
    title: "Scenario Matrix",
    tagline:
      "Five live panels exercising different placement / context combinations side-by-side.",
    description:
      "Multi-panel smoke test. Panel 1 is a production-accurate code editor harness (`CodeEditorDemoPanel` → same props/context as `/code`). Other panels pin different placement / context combinations. Use this to verify behavioural deltas at a glance — content-editor vs read-only hiding, explicit filter API vs contextFilter, disable showcase, etc.",
    icon: "layout-grid",
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
    icon: "flask-conical",
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
    icon: "flask-conical",
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
