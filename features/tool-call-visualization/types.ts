/**
 * Tool Call Visualization — Canonical Renderer Contract (v2)
 *
 * The ONE set of types every tool renderer in this codebase consumes.
 *
 * ─── Philosophy ──────────────────────────────────────────────────────────
 *
 * The Python backend emits exactly one tool shape on the wire:
 * `ToolEventPayload` from types/python-generated/stream-events.ts.
 *
 * The agent execution system folds those wire events into
 * `ToolLifecycleEntry` (features/agents/types/request.types.ts) — a clean,
 * Redux-materialized view keyed by callId.
 *
 * Renderers in this feature consume `ToolLifecycleEntry` directly. Some
 * renderers (brave search, deep research) ALSO want the raw event log
 * for their own per-step display — they receive `events: ToolEventPayload[]`.
 *
 * NO ToolCallObject. NO shape fabrication. NO round-tripping.
 * ─────────────────────────────────────────────────────────────────────────
 */

import type React from "react";
import type { LucideIcon } from "lucide-react";
import type { ToolLifecycleEntry } from "@/features/agents/types/request.types";
import type { ToolEventPayload } from "@/types/python-generated/stream-events";

/** Accent palette for a tool's glossy glyph (see `ToolGlyph`). */
export type ToolAccent =
  | "primary"
  | "blue"
  | "violet"
  | "cyan"
  | "green"
  | "amber"
  | "rose"
  | "slate";

/**
 * Props passed to every tool renderer component (inline + overlay).
 */
export interface ToolRendererProps {
  /** The materialized lifecycle view for this tool call. Primary data source. */
  entry: ToolLifecycleEntry;

  /**
   * Raw per-callId event log. Only supplied by the live-stream shell
   * when the consumer opts-in. Renderers that don't need it can ignore it.
   *
   * Each item is the exact `ToolEventPayload` that arrived on the wire,
   * preserving server ordering.
   */
  events?: ToolEventPayload[];

  /**
   * Callback to open the fullscreen overlay, optionally pre-selecting
   * a specific tab. Tab IDs follow the format `tool-group-${callId}`.
   */
  onOpenOverlay?: (initialTab?: string) => void;

  /**
   * Optional second click action — opens the same data in a draggable
   * WindowPanel instead of the fullscreen overlay.
   */
  onOpenWindowPanel?: (initialTab?: string) => void;

  /**
   * The callId for this renderer's tool. Used to target a specific tab
   * when opening the overlay. Mirrors `entry.callId`.
   */
  toolGroupId?: string;

  /**
   * True when the consumer is displaying a persisted (post-stream) snapshot
   * rather than a live stream. Renderers may choose to render compact
   * read-only UI in this mode.
   */
  isPersisted?: boolean;

  /**
   * Owning conversation id — threaded from the chat shell so interactive
   * renderers can publish user overrides into instance context.
   */
  conversationId?: string;

  /**
   * Owning active-request id — threaded from the live chat shell so renderers
   * can subscribe to stream-position selectors (e.g.
   * `selectIsLatestToolActivity` for the search renderer's live→persistent
   * fast-forward). Undefined for persisted snapshots / the simulator, where
   * renderers fall back to `entry.status`.
   */
  requestId?: string;
}

/**
 * A single custom tab contributed by a tool renderer to the overlay's
 * top-level tab bar. When a tool registers `OverlayTabs`, these specs
 * REPLACE the default "Results" tab and are rendered before the
 * standard "Input" and "Raw" admin tabs.
 *
 * Tab IDs MUST NOT collide with the reserved IDs "results", "input",
 * or "raw".
 */
export interface ToolOverlayTabSpec {
  /** Unique tab id (e.g. "report", "sources", "fulltext"). */
  id: string;

  /** Display label shown in the tab bar. */
  label: string;

  /**
   * The component rendered when this tab is active. Receives the
   * standard ToolRendererProps for the selected tool entry.
   */
  Component: React.ComponentType<ToolRendererProps>;
}

/**
 * Verb-phrase labels for the slim collapsed row. Status is conveyed by
 * tense (running -> -ing form; complete -> past tense), not by a status
 * icon — so the row reads like a transcript line ("Updated plan") rather
 * than a generic chip with a green check.
 *
 * The shimmer treatment runs on the running label; the complete label is
 * static. Errors use `errorPrefix` (falls back to `${complete} failed`)
 * and append the entry's `errorMessage` after a colon when present.
 */
export interface ToolPhaseLabels {
  /** Present-continuous form shown while the tool is in flight. */
  running: string;
  /** Past-tense form shown once the tool completes successfully. */
  complete: string;
  /** Prefix shown on error. Defaults to `${complete} failed`. */
  errorPrefix?: string;
}

/**
 * Static registry entry for a tool.
 */
export interface ToolRenderer {
  /** Must match `entry.toolName` (e.g. "web_search"). */
  toolName: string;

  /** Human-readable display name. */
  displayName: string;

  /**
   * Glossy glyph for the folded tool line + the entity-card header (rendered
   * via `ToolGlyph`). Gives each tool a unique, colored, app-style icon instead
   * of a flat one. Falls back to a per-family default in `getToolGlyph`.
   */
  icon?: LucideIcon;
  accent?: ToolAccent;

  /**
   * Shell chrome. "line" (default) = the slim collapsible verb-phrase row.
   * "card" = a self-headed entity card: once the tool completes, the shell
   * renders the InlineComponent DIRECTLY with no fold line / chevron / hover
   * icons — the component's own header (`EntityCard`) carries the name +
   * "Open in" menu. While still streaming it shows the slim row.
   */
  chrome?: "line" | "card";

  /**
   * Optional verb-phrase labels for the slim row. When omitted, the shell
   * falls back to a small built-in map (for common widget tools) and then
   * to `displayName` as-is.
   */
  phaseLabels?: ToolPhaseLabels;

  /** Custom label for the results/output tab in the overlay. */
  resultsLabel?: string;

  /** Keep the collapsible card expanded even after streaming text begins. */
  keepExpandedOnStream?: boolean;

  /**
   * Collapse/display behavior override for the shell. Default ("auto") shows
   * the tool expanded while it streams, then auto-collapses ~3s after it
   * finishes. "stay-open" never auto-collapses (e.g. research — it shrinks to a
   * compact inline view rather than disappearing). "never-open" stays a single
   * line until the user clicks. A user preference (verbose/minimal) overrides
   * this per the resolver in `ToolCallVisualization`.
   */
  displayMode?: "auto" | "stay-open" | "never-open";

  /** The inline (stream) component. Required. */
  InlineComponent: React.ComponentType<ToolRendererProps>;

  /** Optional overlay component. Defaults to InlineComponent. */
  OverlayComponent?: React.ComponentType<ToolRendererProps>;

  /**
   * Optional list of custom overlay tabs. When provided (and the overlay
   * is showing exactly one entry of this tool), these tabs REPLACE the
   * default "Results" tab in the overlay's top-level tab bar — yielding
   * `[...OverlayTabs, Input, Raw]`.
   *
   * Takes precedence over `OverlayComponent` when both are set. For
   * multi-tool groups, the overlay falls back to the standard
   * `[Results, Input, Raw]` shape with an entry selector.
   */
  OverlayTabs?: ToolOverlayTabSpec[];

  /**
   * Optional custom subtitle for the overlay header.
   * Return null to fall back to default (query/url/result count).
   */
  getHeaderSubtitle?: (
    entry: ToolLifecycleEntry,
    events?: ToolEventPayload[],
  ) => string | null;

  /**
   * Optional extra content rendered in the overlay header under the title.
   * Use for summary stats, badges, or other contextual chips.
   */
  getHeaderExtras?: (
    entry: ToolLifecycleEntry,
    events?: ToolEventPayload[],
  ) => React.ReactNode;
}

/** Registry shape — keyed by toolName. */
export type ToolRegistry = Record<string, ToolRenderer>;
