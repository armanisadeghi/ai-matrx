// features/rich-document/types.ts
//
// Canonical types for the RichDocument feature.
//
// RichDocument is the wrapper that pairs the content engine (MarkdownStream /
// BasicMarkdownContent / ConfigurableMarkdownContent) with a generalized
// action surface — which replaced the chat-only AssistantActionBar (deleted in RC-B6).
//
// See `features/rich-document/FEATURE.md` for the full architecture and the
// per-source action compatibility matrix.

import type { LucideIcon } from "lucide-react";
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Note } from "@/features/notes/types";
import type { NoteSaveReceipt } from "@/features/notes/service/noteSaveErrors";

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
  | "working-document"
  | "raw";

export interface NoteEditBase {
  noteId: string;
  organizationId: string;
  /** The persisted CAS revision. Revision zero is valid. */
  version: number;
  actorId: string;
}

/** Full physical values displayed when a Notes editor was opened. */
export type NoteDisplayedPhysicalSnapshot = Omit<Pick<
  Note,
  | "id"
  | "organization_id"
  | "version"
  | "content"
  | "label"
  | "folder_name"
  | "folder_id"
  | "tags"
  | "metadata"
  | "visibility"
  | "position"
  | "project_id"
  | "task_id"
>, "content"> & { content: string };

export type NoteIdentityContentSource = {
  type: "note";
  mode: "identity";
  noteId: string;
  sourceId: string;
};

export type NoteEditableContentSource = {
  type: "note";
  mode: "editable";
  noteId: string;
  sourceId: string;
  snapshotId: string;
  editBase: NoteEditBase;
  /** Full persisted physical state for the captured CAS base. */
  acknowledgedPhysicalSnapshot: NoteDisplayedPhysicalSnapshot;
  displayedPhysicalSnapshot: NoteDisplayedPhysicalSnapshot;
  /** A selection is an action target only; it is never the persisted body. */
  actingSelection?: string;
};

/**
 * A source can be a READ-ONLY copy (the proving route loads a real record into
 * a scratch buffer). The flag rides the source itself, so every surface that
 * shows it — bar, ⋯ menu, right-click, hosted dialogs — honors it: no action
 * with `writesSource` is offered, and editors open without Save.
 */
export type ContentSource = ContentSourceIdentity & { readOnly?: boolean };

type ContentSourceIdentity =
  | {
      type: "chat-message";
      messageId: string;
      conversationId: string;
      streamRequestId?: string | null;
    }
  | NoteIdentityContentSource
  | NoteEditableContentSource
  | { type: "prompt-result"; executionId: string; promptId?: string }
  | { type: "artifact"; artifactId: string }
  | { type: "scraper-result"; runId: string }
  | {
      // The per-conversation collaborative working document / scratchpad
      // (features/agents/.../instance-working-document). `kind` distinguishes
      // the shared "working" doc from the private "scratch" pad. `documentId`
      // is the durable `cx_working_documents` backing id when one exists
      // (null while ephemeral or note-bound) — drives save-to-task linking.
      type: "working-document";
      conversationId: string;
      kind: "working" | "scratch";
      documentId?: string | null;
    }
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
  // Capture — formerly chat-only (messageActionRegistry), now every source
  | "add-to-rulebook"
  | "set-context-value"
  | "save-as-message-template"
  | "save-to-files"
  | "save-as-pdf"
  | "save-shape-instance"
  | "convert-to-study"
  // Share
  | "share-webpage"
  | "send-google-doc"
  // Listen
  | "summarize-for-listening"
  | "summarize-and-listen"
  // Transfer — copy / download every format the best AI apps offer
  | "copy-markdown"
  | "copy-plain-text"
  | "copy-rich-text"
  | "copy-html-source"
  | "copy-table-csv"
  | "copy-table-tsv"
  | "save-table-as-data"
  | "download-html"
  | "download-pdf"
  | "save-as-flashcard"
  // Ask in chat — the content rides as a context entry, never as user text
  | "quote-into-chat"
  | "ask-followup"
  // Text-field AI powers (ProTextarea hosts them)
  | "text-cleanup"
  | "text-help"
  | "text-custom-agent"
  // Chat user-message edit paths
  | "edit-and-resubmit"
  | "fork-and-regenerate"
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
  | "listen"
  | "study"
  | "ask"
  | "ai"
  | "admin";

// ============================================================================
// SOURCE EXTENSIONS — chat carries the most baggage; other sources tend to
// have small extension shapes. Discriminated so the registry can pull the
// right fields without optional-chaining everywhere.
// ============================================================================

export type SourceExtensions =
  | ChatMessageExtensions
  | { type: "note"; isOwner: boolean }
  | { type: "prompt-result"; canReRun: boolean }
  | { type: "artifact"; canEdit: boolean }
  | { type: "scraper-result" }
  | { type: "working-document" }
  | { type: "raw" };

/**
 * What a chat message carries beyond its identity. `ctx.content` is what the
 * reader SEES (the whole multi-iteration turn when the host groups one);
 * `messageContent` is the ONE cx_message row the write-back actions (edit,
 * HTML publish save) mutate. Built by `buildChatMessageActions` — the single
 * builder every chat host and the proving route share.
 */
export interface ChatMessageExtensions {
  type: "chat-message";
  role: "assistant" | "user";
  /** Single-message text of `source.messageId` (write-back target). */
  messageContent: string;
  /** True when the text is the JSON raw view of a structured payload. */
  contentIsStructuredRaw: boolean;
  /** Text-bearing row the assistant editor saves to (grouped turns). */
  editTarget: {
    content: string;
    messageId: string;
    isStructuredRaw: boolean;
  } | null;
  streamRequestId: string | null;
  contentHistoryCount: number;
  showFullPrint: boolean;
  isCapturing: boolean;
  groupMessageIds: string[];
}

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
    /**
     * The text the editor opened on, when that was a DISPLAY projection rather
     * than the stored bytes (chat: whitespace-normalized) — the adapter then
     * splices only the changed span into what is stored.
     */
    previousContent?: string;
    source: ContentSource;
    dispatch: AppDispatch;
  }) => Promise<void | NoteSaveReceipt>;

  /**
   * Resolves an action's editable snapshot before an overlay or callback group
   * exists. Non-note adapters may omit this; Notes uses it to turn an identity
   * trigger into one authorized, actor-bound physical snapshot.
   */
  prepareEdit?: (args: {
    source: ContentSource;
    actionText: string;
    dispatch: AppDispatch;
    isAuthenticated: boolean;
  }) => Promise<{ source: ContentSource; content: string }>;

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

export interface PreparedContentEdit {
  source: ContentSource;
  /** Always the complete displayed physical body for prepared Notes sources. */
  content: string;
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
  /** Open the host-owned edit-history dialog (chat only today). */
  onRequestEditHistory?: () => void;
  /** Open the host-owned ConvertContentDialog (the ONE convert-source dialog). */
  onRequestConvert?: () => void;
  /** Open the host-owned "save table as data" dialog for a parsed table. */
  onRequestSaveTable?: (table: { headers: string[]; rows: string[][] }) => void;
  /** Open the host-owned "save as flashcard" prompt (the text is the answer). */
  onRequestFlashcard?: (answer: string) => void;
  /**
   * Run one of a text field's own AI powers (clean up, help with this, custom
   * agent). Only a host that can APPLY a result back into the text supplies
   * it — ProTextarea today — so elsewhere those actions are absent.
   */
  onRequestTextAgentAction?: (
    actionId: "cleanup" | "help" | "customAgent",
    ctx: RichDocumentActionContext,
  ) => void;
}

export interface RichDocumentActionContext {
  // Always available
  content: string;
  source: ContentSource;
  metadata: Record<string, unknown> | null;
  dispatch: AppDispatch;
  /** Synchronous store read — titles, the answered question, org, roles. */
  getState: () => RootState;
  /** Active organization supplied by the action host for note writes. */
  organizationId: string | null;
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
  disabled?: (ctx: RichDocumentActionContext) => boolean | { reason: string };
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
  /**
   * The action changes the SOURCE record (edit, delete, fork, pin, regenerate,
   * apply an AI result…). Absent on a read-only source.
   */
  writesSource?: boolean;
  /**
   * A toggle's live state (a thumb's verdict, read-aloud playing). Renderers
   * paint the action "on" (its iconColor, aria-pressed) only while true; an
   * action with `active` defined reads as muted otherwise.
   */
  active?: (ctx: RichDocumentActionContext) => boolean;
  /**
   * Subscribe to whatever `active`/`label` read (a module store). Called by
   * the renderer; returns the unsubscribe. May also start a hydration read.
   */
  subscribe?: (
    onChange: () => void,
    ctx: RichDocumentActionContext,
  ) => () => void;
  /**
   * Keep the reader's text selection alive through the click (mousedown would
   * clear it) — read-aloud reads the selection when there is one.
   */
  preserveSelection?: boolean;
}

// ============================================================================
// VARIANT / POSITION / BEHAVIOR — three orthogonal axes describing the
// action surface. `variant` = WHAT renders, `position` = WHERE, `behavior`
// = visibility. The old conflated "hover-menu" is now expressed as
// `{ variant: "icon-only", position: "top-right", behavior: "hover-only" }`.
// ============================================================================

export type RichDocumentActionsVariant =
  /** Full inline action bar with primary buttons + overflow menu. */
  | "bar"
  /** Condensed icons-only bar + overflow. */
  | "mini-bar"
  /** Single ⋯ overflow button, all actions in dropdown. */
  | "menu"
  /** Single ⋯ trigger — same renderer as "menu", named for absolute/hover use. */
  | "icon-only"
  /** No inline UI — registers to a remote <RichDocumentActionSurface/>. */
  | "remote"
  /** Hide actions entirely. */
  | "none";

/** Where the action surface sits relative to the content. */
export type RichDocumentActionsPosition =
  /** In-flow, below the content (default). */
  | "below"
  /** In-flow, above the content. */
  | "above"
  /** Absolutely positioned, layered over the content. */
  | "top-right"
  | "top-left"
  | "middle-right"
  | "middle-left";

/** Visibility behavior of the action surface. */
export type RichDocumentActionsBehavior =
  /** Always visible (default). */
  | "always"
  /** Hidden until the content is hovered/focused (fades in). */
  | "hover-only";

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
  /** Source metadata (cx_message.metadata, …) — rides into saves/exports. */
  metadata?: Record<string, unknown> | null;
  /** Viewer owns the agent that produced the content (creator tools). */
  isCreator?: boolean;
  /** UI surface the host belongs to — fork/delete outcomes route through it. */
  surfaceKey?: string | null;
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
  /** Pure metadata; no functions. Registration order is encoded by the
   * provider stack's array order, so no timestamp is needed. */
  computedActionSpecs: RichDocumentActionSpec[];
  /** Render-safe canonical identity for transfer workspace cache ownership. */
  contentSourceId: string;
  /** The source type — useful for the renderer to label the surface. */
  sourceType: ContentSourceType;
}
