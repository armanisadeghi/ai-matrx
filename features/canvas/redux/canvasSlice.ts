import { createSlice, PayloadAction } from "@reduxjs/toolkit";
import type { ReactNode } from "react";

// Supported canvas content types
export type CanvasContentType =
  | "quiz"
  | "presentation"
  | "iframe"
  | "html"
  | "code"
  | "image"
  | "diagram"
  | "comparison"
  | "timeline"
  | "research"
  | "troubleshooting"
  | "decision-tree"
  | "flashcards"
  | "recipe"
  | "resources"
  | "code_preview"
  | "code_edit_error"
  | "progress"
  | "math_problem"
  | "mermaid"
  | "svg"
  | "chart"
  | "questionnaire"
  | "react"
  | "table"
  | "transcript"
  | "structured_info"
  | "tree"
  | "tasks"
  // Live per-conversation editor surfaces (not artifacts) — render the real
  // WorkingDocumentPanel inside the Canvas shell. `data` is a pointer
  // `{ conversationId, kind }`; the panel reads live content from Redux and
  // persists itself (cx_working_documents), so these are NON_PERSISTABLE here.
  | "working_document"
  | "scratchpad";

/**
 * Canvas content types that hold live, non-serializable runtime state —
 * callbacks like `onApply` / `onDiscard` / `onCloseModal`. They are ephemeral
 * editor surfaces, NOT artifacts. Persisting them serializes the callbacks to
 * `null` and produces a corrupt, dead row that renders with no handlers, so
 * saving them must be refused loudly rather than silently writing junk.
 */
export const NON_PERSISTABLE_CANVAS_TYPES: ReadonlySet<string> = new Set([
  "code_preview",
  "code_edit_error",
  // Live editor surfaces — they persist themselves to cx_working_documents;
  // saving a canvas_items row would just freeze a dead pointer.
  "working_document",
  "scratchpad",
]);

export function isPersistableCanvasType(type: string): boolean {
  return !NON_PERSISTABLE_CANVAS_TYPES.has(type);
}

export interface CanvasContent {
  type: CanvasContentType;
  data: any; // Flexible data structure - each block handles its own data
  metadata?: {
    title?: string | ReactNode;
    subtitle?: string | ReactNode;
    sourceMessageId?: string;
    sourceTaskId?: string;
    /** Optional chat linkage for canvas views (e.g. flashcards). */
    conversationId?: string;
    messageId?: string;
    /** canvas_items row id when the open content is a persisted artifact —
     *  editors use it to save new versions instead of creating new rows. */
    canvasItemId?: string;
    /** Persisted artifact version when known (display chip). */
    artifactVersion?: number;
    /** Per-artifact mermaid render options + diagram identity. */
    mermaid?: Record<string, unknown>;
  };
}

interface CanvasItem {
  id: string; // Unique ID for each canvas item
  content: CanvasContent;
  timestamp: number; // When it was created
  sourceMessageId?: string; // Link to the message that created it
  sourceTaskId?: string; // Link to the task that created it (for deduplication)
  savedItemId?: string; // Database ID if saved to Supabase
  isSynced?: boolean; // Whether this item is saved to the database
}

export type CanvasRenderMode = "inline" | "global" | "auto";

interface CanvasState {
  isOpen: boolean;
  items: CanvasItem[]; // List of all canvas items in current session
  currentItemId: string | null; // Currently active item (top pane when split)
  /**
   * Secondary pane item id. When non-null, the canvas renders in split mode:
   * `currentItemId` lives in the top pane, `secondaryItemId` in the bottom
   * pane, with a draggable horizontal handle between them. `null` = single
   * pane (default).
   */
  secondaryItemId: string | null;
  /**
   * Ratio of the top pane height in split mode, 0–100 (percent). The bottom
   * pane fills the remainder. Persisted across opens. Only meaningful when
   * `secondaryItemId` is non-null.
   */
  splitRatio: number;
  isAvailable: boolean; // Whether canvas is available in current context/layout
  canvasWidth: number; // Width of canvas panel in pixels (persisted)
  renderMode: CanvasRenderMode; // Preferred render mode
}

const initialState: CanvasState = {
  isOpen: false,
  items: [],
  currentItemId: null,
  secondaryItemId: null,
  splitRatio: 55,
  isAvailable: false, // Default to false, layouts enable it
  canvasWidth: 768, // Default width matches max-w-3xl so content fills perfectly
  renderMode: "auto", // Auto-detect best render mode
};

export const canvasSlice = createSlice({
  name: "canvas",
  initialState,
  reducers: {
    // Add a new canvas item and make it active (with deduplication)
    openCanvas: (state, action: PayloadAction<CanvasContent>) => {
      const sourceTaskId = action.payload.metadata?.sourceTaskId;
      const sourceMessageId = action.payload.metadata?.sourceMessageId;

      // DEDUPLICATION: Check if an item from this source already exists
      // Priority: taskId > messageId (taskId is more specific)
      let existingItem: CanvasItem | undefined;

      if (sourceTaskId) {
        // Check by taskId first (most specific identifier)
        existingItem = state.items.find(
          (item) => item.sourceTaskId === sourceTaskId,
        );
      } else if (sourceMessageId) {
        // Fallback to messageId if no taskId
        existingItem = state.items.find(
          (item) =>
            item.sourceMessageId === sourceMessageId && !item.sourceTaskId,
        );
      }

      if (existingItem) {
        // Item already exists - just switch to it and reopen
        state.currentItemId = existingItem.id;
        state.isOpen = true;
        // Update timestamp to mark as recently accessed
        existingItem.timestamp = Date.now();
        return;
      }

      // No existing item - create new one
      const newItem: CanvasItem = {
        id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
        content: action.payload,
        timestamp: Date.now(),
        sourceMessageId,
        sourceTaskId,
      };

      state.items.push(newItem);
      state.currentItemId = newItem.id;
      state.isOpen = true;
    },

    // Close canvas but keep history
    closeCanvas: (state) => {
      state.isOpen = false;
      // Keep items and currentItemId for reopen
    },

    // Toggle open/closed without losing state. Used by the global ⌘\ shortcut.
    toggleCanvas: (state) => {
      if (state.isOpen) {
        state.isOpen = false;
      } else if (state.currentItemId) {
        state.isOpen = true;
      }
    },

    // Clear all canvas history
    clearCanvas: (state) => {
      state.isOpen = false;
      state.items = [];
      state.currentItemId = null;
      state.secondaryItemId = null;
    },

    // Switch to a different canvas item (top pane in split mode)
    setCurrentItem: (state, action: PayloadAction<string>) => {
      const itemExists = state.items.some((item) => item.id === action.payload);
      if (itemExists) {
        // If user navigates the top pane to the same item that's in the
        // bottom pane, collapse the split so we don't show duplicates.
        if (state.secondaryItemId === action.payload) {
          state.secondaryItemId = null;
        }
        state.currentItemId = action.payload;
        state.isOpen = true;
      }
    },

    /**
     * Open the canvas in split mode with the given item in the BOTTOM pane.
     * If only one item exists, this is a no-op (you can't split with yourself).
     * If `itemId` is the current top item, falls back to the most recent
     * other item so a "Split" button always does something sensible.
     */
    splitCanvasWith: (state, action: PayloadAction<string | undefined>) => {
      if (!state.currentItemId || state.items.length < 2) return;
      const requested = action.payload;
      let target: string | undefined = requested;
      if (!target || target === state.currentItemId) {
        // Pick the most-recently-used item that isn't the top one.
        const others = state.items
          .filter((i) => i.id !== state.currentItemId)
          .sort((a, b) => b.timestamp - a.timestamp);
        target = others[0]?.id;
      }
      if (!target) return;
      state.secondaryItemId = target;
      state.isOpen = true;
    },

    /** Collapse the split — keeps the top pane, drops the bottom. */
    unsplitCanvas: (state) => {
      state.secondaryItemId = null;
    },

    /**
     * Swap the top and bottom panes — useful when the user wants the bottom
     * pane to be the "main" focus without closing either.
     */
    swapCanvasPanes: (state) => {
      if (!state.secondaryItemId || !state.currentItemId) return;
      const top = state.currentItemId;
      state.currentItemId = state.secondaryItemId;
      state.secondaryItemId = top;
    },

    /** Persist the top-pane ratio (0–100) while the user drags the handle. */
    setCanvasSplitRatio: (state, action: PayloadAction<number>) => {
      const next = Math.max(15, Math.min(85, action.payload));
      state.splitRatio = next;
    },

    // Remove a specific canvas item
    removeCanvasItem: (state, action: PayloadAction<string>) => {
      const itemIndex = state.items.findIndex(
        (item) => item.id === action.payload,
      );
      if (itemIndex !== -1) {
        state.items.splice(itemIndex, 1);

        // If we removed the secondary pane's item, just collapse the split.
        if (state.secondaryItemId === action.payload) {
          state.secondaryItemId = null;
        }

        // If we removed the current item, switch to the last one or close
        if (state.currentItemId === action.payload) {
          // Prefer promoting the secondary pane if one exists.
          if (state.secondaryItemId) {
            state.currentItemId = state.secondaryItemId;
            state.secondaryItemId = null;
          } else if (state.items.length > 0) {
            state.currentItemId = state.items[state.items.length - 1].id;
          } else {
            state.currentItemId = null;
            state.isOpen = false;
          }
        }
      }
    },

    // Update existing canvas item content
    updateCanvasContent: (
      state,
      action: PayloadAction<{ id?: string; content: CanvasContent }>,
    ) => {
      const { id, content } = action.payload;

      // If ID provided, update that specific item
      if (id) {
        const item = state.items.find((item) => item.id === id);
        if (item) {
          item.content = content;
          // Mark as not synced if content changes
          item.isSynced = false;
        }
      } else if (state.currentItemId) {
        // Update current item
        const item = state.items.find(
          (item) => item.id === state.currentItemId,
        );
        if (item) {
          item.content = content;
          // Mark as not synced if content changes
          item.isSynced = false;
        }
      } else {
        // No current item, create new one
        const newItem: CanvasItem = {
          id: `canvas-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`,
          content,
          timestamp: Date.now(),
          sourceMessageId: content.metadata?.sourceMessageId,
          isSynced: false,
        };
        state.items.push(newItem);
        state.currentItemId = newItem.id;
      }

      state.isOpen = true;
    },

    // Mark an item as synced to database
    markItemSynced: (
      state,
      action: PayloadAction<{ canvasItemId: string; savedItemId: string }>,
    ) => {
      const { canvasItemId, savedItemId } = action.payload;
      const item = state.items.find((item) => item.id === canvasItemId);
      if (item) {
        item.savedItemId = savedItemId;
        item.isSynced = true;
      }
    },

    // Mark an item as not synced (e.g., after edit)
    markItemUnsynced: (state, action: PayloadAction<string>) => {
      const item = state.items.find((item) => item.id === action.payload);
      if (item) {
        item.isSynced = false;
      }
    },

    // Set canvas availability (called by layouts that support canvas)
    setCanvasAvailable: (state, action: PayloadAction<boolean>) => {
      state.isAvailable = action.payload;
    },

    // Set canvas width (for persistence)
    setCanvasWidth: (state, action: PayloadAction<number>) => {
      state.canvasWidth = action.payload;
    },

    // Set preferred render mode
    setCanvasRenderMode: (state, action: PayloadAction<CanvasRenderMode>) => {
      state.renderMode = action.payload;
    },
  },
});

// Actions
export const {
  openCanvas,
  closeCanvas,
  toggleCanvas,
  clearCanvas,
  setCurrentItem,
  splitCanvasWith,
  unsplitCanvas,
  swapCanvasPanes,
  setCanvasSplitRatio,
  removeCanvasItem,
  updateCanvasContent,
  markItemSynced,
  markItemUnsynced,
  setCanvasAvailable,
  setCanvasWidth,
  setCanvasRenderMode,
} = canvasSlice.actions;

// Selectors — use optional chaining so these work safely with the lite Redux store
// (public layout includes the full store; canvas state is available if the slice is registered)
type WithCanvas = { canvas: CanvasState };

export const selectCanvasIsOpen = (state: WithCanvas) =>
  state.canvas?.isOpen ?? false;
export const selectCanvasItems = (state: WithCanvas) =>
  state.canvas?.items ?? [];
export const selectCurrentItemId = (state: WithCanvas) =>
  state.canvas?.currentItemId ?? null;
export const selectCanvasIsAvailable = (state: WithCanvas) =>
  state.canvas?.isAvailable ?? false;

// Get the currently active canvas item
export const selectCurrentCanvasItem = (
  state: WithCanvas,
): CanvasItem | null => {
  if (!state.canvas) return null;
  const { items, currentItemId } = state.canvas;
  if (!currentItemId) return null;
  return items.find((item) => item.id === currentItemId) || null;
};

// Get the secondary canvas item (split mode) or null
export const selectSecondaryCanvasItem = (
  state: WithCanvas,
): CanvasItem | null => {
  if (!state.canvas) return null;
  const { items, secondaryItemId } = state.canvas;
  if (!secondaryItemId) return null;
  return items.find((item) => item.id === secondaryItemId) || null;
};

export const selectSecondaryCanvasItemId = (state: WithCanvas) =>
  state.canvas?.secondaryItemId ?? null;

export const selectCanvasIsSplit = (state: WithCanvas) =>
  !!state.canvas?.secondaryItemId;

export const selectCanvasSplitRatio = (state: WithCanvas) =>
  state.canvas?.splitRatio ?? 55;

// Get current canvas content (for backward compatibility)
export const selectCanvasContent = (
  state: WithCanvas,
): CanvasContent | null => {
  const currentItem = selectCurrentCanvasItem(state);
  return currentItem?.content || null;
};

// Get canvas count
export const selectCanvasCount = (state: WithCanvas) =>
  state.canvas?.items?.length ?? 0;

// Get canvas width
export const selectCanvasWidth = (state: WithCanvas) =>
  state.canvas?.canvasWidth ?? 400;

// Get canvas render mode
export const selectCanvasRenderMode = (state: WithCanvas) =>
  state.canvas?.renderMode ?? "panel";

// Export types
export type { CanvasItem };

export default canvasSlice.reducer;
