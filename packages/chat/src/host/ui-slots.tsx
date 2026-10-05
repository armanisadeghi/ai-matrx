"use client";

/**
 * host/ui-slots — host registrations for app UI the package draws but does not own
 * (PACKAGE-INDEPENDENCE.md: "a host registration", not an import of app code).
 *
 * The host registers once at startup with `registerChatUi({...})`; package code
 * imports the named wrappers below. A component the host did not register renders
 * nothing (or its plain stand-in, marked `data-chat-slot-fallback`) and reports itself
 * ONCE through the host diagnostics port (never silent: Law 4); a function or hook it
 * did not register throws, naming the slot (or runs its declared stand-in, reported once). A test registers a stand-in the same way (`registerChatUi`).
 *
 * Slot shapes are the host component's own props — package call sites keep passing
 * exactly what they passed when they imported the component directly.
 */

import { createElement, Fragment, useRef, type ComponentType, type ReactNode } from "react";
import { announceOnce } from "./errors";
import { reportUnregisteredHostSlot as reportUnregistered } from "./diagnostics";
import { DefaultWebpageSnapshotView } from "./defaults/webpage-snapshot-view";
import { DefaultFullScreenOverlay, DefaultWindowPanel } from "./defaults/window-panel";
import type { EditableContextMenuProps, NonEditableContextMenuProps } from "../context-menu/types";

/** The host context menu's props (its registration is typed against them). */
export type { EditableContextMenuProps, NonEditableContextMenuProps };

/* eslint-disable @typescript-eslint/no-explicit-any */
type AnyComponent = ComponentType<any>;
type AnyFn = (...args: any[]) => any;

export interface ChatUiSlots {
  // Components
  RichContent: AnyComponent;
  CopyButtons: AnyComponent;
  InfoHint: AnyComponent;
  AnswerValueView: AnyComponent;
  ErrorAlchemyMenu: AnyComponent;
  EntityRef: AnyComponent;
  AdvancedMenu: AnyComponent;
  AuthGateDialog: AnyComponent;
  EmailInputDialog: AnyComponent;
  DockedSidePanel: AnyComponent;
  EditableContextMenu: ComponentType<EditableContextMenuProps>;
  NonEditableContextMenu: ComponentType<NonEditableContextMenuProps>;
  TableChooser: AnyComponent;
  FileResourceChip: AnyComponent;
  ConnectorMark: AnyComponent;
  InPlaceEditor: AnyComponent;
  EditInPlace: AnyComponent;
  // Message widgets and tool-call cards the app owns (P20): a bare host shows a one-line
  // labelled stand-in naming the widget (PACKAGE-INDEPENDENCE.md section 5.1), never a blank.
  MessageFilesStrip: AnyComponent;
  RulebookNudge: AnyComponent;
  NegativeVerdictFollowUp: AnyComponent;
  SpeakerButton: AnyComponent;
  GmailReviewCard: AnyComponent;
  ShareButton: AnyComponent;
  ShareModal: AnyComponent;
  ReviewAnswersLink: AnyComponent;
  RecordChangeApprovalCard: AnyComponent;
  /** The exact webpage text selected for a message (the scraper's pretty view). */
  WebpageSnapshotView: AnyComponent;
  // Connections: the composer's attached-resources list and the new-chat connector prompt.
  AttachedResourcesSection: AnyComponent;
  ConnectorPromptHost: AnyComponent;
  /** The inline error card (title, sentence, actions); the host's carries the Alchemy menu. */
  ErrorNotice: AnyComponent;
  // Context-item drawer bodies the app owns (notes and tasks are app features).
  NoteBody: AnyComponent;
  NoteFooter: AnyComponent;
  NoteTitleActions: AnyComponent;
  TaskBody: AnyComponent;
  RichDocument: AnyComponent;
  // Builder doors: the agent builder's editors, reached from the run-controls window.
  SystemInstructionEditor: AnyComponent;
  SystemInstructionModal: AnyComponent;
  // Functions and hooks
  confirm: AnyFn;
  copyRichContent: AnyFn;
  copyToClipboard: AnyFn;
  useTablesEverywhere: AnyFn;
  useTextareaFormatting: AnyFn;
  useClipboardPaste: AnyFn;
  useCenterControlFit: AnyFn;
  useInPlaceTrigger: AnyFn;
  connectorDefinitionFromMcp: AnyFn;
  notesCreate: AnyFn;
  useKnowledgeAttachSearch: AnyFn;
  useConversationAttachments: AnyFn;
  /** One connect / re-authorize action for an MCP server: `{ connect(slug), connectingSlug }`. */
  useConnectMcpServer: AnyFn;
  /** The attachments doors (the host owns the transport and the sign-in): what is attached to a chat, attach, detach. */
  fetchConversationAttachments: AnyFn;
  attachConversationResource: AnyFn;
  detachConversationResource: AnyFn;
  /** A surface's declaration by name (the host's manifest registry); a host with none declares nothing. */
  getSurfaceManifest: AnyFn;
  /** Registers this page's capture for the "copy this page" control (the host's page-capture registry). */
  usePageCapture: AnyFn;
  /** A descendant's sections for the page capture. */
  usePageCaptureContribution: AnyFn;
  /** The NAME of the table a held write is about (`string | null`); a host that cannot name it leaves the table out. */
  useHeldWriteTableName: AnyFn;
  /** The platform-owned organization's id (`iam.system_orgs`); only a global-scope write needs it. */
  resolveSystemOrgId: AnyFn;
  /** The organization a project or task belongs to, as `{ data, error }` (the projects schema is the host's). */
  readProjectScopeOrganizationId: AnyFn;
  summarizeContextCell: AnyFn;
  useEntityTitles: AnyFn;
  /** The skills the host has loaded: `{ status, skills }` (a host with none answers nothing loaded). */
  loadedSkills: AnyFn;
  /** Dev-only render-path tracing for the war-room tile; a host without it traces nothing. */
  traceWarRoomRenderPath: AnyFn;
  isWarRoomThreadAgentSurface: AnyFn;
  /** Opens a cloud-browser run in the host's canvas; a host without one gets a no-op opener. */
  useOpenCloudBrowserCanvas: AnyFn;
  cloudBrowserCanvasSourceId: AnyFn;
  // Windows and pickers (P18). A bare host draws the package's floating-window default.
  WindowPanel: AnyComponent;
  FullScreenOverlay: AnyComponent;
  ResourcePickerWindow: AnyComponent;
  ResourcePickerMenu: AnyComponent;
  FilesResourcePicker: AnyComponent;
  NotePickerPopover: AnyComponent;
  SmartInputMessageTemplatePicker: AnyComponent;
  flattenResourcePickerItems: AnyFn;
  useRunControlCounts: AnyFn;
  useAttachResourcePicker: AnyFn;
  usePopoutContainer: AnyFn;
  useUrlSync: AnyFn;
  useOverlaySurfaceRenderAck: AnyFn;
  disposeFullScreenEditorCallbackGroup: AnyFn;
  emitFullScreenEditorSave: AnyFn;
}
/* eslint-enable @typescript-eslint/no-explicit-any */

const slots: Partial<ChatUiSlots> = {};

/** The host's registration (idempotent; later calls override named slots). */
export function registerChatUi(next: Partial<ChatUiSlots>): void {
  Object.assign(slots, next);
}

/** Test seam: forget every registration. */
export function resetChatUiForTests(): void {
  for (const key of Object.keys(slots)) delete slots[key as keyof ChatUiSlots];
}

function slotComponent<K extends keyof ChatUiSlots>(name: K, Fallback?: AnyComponent): ChatUiSlots[K] {
  const Wrapper = (props: object) => {
    const Impl = slots[name] as AnyComponent | undefined;
    if (!Impl) {
      reportUnregistered(name, Fallback ? "a plain stand-in is drawn" : "it renders nothing here");
      return Fallback ? createElement(Fallback, props) : null;
    }
    return createElement(Impl, props);
  };
  Wrapper.displayName = `ChatUi(${name})`;
  return Wrapper as ChatUiSlots[K];
}

/** The generic default for an app widget nobody registered: one labelled line naming it. */
function unregisteredWidget(name: string): AnyComponent {
  const UnregisteredWidget = () =>
    createElement(
      "span",
      { className: "text-[11px] text-muted-foreground", "data-chat-slot-fallback": name },
      `${name} is not set up here`,
    );
  UnregisteredWidget.displayName = `UnregisteredWidget(${name})`;
  return UnregisteredWidget;
}

/**
 * A named slot with the caller's own stand-in (for a package default richer than one line,
 * e.g. a context-item body falling back to `GenericBody`). Same contract as the wrappers above:
 * unregistered -> the stand-in, reported once.
 */
export function hostSlot<K extends keyof ChatUiSlots>(name: K, Fallback?: AnyComponent): ChatUiSlots[K] {
  return slotComponent(name, Fallback);
}

/**
 * A slot named `use*` is a HOOK, and a hook's implementation must not change under a mounted
 * component: the stand-in has no hooks and the registered one has many, so a registration that
 * lands (or is wiped and re-landed by a hot reload) between two renders changes the hook count —
 * "change in the order of Hooks", a useMemoCache size mismatch, and the component's memoised
 * values read as undefined. Each component instance therefore latches the implementation it
 * resolved on its FIRST render and calls that one for its whole life. The latch itself is one
 * `useRef`, called unconditionally, so the count is stable by construction.
 */
function slotHook<K extends keyof ChatUiSlots>(name: K, fallback?: AnyFn): ChatUiSlots[K] {
  const hook = (...args: unknown[]) => {
    // eslint-disable-next-line react-hooks/rules-of-hooks -- this IS a hook (named use*)
    const latched = useRef<AnyFn | null>(null);
    if (latched.current === null) {
      const registered = slots[name] as AnyFn | undefined;
      if (registered) latched.current = registered;
      else if (!fallback) throw new Error(`The host registered no "${name}" for the chat package (registerChatUi).`);
      else {
        reportUnregistered(name, "its plain stand-in runs");
        latched.current = fallback;
      }
    }
    return latched.current(...args);
  };
  return hook as ChatUiSlots[K];
}

function slotFn<K extends keyof ChatUiSlots>(name: K, fallback?: AnyFn): ChatUiSlots[K] {
  if (/^use[A-Z]/.test(name)) return slotHook(name, fallback);
  const fn = (...args: unknown[]) => {
    const registered = slots[name] as AnyFn | undefined;
    if (registered) return registered(...args);
    if (!fallback) throw new Error(`The host registered no "${name}" for the chat package (registerChatUi).`);
    reportUnregistered(name, "its plain stand-in runs");
    return fallback(...args);
  };
  return fn as ChatUiSlots[K];
}

/** A host with no rich renderer shows the text as it is. */
export const RichContent = slotComponent("RichContent", ({ source, className }: { source?: unknown; className?: string }) =>
  createElement("div", { className, "data-chat-slot-fallback": "RichContent" }, typeof source === "string" ? source : ""),
);
export const CopyButtons = slotComponent("CopyButtons");
export const InfoHint = slotComponent("InfoHint");
export const AnswerValueView = slotComponent("AnswerValueView");
/** A host with no error menu draws one labelled line; the error sentence itself is already on screen. */
export const ErrorAlchemyMenu = slotComponent("ErrorAlchemyMenu", unregisteredWidget("ErrorAlchemyMenu"));
/** A host with no error card draws the plain sentence, its actions and children, marked as the stand-in. */
export const ErrorNotice = slotComponent(
  "ErrorNotice",
  ({ title, message, error, actions, children, className }: { title?: string; message?: string | null; error?: unknown; actions?: ReactNode; children?: ReactNode; className?: string }) =>
    createElement(
      "div",
      { className: `rounded-md border border-destructive/40 p-2 text-sm ${className ?? ""}`, "data-chat-slot-fallback": "ErrorNotice" },
      title ? createElement("div", { className: "font-medium" }, title) : null,
      createElement("div", null, message || (error instanceof Error ? error.message : typeof error === "string" ? error : "")),
      children ?? null,
      actions ?? null,
    ),
);
export const EntityRef = slotComponent("EntityRef");
export const AdvancedMenu = slotComponent("AdvancedMenu");
export const AuthGateDialog = slotComponent("AuthGateDialog");
export const EmailInputDialog = slotComponent("EmailInputDialog");
export const DockedSidePanel = slotComponent("DockedSidePanel");
/**
 * A host with no context menu draws the wrapped content as it is (no right-click menu); the
 * missing menu is reported once. The content is never dropped.
 */
function contentWithoutMenu(name: string): AnyComponent {
  const ContentWithoutMenu = ({ children }: { children?: ReactNode }) => createElement(Fragment, null, children ?? null);
  ContentWithoutMenu.displayName = `ContentWithoutMenu(${name})`;
  return ContentWithoutMenu;
}
export const EditableContextMenu = slotComponent("EditableContextMenu", contentWithoutMenu("EditableContextMenu"));
export const NonEditableContextMenu = slotComponent("NonEditableContextMenu", contentWithoutMenu("NonEditableContextMenu"));
export const TableChooser = slotComponent("TableChooser");
export const FileResourceChip = slotComponent("FileResourceChip");
export const ConnectorMark = slotComponent("ConnectorMark");
export const InPlaceEditor = slotComponent("InPlaceEditor");
/** A host with no in-place editor shows the text and offers no edit. */
export const EditInPlace = slotComponent("EditInPlace", ({ children }: { children?: ReactNode }) => children ?? null);

export const MessageFilesStrip = slotComponent("MessageFilesStrip", unregisteredWidget("MessageFilesStrip"));
export const RulebookNudge = slotComponent("RulebookNudge", unregisteredWidget("RulebookNudge"));
export const NegativeVerdictFollowUp = slotComponent("NegativeVerdictFollowUp", unregisteredWidget("NegativeVerdictFollowUp"));
export const SpeakerButton = slotComponent("SpeakerButton", unregisteredWidget("SpeakerButton"));
export const GmailReviewCard = slotComponent("GmailReviewCard", unregisteredWidget("GmailReviewCard"));
export const ShareButton = slotComponent("ShareButton", unregisteredWidget("ShareButton"));
export const ShareModal = slotComponent("ShareModal", unregisteredWidget("ShareModal"));
export const ReviewAnswersLink = slotComponent("ReviewAnswersLink", unregisteredWidget("ReviewAnswersLink"));
export const RecordChangeApprovalCard = slotComponent("RecordChangeApprovalCard", unregisteredWidget("RecordChangeApprovalCard"));
export const AttachedResourcesSection = slotComponent("AttachedResourcesSection", unregisteredWidget("AttachedResourcesSection"));
/** A host with no connector prompt shows none (reported once). */
export const ConnectorPromptHost = slotComponent("ConnectorPromptHost");
export const WebpageSnapshotView = slotComponent("WebpageSnapshotView", DefaultWebpageSnapshotView);

export const confirm = slotFn("confirm");
export const copyRichContent = slotFn("copyRichContent");
export const copyToClipboard = slotFn("copyToClipboard");
export const useTablesEverywhere = slotFn("useTablesEverywhere");
export const useTextareaFormatting = slotFn("useTextareaFormatting", () => undefined);
export const useClipboardPaste = slotFn("useClipboardPaste");
export const useCenterControlFit = slotFn("useCenterControlFit");
export const useInPlaceTrigger = slotFn("useInPlaceTrigger", () => ({ readProps: {} }));
export const connectorDefinitionFromMcp = slotFn("connectorDefinitionFromMcp");
export const notesCreate = slotFn("notesCreate");
export const useKnowledgeAttachSearch = slotFn("useKnowledgeAttachSearch");
export const useConversationAttachments = slotFn("useConversationAttachments");
export const useHeldWriteTableName = slotFn("useHeldWriteTableName", () => null);
/** A host with no manifest registry has declared no surface: the bridge's handle reports it by name when asked for scope. */
export const getSurfaceManifest = slotFn("getSurfaceManifest", () => undefined);
/** A host with no page-capture control captures nothing; the hooks are reported no-ops. */
export const usePageCapture = slotFn("usePageCapture", () => undefined);
export const usePageCaptureContribution = slotFn("usePageCaptureContribution", () => undefined);
export const fetchConversationAttachments = slotFn("fetchConversationAttachments");
export const attachConversationResource = slotFn("attachConversationResource");
export const detachConversationResource = slotFn("detachConversationResource");
export const useConnectMcpServer = slotFn("useConnectMcpServer", () => ({ connect: () => undefined, connectingSlug: null }));
export const resolveSystemOrgId = slotFn("resolveSystemOrgId");
export const readProjectScopeOrganizationId = slotFn("readProjectScopeOrganizationId");
export const summarizeContextCell = slotFn("summarizeContextCell", (cell: unknown) =>
  typeof cell === "string" ? cell : JSON.stringify(cell ?? null),
);
/** A host with no entity directory titles nothing; callers fall back to the raw reference. */
export const useEntityTitles = slotFn("useEntityTitles", () => ({ titleFor: () => undefined }));
export const loadedSkills = slotFn("loadedSkills", () => ({ status: "idle", skills: [] }));
/** A host with no war-room tile has nothing to trace; the call is a reported no-op. */
export const traceWarRoomRenderPath = slotFn("traceWarRoomRenderPath", () => undefined);
export const isWarRoomThreadAgentSurface = slotFn("isWarRoomThreadAgentSurface", () => false);
/** A host with no cloud browser opens nothing; the opener is a reported no-op. */
export const useOpenCloudBrowserCanvas = slotFn("useOpenCloudBrowserCanvas", () => () => undefined);
/** A host with no rich document viewer shows the text as it is, marked as the stand-in. */
export const RichDocument = slotComponent("RichDocument", ({ content, className }: { content?: unknown; className?: string }) =>
  createElement("div", { className: `whitespace-pre-wrap text-sm ${className ?? ""}`, "data-chat-slot-fallback": "RichDocument" }, typeof content === "string" ? content : ""),
);
/** The canvas identity of one chat's cloud browser (the host's own scheme; a bare host just keys by chat). */
export const cloudBrowserCanvasSourceId = slotFn("cloudBrowserCanvasSourceId", (conversationId: string) => `cloud-browser:${conversationId}`);
/** Builder doors: a host without the agent builder shows one labelled line where the editor would be. */
export const SystemInstructionEditor = slotComponent("SystemInstructionEditor", unregisteredWidget("SystemInstructionEditor"));
export const SystemInstructionModal = slotComponent("SystemInstructionModal", unregisteredWidget("SystemInstructionModal"));

// ── Windows and pickers (P18) ────────────────────────────────────────────────
/** A bare host draws the package's own floating window; the app registers its window manager's. */
export const WindowPanel = slotComponent("WindowPanel", DefaultWindowPanel);
/** A bare host draws a plain full-screen tabbed sheet. */
export const FullScreenOverlay = slotComponent("FullScreenOverlay", DefaultFullScreenOverlay);
export const ResourcePickerWindow = slotComponent("ResourcePickerWindow", unregisteredWidget("ResourcePickerWindow"));
export const ResourcePickerMenu = slotComponent("ResourcePickerMenu", unregisteredWidget("ResourcePickerMenu"));
export const FilesResourcePicker = slotComponent("FilesResourcePicker", unregisteredWidget("FilesResourcePicker"));
export const NotePickerPopover = slotComponent("NotePickerPopover", unregisteredWidget("NotePickerPopover"));
export const SmartInputMessageTemplatePicker = slotComponent(
  "SmartInputMessageTemplatePicker",
  unregisteredWidget("SmartInputMessageTemplatePicker"),
);
/** A host with no resource picker offers no items. */
export const flattenResourcePickerItems = slotFn("flattenResourcePickerItems", () => []);
export const useRunControlCounts = slotFn("useRunControlCounts", () => ({}));
/** Same shape as the host door (`features/connectors/useAttachResourcePicker`): the hook returns the open function. A host with no picker opens nothing. */
export const useAttachResourcePicker = slotFn("useAttachResourcePicker", () => (_options: unknown) => undefined);
/** A host with no popout windows portals into the page body (Radix default). */
export const usePopoutContainer = slotFn("usePopoutContainer", () => undefined);
/** A host with no window address (`panels=`) publishes nothing. */
export const useUrlSync = slotFn("useUrlSync", () => undefined);
export const useOverlaySurfaceRenderAck = slotFn("useOverlaySurfaceRenderAck", () => undefined);
export const disposeFullScreenEditorCallbackGroup = slotFn("disposeFullScreenEditorCallbackGroup", () => undefined);
export const emitFullScreenEditorSave = slotFn("emitFullScreenEditorSave", () =>
  Promise.reject(new Error("This host has no full-screen editor save target")),
);
