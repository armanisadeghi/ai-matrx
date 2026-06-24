// features/context-menu-v3/types.ts
//
// Public type surface for the v3 universal context menu.
//
// v3 is ONE menu, mounted via two thin wrappers (`EditableContextMenu` /
// `NonEditableContextMenu`) over a single inert shell (`ContextMenuV3`). The
// shell carries no data, no submenus, no modals — it loads `MenuContent`
// (next/dynamic, ssr:false) on the first open and dispatches every
// modal/window through the OverlayController. See `FEATURE.md`.
//
// The single most important contract here is VALUE MAPPING:
//   - the 5 generic baseline values (selection, text_before, text_after,
//     content, context) are ALWAYS present (floored by `withBaselineScope`);
//   - every value a surface declares in its manifest is passed through without
//     exception, via `getApplicationScope` / `contextData`.
// See `value-resolution.ts`.

import type React from "react";
import type { LucideIcon } from "lucide-react";
import type { SourceFeature } from "@/features/agents/types/instance.types";
import type { Scope } from "@/features/agents/redux/shared/scope";
import type { ApplicationScope } from "@/features/agents/types/scope.types";
import type { ContentSource } from "@/features/rich-document/types";
import type { ScopeAssignmentEntityType } from "@/features/scopes/types";
import type { ResourceType } from "@/utils/permissions";
import type { SelectionRange } from "./utils/selection-tracking";

// ---------------------------------------------------------------------------
// Placement visibility — which dynamic submenus render, and how.
// ---------------------------------------------------------------------------

export type PlacementVisibility = "show" | "hide" | "disable";

/**
 * The dynamic, data-driven submenu groups. Static groups (clipboard, history,
 * export, convert, attach, share, quick actions) are not placements — they are
 * always part of the menu and gated by their own value source.
 */
export type PlacementKey =
  | "ai-action"
  | "bound-agent"
  | "content-block"
  | "organization-tool"
  | "user-tool"
  | "quick-action";

export type PlacementMode = Partial<Record<PlacementKey, PlacementVisibility>>;

// ---------------------------------------------------------------------------
// Surface passthrough — the declarative contract for surface-specific items.
// ---------------------------------------------------------------------------

/** A single injectable menu entry contributed by a surface. */
export type ContextMenuExtraItem =
  | {
      kind: "item";
      id: string;
      label: string;
      icon?: LucideIcon;
      /** Optional second line of muted helper text. */
      description?: string;
      onSelect: () => void;
      disabled?: boolean;
      /** Render in destructive (red) styling. */
      destructive?: boolean;
      /** Right-aligned hint (e.g. a keyboard shortcut). */
      hint?: string;
    }
  | {
      kind: "submenu";
      id: string;
      label: string;
      icon?: LucideIcon;
      disabled?: boolean;
      children: ContextMenuExtraItem[];
    }
  | { kind: "separator"; id: string };

/**
 * Where a surface section slots into the menu, relative to the core sections.
 * The core renders, in order: selection/content header → history → clipboard →
 * find → export/convert → attach/share → [dynamic placements] → quick actions →
 * editable (save/delete) → admin. Default anchor: "after-actions".
 */
export type ExtraSectionAnchor =
  | "after-clipboard"
  | "after-actions"
  | "after-placements";

export interface ContextMenuExtraSection {
  id: string;
  /** Optional label rendered as a muted group heading. */
  label?: string;
  anchor?: ExtraSectionAnchor;
  items: ContextMenuExtraItem[];
}

// ---------------------------------------------------------------------------
// Value sources — how a surface declares the values the menu acts on.
// ---------------------------------------------------------------------------

/**
 * Static value payload. `content` is the surface's primary text; `context` is
 * a free-form blob. Any additional surface-declared value names pass through
 * verbatim into the `ApplicationScope`.
 */
export interface ContextMenuContextData {
  content?: string;
  context?: string | Record<string, unknown>;
  [key: string]: unknown;
}

/**
 * The entity the surface's content belongs to. When provided, the entity-bound
 * actions light up: "Attach To" (write `ctx_scope_assignments` via the
 * context-assignment system) and "Share" (the sharing system). Content-only
 * actions (Copy / Export / Convert / AI) never need this. Omit on raw text
 * fragments — Attach/Share simply won't render, which is correct.
 */
export interface ContextMenuEntityRef {
  /** Entity type for context-assignment (`ctx_scope_assignments.entity_type`). */
  type: ScopeAssignmentEntityType;
  id: string;
  title: string;
  /** Resource type for the sharing system. Omit to hide Share. */
  resourceType?: ResourceType;
  /** Whether the current user owns the resource (gates Share affordances). */
  isOwner?: boolean;
}

// ---------------------------------------------------------------------------
// Core props — shared by the shell and both wrappers.
// ---------------------------------------------------------------------------

export interface ContextMenuV3CoreProps {
  children: React.ReactNode;

  /**
   * REQUIRED. Identifies the UI that mounted this menu so every shortcut /
   * agent launched here is attributed to its true caller. Never a generic
   * label like "context-menu" — tag the surface ("notes", "code-editor", …).
   */
  sourceFeature: SourceFeature;

  /**
   * OPTIONAL. The Surface Registry name (`<client>/<surface>`), e.g.
   * `"matrx-user/notes"`. When set, launches carry `runtime.surfaceName`
   * end-to-end so the launch thunk can apply the surface's explicit
   * `value_mappings`. Also keys the bound-agents + AI-actions resolution.
   */
  surfaceName?: string;

  /**
   * Per-surface wiring version, shown as `V<n>` in the footer. Bump when a
   * surface customizes how it wires the menu so drift is visible at a glance.
   */
  menuVersion?: number;

  // ── Value sources (the heart of the contract) ──────────────────────────
  /**
   * Live scope builder — preferred over `contextData`. Read refs/DOM at click
   * time so surface values are never stale React state. When omitted, scope is
   * assembled from `contextData` + the menu's captured selection + a DOM-text
   * fallback so Copy/AI always have something to act on.
   */
  getApplicationScope?: () => ApplicationScope;
  /** Static value payload, merged under live capture. */
  contextData?: ContextMenuContextData;
  /**
   * Single-instance delegation: one menu serving many targets (e.g. a whole
   * conversation). Called with the right-clicked element before the menu
   * opens; the returned per-target context is merged over `contextData`.
   */
  resolveContextOnOpen?: (
    target: HTMLElement | null,
  ) => Record<string, unknown> | null;
  /**
   * Rich-document content source for this surface's primary content (note /
   * chat-message / artifact / …). Drives Copy-as variants, Export, and Convert
   * through the shared rich-document action registry — and links Convert→Task
   * to the right parent. Defaults to `{ type: "raw" }`.
   */
  contentSource?: ContentSource;
  /** The entity this content belongs to — enables Attach To + Share. */
  entity?: ContextMenuEntityRef;

  // ── Context filters for AI Actions ──────────────────────────────────────
  /** Contexts ADDED to the default `{general}` allow-set. */
  addedContexts?: string[];
  /** Contexts REMOVED from the allow-set after `addedContexts`. */
  excludedContexts?: string[];
  /** Per-placement visibility. Defaults to "show" for every placement. */
  placementMode?: PlacementMode;

  // ── Surface passthrough ─────────────────────────────────────────────────
  extraSections?: ContextMenuExtraSection[];

  // ── History (surface-provided) ──────────────────────────────────────────
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo?: boolean;
  canRedo?: boolean;
  undoHint?: string;
  redoHint?: string;
  onViewHistory?: () => void;
  hasHistory?: boolean;

  // ── Shortcut scope ──────────────────────────────────────────────────────
  scope?: Scope;
  scopeId?: string | null;

  // ── Presentation ────────────────────────────────────────────────────────
  enableFloatingIcon?: boolean;
  className?: string;
}

// ---------------------------------------------------------------------------
// Editable extras — text mutation callbacks an editable surface provides.
// ---------------------------------------------------------------------------

export interface EditableContextMenuExtras {
  editorId?: string;
  getTextarea?: () => HTMLTextAreaElement | null;
  onContentInserted?: () => void;
  onTextReplace?: (newText: string) => void;
  onTextInsertBefore?: (text: string) => void;
  onTextInsertAfter?: (text: string) => void;
  /** Editable-only: persist the surface's entity. Rendered only when provided. */
  onSave?: () => void;
  /**
   * Editable-only: delete the surface's entity. Rendered only when provided.
   * Always routed through `ConfirmDialog` — never a browser dialog.
   */
  onDelete?: () => void;
}

// ---------------------------------------------------------------------------
// Public component prop shapes.
// ---------------------------------------------------------------------------

/** Editable surfaces: text mutation callbacks light up Cut/Paste/Insert/Save/Delete. */
export interface EditableContextMenuProps
  extends ContextMenuV3CoreProps,
    EditableContextMenuExtras {}

/** Read-only surfaces: no text mutation. Copy/AI/Attach/Share/Export still work. */
export type NonEditableContextMenuProps = ContextMenuV3CoreProps;

/**
 * The shell's full prop set: core + editable extras + the resolved `isEditable`
 * flag that the wrappers preset. Consumers should use the wrappers, not this.
 */
export interface ContextMenuV3Props
  extends ContextMenuV3CoreProps,
    EditableContextMenuExtras {
  isEditable: boolean;
}

// ---------------------------------------------------------------------------
// Shell → MenuContent contract.
// ---------------------------------------------------------------------------

export type MenuVariant = "context" | "dropdown";

/**
 * The full prop bag the inert shell hands to the lazy `MenuContent`.
 * MenuContent mounts only on open, so it RECEIVES the captured selection +
 * value sources rather than owning the data hooks — that is what keeps the
 * shell's chunk free of react-icons, launchers, and the unified-menu hooks.
 * Imported via `import type` on the shell side so it never enters the shell
 * chunk.
 */
export interface MenuContentProps {
  variant: MenuVariant;

  // identity + value sources
  sourceFeature: SourceFeature;
  surfaceName?: string;
  menuVersion: number;
  getApplicationScope?: () => ApplicationScope;
  /** Effective contextData — `resolveContextOnOpen` already merged by the shell. */
  contextData: Record<string, unknown>;
  contentSource?: ContentSource;
  entity?: ContextMenuEntityRef;

  // captured selection (from the shell, at open)
  selectedText: string;
  selectionRange: SelectionRange | null;
  fallbackContent: string;

  // AI-actions filters
  addedContexts?: string[];
  excludedContexts?: string[];
  placementMode?: PlacementMode;
  scope: Scope;
  scopeId: string | null;

  // surface passthrough
  extraSections?: ContextMenuExtraSection[];

  // editable
  isEditable: boolean;
  editorId?: string;
  getTextarea?: () => HTMLTextAreaElement | null;
  onContentInserted?: () => void;
  onTextReplace?: (newText: string) => void;
  onTextInsertBefore?: (text: string) => void;
  onTextInsertAfter?: (text: string) => void;
  onSave?: () => void;
  onDelete?: () => void;

  // history
  onUndo?: () => void;
  onRedo?: () => void;
  canUndo: boolean;
  canRedo: boolean;
  undoHint?: string;
  redoHint?: string;
  onViewHistory?: () => void;
  hasHistory: boolean;

  // shell coordination — let MenuContent tell the shell to skip selection
  // restore (e.g. when an action opens an overlay that takes focus).
  suppressSelectionRestore: () => void;
}
