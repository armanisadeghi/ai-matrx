// features/rich-document/types.ts
//
// Canonical types for the RichDocument feature.
//
// RichDocument is the wrapper that pairs the content engine (MarkdownStream /
// BasicMarkdownContent / ConfigurableMarkdownContent) with a generalized
// action surface — replacing the previously chat-only AssistantActionBar.
//
// See `features/rich-document/FEATURE.md` for the full architecture and the
// per-source action compatibility matrix.

import type { LucideIcon } from "lucide-react";
import type { AppDispatch } from "@/lib/redux/store";

// ============================================================================
// CONTENT SOURCE — discriminated union; each variant carries enough to drive
// the per-source adapter (edit/delete/re-run handlers) and instanceKey
// derivation for overlay openings.
// ============================================================================

export type ContentSourceType =
  | "chat-message"
  | "note"
  | "prompt-result"
  | "artifact"
  | "scraper-result"
  | "raw";

export type ContentSource =
  | {
      type: "chat-message";
      messageId: string;
      conversationId: string;
      streamRequestId?: string | null;
    }
  | { type: "note"; noteId: string }
  | { type: "prompt-result"; executionId: string; promptId?: string }
  | { type: "artifact"; artifactId: string }
  | { type: "scraper-result"; runId: string }
  | { type: "raw" };

// ============================================================================
// ACTION IDS — central enum of built-in actions. `extra` actions may use any
// string ID; collisions with built-ins are caller error.
// ============================================================================

export type RichDocumentActionId =
  // Feedback
  | "thumbs-up"
  | "thumbs-down"
  // Copy
  | "copy"
  | "copy-google-docs"
  | "copy-word"
  | "copy-with-thinking"
  // Save
  | "save-as-file"
  | "save-to-notes"
  | "save-to-scratch"
  | "save-code-to-scratch"
  | "save-to-code"
  | "save-to-task"
  // Export
  | "html-preview"
  | "copy-html-page"
  | "email-to-me"
  | "print"
  | "full-print"
  // Edit
  | "edit"
  | "edit-history"
  | "fork-at-message"
  | "delete-message"
  // Voice
  | "tts-play"
  // Fullscreen editor
  | "open-fullscreen-editor"
  // Creator-only
  | "analyze-response"
  | "debug-stream"
  // App-level
  | "submit-feedback"
  | "announcements"
  | "preferences"
  // Stubs
  | "convert-to-broker"
  | "add-to-docs"
  // Server-API admin family (expands internally)
  | "server-api-admin";

export type ActionCategory =
  | "feedback"
  | "copy"
  | "export"
  | "save"
  | "edit"
  | "share"
  | "creator"
  | "app"
  | "admin";

// ============================================================================
// SOURCE EXTENSIONS — chat carries the most baggage; other sources tend to
// have small extension shapes. Discriminated so the registry can pull the
// right fields without optional-chaining everywhere.
// ============================================================================

export type SourceExtensions =
  | {
      type: "chat-message";
      streamRequestId: string | null;
      contentHistoryCount: number;
      showFullPrint: boolean;
      isCapturing: boolean;
      groupMessageIds: string[];
    }
  | { type: "note"; isOwner: boolean }
  | { type: "prompt-result"; canReRun: boolean }
  | { type: "artifact"; canEdit: boolean }
  | { type: "scraper-result" }
  | { type: "raw" };

// ============================================================================
// CONTENT SOURCE ADAPTER — per-source handlers for source-specific operations
// (edit, delete, re-run). Looked up by source.type from a static map in
// `actions/sources/index.ts`. Each method is optional; missing methods mean
// the corresponding action hides itself for that source.
// ============================================================================

export interface ContentSourceAdapter {
  /**
   * Persist edited content back to the source. Implementations dispatch the
   * appropriate thunk or call the service. For chat-message this dispatches
   * editMessage; for note this calls NotesAPI.update; etc.
   */
  edit?: (args: {
    newContent: string;
    source: ContentSource;
    dispatch: AppDispatch;
  }) => Promise<void> | void;

  /** Delete the source record. */
  delete?: (args: {
    source: ContentSource;
    dispatch: AppDispatch;
  }) => Promise<void> | void;

  /** Re-run / regenerate the content (prompt-result only at first). */
  reRun?: (args: {
    source: ContentSource;
    dispatch: AppDispatch;
  }) => Promise<void> | void;

  /**
   * Returns a stable, source-specific prefix used to build overlay
   * instanceIds. Example for note: `note-${noteId}`. Implementations should
   * include enough of the source identifier that two distinct sources never
   * collide. Used by ctx.instanceKey(prefix).
   */
  instanceKeyPrefix: (source: ContentSource) => string;
}

// ============================================================================
// ACTION CONTEXT — the runtime context passed to every action's `run`,
// `visible`, and `disabled` predicates. Carries the live content (via a
// getter inside the surface slice, so handlers always see the latest text),
// the source, dispatch, auth flags, and any host-supplied callbacks.
// ============================================================================

export interface RichDocumentActionContextCallbacks {
  /** Notify the host that the user committed an edit. Used by chat to route
   * through OverlayController's atomic edit path (no closure in Redux). */
  onEdit?: (newContent: string) => void;
  /** Trigger the parent's full-page print pipeline (chat only today). */
  onFullPrint?: () => void;
  /** Open the host-owned destructive-vs-fork dialog (chat only today). */
  onRequestDelete?: () => void;
  /** Local visual-only thumbs feedback (chat only today; no Redux). */
  onThumbsUp?: () => void;
  onThumbsDown?: () => void;
}

export interface RichDocumentActionContext {
  // Always available
  content: string;
  source: ContentSource;
  metadata: Record<string, unknown> | null;
  dispatch: AppDispatch;
  isAuthenticated: boolean;
  isAdmin: boolean;
  isCreator: boolean;
  surfaceKey: string | null;
  onClose: () => void;
  /** Build an overlay instanceId stable per source — e.g. `save-notes-${noteId}`. */
  instanceKey: (prefix: string) => string;
  /** Source-specific edit/delete/re-run bridge. */
  sourceAdapter: ContentSourceAdapter;
  /** Per-instance callbacks the host wants to plug in. */
  callbacks?: RichDocumentActionContextCallbacks;
  /** Source-specific extensions. Discriminated so chat-only fields don't pollute the base shape. */
  extensions?: SourceExtensions;
}

// ============================================================================
// ACTION — the unit of work surfaced in any RichDocument variant.
// ============================================================================

export interface RichDocumentAction {
  /** Unique ID. Built-ins use RichDocumentActionId; extras may use any string. */
  id: RichDocumentActionId | string;
  label: string | ((ctx: RichDocumentActionContext) => string);
  icon: LucideIcon;
  /**
   * Optional Tailwind color class(es) applied to the icon. Preserves the
   * per-action visual variety from the legacy registry (text-blue-500
   * dark:text-blue-400, etc.). Variant renderers may ignore this if they
   * have a stricter visual system.
   */
  iconColor?: string;
  category: ActionCategory;
  /** Which source types this action operates on. "*" = all sources. */
  supportedSources: ContentSourceType[] | "*";
  /** Optional visibility predicate. Default: true. */
  visible?: (ctx: RichDocumentActionContext) => boolean;
  /** Optional disabled predicate. Returns boolean OR a reason for tooltips. */
  disabled?: (
    ctx: RichDocumentActionContext,
  ) => boolean | { reason: string };
  /** The handler. May be async. */
  run: (ctx: RichDocumentActionContext) => void | Promise<void>;
  /**
   * Default render slot.
   * "primary" — inline bar only.
   * "overflow" — ⋯ menu only.
   * "both" — mirrored in both.
   * Default: "overflow".
   */
  renderSlot?: "primary" | "overflow" | "both";
  /** Default sort weight within category (lower = earlier). */
  order?: number;
  /** Action requires authentication. Hidden when isAuthenticated is false. */
  requiresAuth?: boolean;
}

// ============================================================================
// VARIANT — how the action surface renders.
// ============================================================================

export type RichDocumentActionsVariant =
  /** Full inline action bar with primary buttons + overflow menu. */
  | "bar"
  /** Condensed icons-only bar + overflow. */
  | "mini-bar"
  /** Single ⋯ overflow button, all actions in dropdown. */
  | "menu"
  /** ⋯ button absolutely positioned top-right, fades in on hover. */
  | "hover-menu"
  /** No inline UI — registers to a remote <RichDocumentActionSurface/>. */
  | "remote"
  /** Hide actions entirely. */
  | "none";

// ============================================================================
// ACTION SELECTION — the `actions` prop on RichDocument.
// ============================================================================

export interface RichDocumentActionsProp {
  /** Built-in action IDs (or custom IDs) to hide. All built-ins included by default. */
  exclude?: (RichDocumentActionId | string)[];
  /** Custom actions appended to the registry. Typically open an overlay via dispatch. */
  extra?: RichDocumentAction[];
  /** Optional callbacks the registry's handlers can call. */
  callbacks?: RichDocumentActionContextCallbacks;
  /** Source-specific extensions to merge into the context. */
  extensions?: SourceExtensions;
}

// ============================================================================
// PROVIDER REGISTRATION (for the remote-surface slice)
// ============================================================================

/**
 * A snapshot of action metadata stored in Redux for a remote surface.
 *
 * Intentionally CONTAINS NO FUNCTIONS — handlers, getters, and callbacks are
 * kept out of Redux state. The renderer looks up handlers by `id` from the
 * in-memory registry at render time, using the live getters supplied via the
 * provider's imperative API (registered on mount, kept in module scope).
 */
export interface RichDocumentActionSpec {
  id: RichDocumentActionId | string;
  label: string;
  iconName: string; // serializable name — renderer maps back to LucideIcon
  category: ActionCategory;
  renderSlot: "primary" | "overflow" | "both";
  order: number;
  disabled: boolean;
  disabledReason?: string;
}

export interface RichDocumentSurfaceRegistration {
  /** Stable per-instance ID generated by the registering RichDocument. */
  providerId: string;
  /** Ordered when registered — used to break ties in stack-resolution debugging. */
  registeredAt: number;
  /** Pure metadata; no functions. */
  computedActionSpecs: RichDocumentActionSpec[];
  /** The source type — useful for the renderer to label the surface. */
  sourceType: ContentSourceType;
}
