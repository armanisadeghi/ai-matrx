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
import { formatCost, usdToPoints } from "@ai-matrx/kit/format";
import { announceOnce } from "./errors";
import { reportUnregisteredHostSlot as reportUnregistered } from "./diagnostics";
import { DefaultWebpageSnapshotView } from "./defaults/webpage-snapshot-view";
import { DefaultFullScreenOverlay, DefaultWindowPanel } from "./defaults/window-panel";
import type { EditableContextMenuProps, NonEditableContextMenuProps } from "../context-menu/types";

/** The host context menu's props (its registration is typed against them). */
export type { EditableContextMenuProps, NonEditableContextMenuProps };

import type { SkillRow } from "../ui/skills-types";
import type { CxContentBlock } from "../public-chat/types/cx-tables";

/** The fields of a canvas item row chat reads (the host's canvas store owns the row). */
interface CanvasItemRow {
  id: string;
  title: string | null;
  content: unknown;
  version: number;
}

/** One selectable row of a bound picklist (the host's list door answers these). */
interface PicklistItem {
  id: string;
  label: string;
  help_text: string | null;
  group_name: string | null;
  icon_name: string | null;
}

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
  // Files, audio, PDF and list doors the app owns (P16 / P16f): its upload pipeline, file
  // store, recorder, PDF surfaces and list reads. A bare host draws a labelled stand-in or
  // nothing, and a hook answers "nothing here" — each reported once.
  FileRagBadge: AnyComponent;
  MediaAttachmentThumbnail: AnyComponent;
  UnifiedImageBlockRenderer: AnyComponent;
  MicrophoneIconButton: AnyComponent;
  TranscriptionLoader: AnyComponent;
  MicDeviceMenu: AnyComponent;
  PdfNamedSurfaceSwitcher: AnyComponent;
  ChangeDiff: AnyComponent;
  SearchGroup: AnyComponent;
  SearchGroupTrigger: AnyComponent;
  /** The host's upload hook: `{ upload, uploadMany, uploading, progress, result, error, reset }`. */
  useFileUpload: AnyFn;
  /** One file from the host's file store by source: `{ file }`. */
  useFile: AnyFn;
  useFileDocument: AnyFn;
  useFileResourceFamily: AnyFn;
  useFileActions: AnyFn;
  /** The host's record-then-transcribe hook (`isRecording`, `startRecording`, ...). */
  useRecordAndTranscribe: AnyFn;
  /** Resolves a file source to its stored file (the host's file handler). */
  resolveFile: AnyFn;
  /** The host's rename-file thunk creator (`dispatch(renameFile({ fileId, newName })).unwrap()`). */
  renameFile: AnyFn;
  requestScribeAudioSeek: AnyFn;
  resolvePdfSurfaceIds: AnyFn;
  /** The host's list RPC reader (`{ data, error }`). */
  readListRpc: AnyFn;
  toastDoor: AnyFn;
  currentPointsRate: AnyFn;
  useCostDisplay: AnyFn;
  ReadFailure: AnyComponent;
  // Host features chat shows (canvas, notes, tasks, code, cloud browser, skills, html pages ...).
  HtmlPreviewFullScreenEditor: AnyComponent;
  AgentEditAccessBadge: AnyComponent;
  DataRefPreviewContent: AnyComponent;
  BlockHoverPreview: AnyComponent;
  ConversationHoverPreview: AnyComponent;
  NoteEditorCore: AnyComponent;
  ToolResultCanvasOpener: AnyComponent;
  CloudBrowserHandoffCanvasOpener: AnyComponent;
  SimpleTerminal: AnyComponent;
  useHtmlPreviewState: AnyFn;
  fetchArtifactsForMessageThunk: AnyFn;
  updateArtifactThunk: AnyFn;
  registerArtifactThunk: AnyFn;
  selectHtmlPageArtifactForMessage: AnyFn;
  compileSlotComponent: AnyFn;
  reportCanvasOpenDrop: AnyFn;
  refreshNoteContent: AnyFn;
  fetchNotesList: AnyFn;
  saveNoteField: AnyFn;
  loadProjectsWithTasks: AnyFn;
  humanLines: AnyFn;
  useCanvasOpenGuard: AnyFn;
  useRegisterChatAttachTarget: AnyFn;
  useSkills: () => { skills: SkillRow[]; grouped: Record<string, SkillRow[]>; count: number; loading: boolean; error: string | null; reload: () => Promise<void> };
  useAutoLabel: AnyFn;
  generateLabelFromContent: AnyFn;
  useStructuredListForSelection: (listId: string | null | undefined, groupName?: string) => { items: PicklistItem[]; groups: unknown[]; loading: boolean; unavailable: boolean; error: unknown; retry: () => void };
  useGitHubConnection: AnyFn;
  useOutputFeedback: AnyFn;
  saveOutputFeedback: AnyFn;
  precedingQuestion: AnyFn;
  invalidateCanvasItemCache: AnyFn;
  studioDocumentContentChanged: AnyFn;
  selectEditorState: AnyFn;
  selectActiveSandboxId: AnyFn;
  selectActiveSandboxProxyUrl: AnyFn;
  selectEditorMode: AnyFn;
  receivedFsChange: AnyFn;
  loadCodeEditHistoryThunk: AnyFn;
  applySkillStreamEvent: AnyFn;
  isSkillStreamEvent: AnyFn;
  materializeMessageArtifacts: (args: { messageId: string; conversationId: string; content: CxContentBlock[]; getState: () => any }) => Promise<{ materializedCount: number; rewrittenContent: CxContentBlock[] | null; unpersistedRewrite?: CxContentBlock[]; errors: string[] }>;
  reconcileMessagesArtifacts: AnyFn;
  noteBrowserActivity: AnyFn;
  selectCloudBrowserRunLive: AnyFn;
  adoptCloudBrowserRunFromStream: AnyFn;
  dispatchWarRoomTool: AnyFn;
  dispatchWarRoomMasterTool: AnyFn;
  resolveGmailSendConnection: AnyFn;
  voiceDisplayName: AnyFn;
  recognizeOurFileUrl: AnyFn;
  canvasGetVersionHistory: (canvasId: string) => Promise<CanvasItemRow[]>;
  canvasGetById: (canvasId: string) => Promise<CanvasItemRow | null>;
  createSandboxFilesystemAdapter: AnyFn;
  notesGetById: AnyFn;
  isLiveConversationVoice: AnyFn;
  ourFileUrlMarkers: AnyFn;
  createHtmlPage: AnyFn;
  convertMarkdownToHtml: AnyFn;
  sklActions: Record<string, AnyFn>;
  selectAllContentBlocksArray: AnyFn;
  selectContentBlocksByScope: AnyFn;
  selectContentBlocksByScopeRef: AnyFn;
  selectActiveContentBlocks: AnyFn;
  LibraryPreviewPage: AnyComponent;
  NoteVersionHistoryPanel: AnyComponent;
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

/**
 * A named function or hook slot declared outside this file (by `ChatUiSlots` augmentation, e.g.
 * host/markdown-slots), with its stand-in. Same contract as the slots below.
 */
export function hostFn<K extends keyof ChatUiSlots>(name: K, fallback?: AnyFn): ChatUiSlots[K] {
  return slotFn(name, fallback);
}

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

// ── Files, audio, PDF and list doors (P16 / P16f) ────────────────────────────
/** A host with no RAG status shows no badge (reported once). */
export const FileRagBadge = slotComponent("FileRagBadge");
export const MediaAttachmentThumbnail = slotComponent("MediaAttachmentThumbnail", unregisteredWidget("MediaAttachmentThumbnail"));
export const UnifiedImageBlockRenderer = slotComponent("UnifiedImageBlockRenderer", unregisteredWidget("UnifiedImageBlockRenderer"));
/** A host with no recorder offers no microphone (reported once). */
export const MicrophoneIconButton = slotComponent("MicrophoneIconButton");
export const TranscriptionLoader = slotComponent("TranscriptionLoader");
export const MicDeviceMenu = slotComponent("MicDeviceMenu");
/** A host with no PDF surfaces offers no surface switcher (reported once). */
export const PdfNamedSurfaceSwitcher = slotComponent("PdfNamedSurfaceSwitcher");
/** A host with no diff card lists each change as plain `label: before -> after` text, marked as the stand-in. */
export const ChangeDiff = slotComponent(
  "ChangeDiff",
  ({ fields, className }: { fields?: ReadonlyArray<{ label: string; before?: string | null; after: string | null }>; className?: string }) =>
    createElement(
      "ul",
      { className: `text-xs ${className ?? ""}`, "data-chat-slot-fallback": "ChangeDiff" },
      ...(fields ?? []).map((c, i) =>
        createElement("li", { key: i }, `${c.label}: ${c.before === undefined ? "" : `${c.before ?? "(empty)"} -> `}${c.after ?? "(cleared)"}`),
      ),
    ),
);
/** A host with no search toolbar lays the group's buttons out in a plain row. */
export const SearchGroup = slotComponent("SearchGroup", ({ children, className }: { children?: ReactNode; className?: string }) =>
  createElement("div", { className: `flex items-center ${className ?? ""}`, "data-chat-slot-fallback": "SearchGroup" }, children ?? null),
);
export const SearchGroupTrigger = slotComponent("SearchGroupTrigger");

const noUploadHere = () => Promise.reject(new Error("This host has no file upload (registerChatUi useFileUpload)"));
export const useFileUpload = slotFn("useFileUpload", () => ({
  upload: noUploadHere,
  uploadMany: noUploadHere,
  uploading: false,
  progress: null,
  result: null,
  error: null,
  reset: () => undefined,
}));
export const useFile = slotFn("useFile", () => ({ file: null }));
export const useFileDocument = slotFn("useFileDocument");
export const useFileResourceFamily = slotFn("useFileResourceFamily");
export const useFileActions = slotFn("useFileActions");
export const useRecordAndTranscribe = slotFn("useRecordAndTranscribe");
export const resolveFile = slotFn("resolveFile");
export const renameFile = slotFn("renameFile");
/** A host with no transcript studio has no audio to seek; the request is a reported no-op. */
export const requestScribeAudioSeek = slotFn("requestScribeAudioSeek", () => undefined);
export const resolvePdfSurfaceIds = slotFn("resolvePdfSurfaceIds");
export const readListRpc = slotFn("readListRpc");

export const ReadFailure = slotComponent("ReadFailure", unregisteredWidget("ReadFailure"));

export const ItemRow = slotComponent("ItemRow", unregisteredWidget("ItemRow"));

export const UntrustedCount = slotComponent("UntrustedCount", unregisteredWidget("UntrustedCount"));

export const StaleDataNotice = slotComponent("StaleDataNotice", unregisteredWidget("StaleDataNotice"));

export const WorkspaceGate = slotComponent("WorkspaceGate", unregisteredWidget("WorkspaceGate"));

export const OrganizationContextNotice = slotComponent("OrganizationContextNotice", unregisteredWidget("OrganizationContextNotice"));

export const JsonInspector = slotComponent("JsonInspector", unregisteredWidget("JsonInspector"));

export const InlineCopyButton = slotComponent("InlineCopyButton", unregisteredWidget("InlineCopyButton"));

export const ConfirmDialog = slotComponent("ConfirmDialog", unregisteredWidget("ConfirmDialog"));

export const ModelListDropdown = slotComponent("ModelListDropdown", unregisteredWidget("ModelListDropdown"));

export const TextWithDoors = slotComponent("TextWithDoors", unregisteredWidget("TextWithDoors"));

export const EntityDoorControls = slotComponent("EntityDoorControls", unregisteredWidget("EntityDoorControls"));

export const StructuredValueView = slotComponent("StructuredValueView", unregisteredWidget("StructuredValueView"));

export const KindValueFrontDoor = slotComponent("KindValueFrontDoor", unregisteredWidget("KindValueFrontDoor"));

export const KindDataGate = slotComponent("KindDataGate", unregisteredWidget("KindDataGate"));

export const ServerNotes = slotComponent("ServerNotes", unregisteredWidget("ServerNotes"));

export const OptionCombobox = slotComponent("OptionCombobox", unregisteredWidget("OptionCombobox"));

export const NumberStepper = slotComponent("NumberStepper", unregisteredWidget("NumberStepper"));

export const MatrxFloatingFrame = slotComponent("MatrxFloatingFrame", unregisteredWidget("MatrxFloatingFrame"));

export const ItemMenu = slotComponent("ItemMenu", unregisteredWidget("ItemMenu"));

export const ClampedNumberInput = slotComponent("ClampedNumberInput", unregisteredWidget("ClampedNumberInput"));

export const AspectRatioSelect = slotComponent("AspectRatioSelect", unregisteredWidget("AspectRatioSelect"));

export const AnswerTextPreview = slotComponent("AnswerTextPreview", unregisteredWidget("AnswerTextPreview"));

export const AccessGate = slotComponent("AccessGate", unregisteredWidget("AccessGate"));

export const ReferenceCopyMenuItem = slotComponent("ReferenceCopyMenuItem", unregisteredWidget("ReferenceCopyMenuItem"));

export const ReferenceCopyButton = slotComponent("ReferenceCopyButton", unregisteredWidget("ReferenceCopyButton"));

export const MandateNotesPanel = slotComponent("MandateNotesPanel", unregisteredWidget("MandateNotesPanel"));

export const SurfaceBoundAgentsList = slotComponent("SurfaceBoundAgentsList", unregisteredWidget("SurfaceBoundAgentsList"));

export const ProposedDirectivesZone = slotComponent("ProposedDirectivesZone", unregisteredWidget("ProposedDirectivesZone"));

export const EntityCommentPopover = slotComponent("EntityCommentPopover", unregisteredWidget("EntityCommentPopover"));

export const ProTextarea = slotComponent("ProTextarea", (props: any) => { const { onChange, value, className, placeholder, rows, id, ref, autoFocus, disabled } = props; return createElement("textarea", { ref, id, value, onChange, className, placeholder, rows, autoFocus, disabled, "data-chat-slot-fallback": "textarea" }); });

export const VoiceTextarea = slotComponent("VoiceTextarea", (props: any) => { const { onChange, value, className, placeholder, rows, id, ref, autoFocus, disabled } = props; return createElement("textarea", { ref, id, value, onChange, className, placeholder, rows, autoFocus, disabled, "data-chat-slot-fallback": "textarea" }); });

export const FloatingSheet = slotComponent("FloatingSheet", unregisteredWidget("FloatingSheet"));

export const AppLink = slotComponent("AppLink", ({ href, children, className, ...rest }: any) => createElement("a", { href, className, ...rest }, children));

export const IconButton = slotComponent("IconButton", unregisteredWidget("IconButton"));

export const LightSwitchToggle = slotComponent("LightSwitchToggle", unregisteredWidget("LightSwitchToggle"));

export const CitationChip = slotComponent("CitationChip", unregisteredWidget("CitationChip"));

export const MatrxEnvelopeBlock = slotComponent("MatrxEnvelopeBlock", unregisteredWidget("MatrxEnvelopeBlock"));

export const ErrorBoundaryWithCapture = slotComponent("ErrorBoundaryWithCapture", ({ children }: { children?: ReactNode }) => children ?? null);

export const ConfigurationTable = slotComponent("ConfigurationTable", unregisteredWidget("ConfigurationTable"));
export const ConfigurationTableRow = slotComponent("ConfigurationTableRow", unregisteredWidget("ConfigurationTableRow"));
export const FieldHelp = slotComponent("FieldHelp", unregisteredWidget("FieldHelp"));

// ── Host features chat shows ─────────────────────────────────────────────────
export const HtmlPreviewFullScreenEditor = slotComponent("HtmlPreviewFullScreenEditor", unregisteredWidget("HtmlPreviewFullScreenEditor"));
export const AgentEditAccessBadge = slotComponent("AgentEditAccessBadge", unregisteredWidget("AgentEditAccessBadge"));
export const DataRefPreviewContent = slotComponent("DataRefPreviewContent", unregisteredWidget("DataRefPreviewContent"));
export const BlockHoverPreview = slotComponent("BlockHoverPreview", ({ children }: { children?: ReactNode }) => children ?? null);
export const ConversationHoverPreview = slotComponent("ConversationHoverPreview", ({ children }: { children?: ReactNode }) => children ?? null);
export const NoteEditorCore = slotComponent("NoteEditorCore", unregisteredWidget("NoteEditorCore"));
export const ToolResultCanvasOpener = slotComponent("ToolResultCanvasOpener");
export const CloudBrowserHandoffCanvasOpener = slotComponent("CloudBrowserHandoffCanvasOpener");
export const SimpleTerminal = slotComponent("SimpleTerminal", unregisteredWidget("SimpleTerminal"));
export const useHtmlPreviewState = slotFn("useHtmlPreviewState");
export const fetchArtifactsForMessageThunk = slotFn("fetchArtifactsForMessageThunk");
export const updateArtifactThunk = slotFn("updateArtifactThunk");
export const registerArtifactThunk = slotFn("registerArtifactThunk");
export const selectHtmlPageArtifactForMessage = slotFn("selectHtmlPageArtifactForMessage");
export const compileSlotComponent = slotFn("compileSlotComponent");
export const reportCanvasOpenDrop = slotFn("reportCanvasOpenDrop", () => undefined);
export const refreshNoteContent = slotFn("refreshNoteContent");
export const fetchNotesList = slotFn("fetchNotesList");
export const saveNoteField = slotFn("saveNoteField");
export const loadProjectsWithTasks = slotFn("loadProjectsWithTasks");
export const humanLines = slotFn("humanLines");
export const useCanvasOpenGuard = slotFn("useCanvasOpenGuard");
export const useRegisterChatAttachTarget = slotFn("useRegisterChatAttachTarget", () => undefined);
export const useSkills = slotFn("useSkills");
export const useAutoLabel = slotFn("useAutoLabel", () => undefined);
export const generateLabelFromContent = slotFn("generateLabelFromContent");
export const useStructuredListForSelection = slotFn("useStructuredListForSelection");
export const useGitHubConnection = slotFn("useGitHubConnection");
export const useOutputFeedback = slotFn("useOutputFeedback");
export const saveOutputFeedback = slotFn("saveOutputFeedback");
export const precedingQuestion = slotFn("precedingQuestion");
export const invalidateCanvasItemCache = slotFn("invalidateCanvasItemCache", () => undefined);
export const studioDocumentContentChanged = slotFn("studioDocumentContentChanged");
export const selectEditorState = slotFn("selectEditorState");
export const selectActiveSandboxId = slotFn("selectActiveSandboxId");
export const selectActiveSandboxProxyUrl = slotFn("selectActiveSandboxProxyUrl");
export const selectEditorMode = slotFn("selectEditorMode");
export const receivedFsChange = slotFn("receivedFsChange");
export const loadCodeEditHistoryThunk = slotFn("loadCodeEditHistoryThunk");
export const applySkillStreamEvent = slotFn("applySkillStreamEvent");
export const isSkillStreamEvent = slotFn("isSkillStreamEvent", () => false);
export const materializeMessageArtifacts = slotFn("materializeMessageArtifacts");
export const reconcileMessagesArtifacts = slotFn("reconcileMessagesArtifacts", () => undefined);
export const noteBrowserActivity = slotFn("noteBrowserActivity");
export const selectCloudBrowserRunLive = slotFn("selectCloudBrowserRunLive");
export const adoptCloudBrowserRunFromStream = slotFn("adoptCloudBrowserRunFromStream");
export const dispatchWarRoomTool = slotFn("dispatchWarRoomTool");
export const dispatchWarRoomMasterTool = slotFn("dispatchWarRoomMasterTool");
export const resolveGmailSendConnection = slotFn("resolveGmailSendConnection");
export const voiceDisplayName = slotFn("voiceDisplayName", (_set: string, id: string) => id);
export const recognizeOurFileUrl = slotFn("recognizeOurFileUrl", () => null);
export const canvasGetVersionHistory = slotFn("canvasGetVersionHistory");
export const canvasGetById = slotFn("canvasGetById");
export const createSandboxFilesystemAdapter = slotFn("createSandboxFilesystemAdapter");
export const notesGetById = slotFn("notesGetById");
export const isLiveConversationVoice = slotFn("isLiveConversationVoice", () => false);
export const ourFileUrlMarkers = slotFn("ourFileUrlMarkers", () => []);
export const createHtmlPage = slotFn("createHtmlPage");
export const convertMarkdownToHtml = slotFn("convertMarkdownToHtml");
/** The host's skill-library action creators (`sklActions.x(...)`); resolved at call time, a bare host throws naming the slot. */
export const sklActions: Record<string, AnyFn> = new Proxy({}, { get: (_t, prop) => (...args: unknown[]) => { const impl = (slots.sklActions as Record<string, AnyFn> | undefined)?.[prop as string]; if (!impl) throw new Error(`The host registered no "sklActions.${String(prop)}" for the chat package (registerChatUi).`); return impl(...args); } });
export const selectAllContentBlocksArray = slotFn("selectAllContentBlocksArray");
export const selectContentBlocksByScope = slotFn("selectContentBlocksByScope");
export const selectContentBlocksByScopeRef = slotFn("selectContentBlocksByScopeRef");
export const selectActiveContentBlocks = slotFn("selectActiveContentBlocks");
export const LibraryPreviewPage = slotComponent("LibraryPreviewPage", unregisteredWidget("LibraryPreviewPage"));
export const NoteVersionHistoryPanel = slotComponent("NoteVersionHistoryPanel", unregisteredWidget("NoteVersionHistoryPanel"));

export const useModelFull = slotFn("useModelFull");
export const useModelOptions = slotFn("useModelOptions");

export const useOrganizationRequired = slotFn("useOrganizationRequired");

export const useAuthGuardedAction = slotFn("useAuthGuardedAction");

export const readOf = slotFn("readOf");

export const pushAppHref = slotFn("pushAppHref");
export const replaceAppHref = slotFn("replaceAppHref");

export const announceComingSoon = slotFn("announceComingSoon");

export const normalize = slotFn("normalize");

export const toMediaRef = slotFn("toMediaRef");

export const peekSystemOrgId = slotFn("peekSystemOrgId");

export const toGlobalOwnershipRecord = slotFn("toGlobalOwnershipRecord");
export const fromGlobalOwnershipRecord = slotFn("fromGlobalOwnershipRecord");

export const assertMappingsAreAnswerable = slotFn("assertMappingsAreAnswerable");
export const parseMandateWave1 = slotFn("parseMandateWave1");

export const peekMandateCatalogueEntry = slotFn("peekMandateCatalogueEntry");
export const invalidateMandateCatalogueCache = slotFn("invalidateMandateCatalogueCache");

export const mandateRefusalHeadline = slotFn("mandateRefusalHeadline");

export const useLoginHref = slotFn("useLoginHref");

export const useAgentChangeReach = slotFn("useAgentChangeReach");

export const useAccess = slotFn("useAccess");

export const selectShouldPromptForOrganization = slotFn("selectShouldPromptForOrganization");

export const canActOn = slotFn("canActOn");

export const resolveEntityToken = slotFn("resolveEntityToken");

export const entityTitleFallback = slotFn("entityTitleFallback");
export const fetchEntityTitles = slotFn("fetchEntityTitles");
export const getCachedEntityTitle = slotFn("getCachedEntityTitle");

export const bookmarksToReferenceDirectives = slotFn("bookmarksToReferenceDirectives");

export const ensureOrgAvailability = slotFn("ensureOrgAvailability");

export const createClient = slotFn("createClient");

export const requireAuthenticatedSupabaseSession = slotFn("requireAuthenticatedSupabaseSession");

export const notifyPrintOutcome = slotFn("notifyPrintOutcome");


export const awaitEffectiveOrganizationId = slotFn("awaitEffectiveOrganizationId");

export const getAgentCatalog = slotFn("getAgentCatalog");

export const getAgent = slotFn("getAgent");

export const isBasicWorkMandate = slotFn("isBasicWorkMandate");
export const resolvePreferredChatModel = slotFn("resolvePreferredChatModel");

export const publishedToWebPatch = slotFn("publishedToWebPatch");

export const isUuidValue = slotFn("isUuidValue");

export const toastDoor = slotFn("toastDoor");

export const dismissDriftAlert = slotFn("dismissDriftAlert");
export const fetchDriftAlerts = slotFn("fetchDriftAlerts");
export const markDriftAlertViewed = slotFn("markDriftAlertViewed");
export const fetchAgentUsages = slotFn("fetchAgentUsages");
export const fetchAgentUsageReport = slotFn("fetchAgentUsageReport");

export const selectActiveBannerAlerts = slotFn("selectActiveBannerAlerts");
export const selectDriftAlertsStatus = slotFn("selectDriftAlertsStatus");
export const makeSelectUsageCache = slotFn("makeSelectUsageCache");
export const makeSelectUsageGroups = slotFn("makeSelectUsageGroups");
export const makeSelectUsageAggregates = slotFn("makeSelectUsageAggregates");
export const makeSelectRedFlagSummary = slotFn("makeSelectRedFlagSummary");
export const makeSelectReport = slotFn("makeSelectReport");
export const makeSelectReportSorted = slotFn("makeSelectReportSorted");
export const makeSelectReportTotals = slotFn("makeSelectReportTotals");

export const AgentSettingsModal = slotComponent("AgentSettingsModal", unregisteredWidget("AgentSettingsModal"));

export const AgentSettingsCore = slotComponent("AgentSettingsCore", unregisteredWidget("AgentSettingsCore"));

export const SettingControlInput = slotComponent("SettingControlInput", unregisteredWidget("SettingControlInput"));

export const InputCapabilitiesEditor = slotComponent("InputCapabilitiesEditor", unregisteredWidget("InputCapabilitiesEditor"));

export const CustomDataBindingSummary = slotComponent("CustomDataBindingSummary", unregisteredWidget("CustomDataBindingSummary"));

export const CustomDataBindingPreview = slotComponent("CustomDataBindingPreview", unregisteredWidget("CustomDataBindingPreview"));

export const AiModelRef = slotComponent("AiModelRef", unregisteredWidget("AiModelRef"));
export const AiToolRef = slotComponent("AiToolRef", unregisteredWidget("AiToolRef"));

export const TextInputDialog = slotComponent("TextInputDialog", unregisteredWidget("TextInputDialog"));

export const ProInput = slotComponent("ProInput", (props: any) => createElement("input", { ...props, "data-chat-slot-fallback": "input" }));

export const MatrxDynamicPanelHost = slotComponent("MatrxDynamicPanelHost", unregisteredWidget("MatrxDynamicPanelHost"));

export const renameIntentFallback = slotFn("renameIntentFallback");

export const useClippedContentGuard = slotFn("useClippedContentGuard");

export const answerPreviewText = slotFn("answerPreviewText");

export const beginPlaybackSession = slotFn("beginPlaybackSession");


export const currentCostUnit = slotFn("currentCostUnit", () => "points");

export const Cost = slotComponent("Cost", ({ usd, className, short, prefix, unknown }: any) => createElement("span", { className, "data-chat-slot-fallback": "Cost" }, (typeof usd === "number" && prefix ? prefix : "") + formatCost(usd, { short, unknown, unit: "points", rate: null })));
export const currentPointsRate = slotFn("currentPointsRate", () => null);
export const useCostDisplay = slotFn("useCostDisplay", () => ({
  unit: "points",
  canToggle: false,
  rate: null,
  format: (usd: number | null | undefined, options?: object) => formatCost(usd, { ...options, unit: "points", rate: null }),
  toPoints: (usd: number | null | undefined) => usdToPoints(usd, { rate: null }),
}));
/** A host with no entity doors puts no action on the notice (reported once). */
export const toastDoor = slotFn("toastDoor", () => undefined);
