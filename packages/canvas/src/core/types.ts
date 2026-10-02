/**
 * @ai-matrx/canvas — core types.
 *
 * The canvas is ONE docked column on the right edge of an application. It holds
 * panes; panes hold tabs; every tab is one CanvasItem. A CanvasItem is
 * identified by `kind` + `key`, so opening the same thing twice always lands on
 * the existing tab instead of creating a duplicate.
 *
 * Everything in CanvasState is plain JSON: it lives in the host's Redux store
 * (or the package's own standalone store), it is persisted between sessions,
 * and it can be inspected. No functions, no class instances, no React nodes.
 */

/** Any value that survives JSON.stringify → JSON.parse unchanged. */
export type CanvasJson =
  | string
  | number
  | boolean
  | null
  | readonly CanvasJson[]
  | { readonly [key: string]: CanvasJson | undefined };

declare const itemIdBrand: unique symbol;
declare const paneIdBrand: unique symbol;
declare const splitIdBrand: unique symbol;

/** `${kind}::${key}` — the identity of one thing on the canvas. */
export type CanvasItemId = string & { readonly [itemIdBrand]: true };
export type CanvasPaneId = string & { readonly [paneIdBrand]: true };
export type CanvasSplitId = string & { readonly [splitIdBrand]: true };

export interface CanvasItem {
  readonly id: CanvasItemId;
  /** Registered kind id (see `registerCanvasKind`). */
  readonly kind: string;
  /** Stable key inside the kind — an artifact id, a conversation id, "default". */
  readonly key: string;
  /** Explicit tab title. `null` ⇒ the kind's `title(data)` or its label. */
  readonly title: string | null;
  readonly data: CanvasJson;
  readonly openedAt: number;
  readonly updatedAt: number;
}

export interface CanvasPane {
  readonly id: CanvasPaneId;
  readonly itemIds: readonly CanvasItemId[];
  readonly activeItemId: CanvasItemId | null;
}

/** "horizontal" = children side by side; "vertical" = children stacked. */
export type CanvasOrientation = "horizontal" | "vertical";

export type CanvasLayoutNode =
  | { readonly type: "pane"; readonly paneId: CanvasPaneId }
  | {
      readonly type: "split";
      readonly id: CanvasSplitId;
      readonly orientation: CanvasOrientation;
      readonly children: readonly CanvasLayoutNode[];
      /** Fractions, one per child, summing to 1. */
      readonly sizes: readonly number[];
    };

export interface CanvasState {
  readonly version: 1;
  readonly isOpen: boolean;
  readonly isFullscreen: boolean;
  /** Column width in CSS pixels (desktop). */
  readonly width: number;
  readonly layout: CanvasLayoutNode;
  readonly panes: { readonly [paneId: string]: CanvasPane };
  readonly items: { readonly [itemId: string]: CanvasItem };
  readonly focusedPaneId: CanvasPaneId;
  /** Monotonic counter for minting pane/split ids — keeps the reducer pure. */
  readonly seq: number;
  /** True once a persisted snapshot was applied (or there was none). */
  readonly hydrated: boolean;
}

/** Where a newly opened item goes. Existing items never move on open. */
export type CanvasOpenTarget =
  | "focused"
  | "split-right"
  | "split-down"
  | { readonly paneId: CanvasPaneId };

export interface CanvasOpenInput {
  readonly kind: string;
  readonly key: string;
  readonly title?: string | null | undefined;
  readonly data?: CanvasJson | undefined;
  readonly target?: CanvasOpenTarget | undefined;
  /** Reveal the canvas when it is put away. Default true. */
  readonly reveal?: boolean | undefined;
  /** Make the item the pane's active tab. Default true. */
  readonly activate?: boolean | undefined;
}

export const CANVAS_MIN_WIDTH = 360;
export const CANVAS_DEFAULT_WIDTH = 640;
export const CANVAS_MIN_SPLIT_FRACTION = 0.12;
