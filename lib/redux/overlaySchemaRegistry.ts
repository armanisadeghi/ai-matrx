// lib/redux/overlaySchemaRegistry.ts
//
// Compile-time schema registry for instanced overlays.
//
// Schemas are plain TypeScript objects — NOT Redux state. They define the
// default data shape for overlays that participate in the overlayDataSlice
// lifecycle. When openOverlayInstance() is called for an overlay with a
// registered schema, the schema defaults are merged with any caller-supplied
// data before being written to Redux and before the overlay is opened.
//
// Adding a schema for an overlay is OPTIONAL. Overlays without schemas still
// work identically — the instanceId routing is handled by overlaySlice
// regardless of whether a schema exists.
//
// Schema keys match the overlayId strings used in overlaySlice initialState.

// ============================================================================
// TYPES
// ============================================================================

export interface OverlaySchema<T = Record<string, unknown>> {
  /** Default data values merged with caller-supplied data on open. */
  defaults: T;
}

// ============================================================================
// PER-OVERLAY SCHEMA INTERFACES
// (document the expected shape of each overlay's data blob)
// ============================================================================

export interface HtmlPreviewSchema {
  content: string;
  messageId?: string;
  conversationId?: string;
  title: string;
  description: string;
  showSaveButton: boolean;
}

type EditorTabId = "write" | "matrx_split" | "markdown" | "wysiwyg" | "preview";

export interface FullScreenEditorSchema {
  content: string;
  tabs: EditorTabId[];
  initialTab: EditorTabId;
  showSaveButton: boolean;
  showCopyButton: boolean;
  messageId?: string;
  title?: string;
}

export interface SaveToNotesSchema {
  content: string;
  defaultFolder: string;
}

export interface ShareModalSchema {
  resourceType: string;
  resourceId: string;
  resourceName: string;
  isOwner: boolean;
}

// ============================================================================
// REGISTRY
// ============================================================================

export const overlaySchemaRegistry: Partial<Record<string, OverlaySchema>> = {
  htmlPreview: {
    defaults: {
      content: "",
      title: "HTML Preview & Publishing",
      description: "Edit markdown, preview HTML, and publish your content",
      showSaveButton: false,
    } satisfies Partial<HtmlPreviewSchema>,
  },

  fullScreenEditor: {
    defaults: {
      content: "",
      tabs: ["write", "matrx_split", "markdown", "wysiwyg", "preview"],
      initialTab: "matrx_split",
      showSaveButton: true,
      showCopyButton: true,
    } satisfies Partial<FullScreenEditorSchema>,
  },

  saveToNotes: {
    defaults: {
      content: "",
      defaultFolder: "Scratch",
    } satisfies SaveToNotesSchema,
  },

  shareModal: {
    defaults: {
      resourceType: "",
      resourceId: "",
      resourceName: "",
      isOwner: false,
    } satisfies ShareModalSchema,
  },

  // Additional overlays can be registered here as their schemas are defined.
  // Overlays without entries here continue to work — they just don't get
  // schema-based default merging in openOverlayInstance().
};
