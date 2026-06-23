/**
 * windowRegistryTypes.ts
 *
 * Pure type definitions for the window-panels registry system.
 * No runtime imports — safe to import from any module without pulling
 * in dynamic-import expressions or component code.
 */

import type { ComponentType } from "react";

// ─── Surface / presentation types ─────────────────────────────────────────────

export type OverlayKind = "window" | "widget" | "sheet" | "modal";

export type MobilePresentation = "fullscreen" | "drawer" | "card" | "hidden";

export type InstanceMode = "singleton" | "multi";

export type MobileSidebarAs = "drawer" | "inline";

export type LucideIconName = string;

export type ToolsCategory = string;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ComponentImport = () => Promise<{ default: ComponentType<any> }>;

// ─── Persistence shapes ────────────────────────────────────────────────────────

export interface PanelState {
  windowState: "windowed" | "maximized" | "minimized";
  rect: { x: number; y: number; width: number; height: number };
  sidebarOpen?: boolean;
  /** Sidebar width as a percentage of the window (from ResizablePanel) */
  sidebarSize?: number;
  /** For future built-in tab system: currently active tab key */
  activeTab?: string;
  /** For future built-in tab system: all open tab keys */
  openTabs?: string[];
  zIndex?: number;
}

export interface WindowSessionRow {
  id: string;
  user_id: string;
  window_type: string;
  label: string | null;
  panel_state: PanelState;
  data: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

// ─── Tray preview ─────────────────────────────────────────────────────────────

/** Context passed to `renderTrayPreview` so windows can render their own state. */
export interface TrayPreviewContext {
  /** The window's persisted `data` object from `window_sessions.data`. */
  data: Record<string, unknown>;
  /** Stable overlay id (matches `WindowEntry.id` for overlay-managed windows). */
  overlayId: string;
  /** Instance id — `"default"` for singleton windows. */
  instanceId: string;
  /** The display title (same as `WindowEntry.title`). */
  title: string;
}

// ─── Registry entry shapes ────────────────────────────────────────────────────

/**
 * Static (non-dynamic) metadata for a registry entry.
 * Contains all fields EXCEPT componentImport, renderTrayPreview, and
 * captureTraySnapshot. Safe to import without pulling in any component code.
 */
export interface WindowStaticMetadata {
  /** Stable slug stored in window_sessions.window_type. Use kebab-case. */
  slug: string;
  /** Key used in overlaySlice (openOverlay / closeOverlay). */
  overlayId: string;
  /** Surface kind — drives renderer behavior. */
  kind: OverlayKind;
  /** Human-readable display name. */
  label: string;
  /**
   * Default / empty shape for the window-type-specific data field.
   * Used as a type reference and fallback when restoring a session with
   * missing keys.
   */
  defaultData: Record<string, unknown>;
  /**
   * When true, the overlay is NOT persisted to the DB. Use for ephemeral
   * tool overlays where restoring state adds no value.
   */
  ephemeral?: boolean;
  /**
   * Required for kind: "window". Ignored for other kinds.
   */
  mobilePresentation?: MobilePresentation;
  /**
   * Only applies to kind: "window" with a sidebar. Default: "drawer".
   */
  mobileSidebarAs?: MobileSidebarAs;
  /** Default: "singleton". */
  instanceMode?: InstanceMode;
  /** `?panels=<key>` deep-link key. Instance id is auto-appended. */
  urlSync?: { key: string };
  /** Lucide icon name for the Tools grid. Filled in Phase 3. */
  icon?: LucideIconName;
  /** Tools-grid category. Omit to exclude from the grid. Filled in Phase 3. */
  category?: ToolsCategory;
  /** Opt-in to snapshot-on-blur persistence for heavy in-memory buffers. */
  heavySnapshot?: boolean;
  /** Opt-in to autosave-on-blur / visibilitychange persistence. */
  autosave?: boolean;
  /**
   * Optional seed data builder invoked when opening this overlay from the
   * Tools grid (or other generic entry points). Runs client-side at click
   * time; can read Redux state via selectors passed by the grid host.
   */
  seedData?: (ctx: unknown) => Record<string, unknown> | undefined;
  /**
   * Marks this window as deprecated. While set:
   *  - WindowPanel renders a red ring around the shell and a dismissible
   *    "deprecated" banner above the body.
   *  - Tools-grid tiles and the per-window list prefix the label with "*"
   *    and render it in destructive red.
   * Set during consolidation so users can open the old window side-by-side
   * with the replacement, confirm parity, and only then approve deletion in
   * a follow-up PR. The slug stays around so URL deep-links keep resolving.
   */
  deprecated?: {
    /** Overlay ID of the replacement, e.g. "agentAdvancedEditorWindow". */
    replacedBy?: string;
    /** Free-text shown in the banner. Falls back to a generic message. */
    note?: string;
  };
}

/**
 * Full entry shape — extends static metadata with dynamic (component) fields
 * such as `componentImport`. Only modules that actually mount a window's
 * component should depend on these fields, since each `componentImport` is a
 * `() => import(...)` that pulls a window's lazy chunk into whoever references
 * it. Note: windows are RENDERED via the `lazyOverlay(...)` blocks in
 * `features/overlays/OverlayController.tsx` — the static-metadata lookup in
 * `windowRegistryMetadata.ts` deliberately omits these fields so it stays
 * import-safe everywhere.
 */
export interface WindowRegistryEntry extends WindowStaticMetadata {
  /**
   * Lazy dynamic import resolving to `{ default: Component }`. The unified
   * renderer feeds this into React.lazy / next/dynamic.
   */
  componentImport: ComponentImport;
  /**
   * Optional custom JSX for the minimized tray chip body.
   */
  renderTrayPreview?: (ctx: TrayPreviewContext) => import("react").ReactNode;
  /**
   * Optional snapshot capture function for the tray chip.
   */
  captureTraySnapshot?: (bodyEl: HTMLElement) => Promise<string | null>;
}
