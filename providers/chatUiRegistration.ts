// Full chat UI profile. Base registrations are shared with the demos shell.
// Import that module once instead of recreating its eight next/dynamic wrappers:
// both profiles coexist on chat demos, so copies create duplicate chunk groups
// and replace the registered component identities when the route loads.
import "@/providers/chatUiRegistrationBase";
import dynamic from "next/dynamic";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import { NotesAPI } from "@/features/notes/service/notesApi";

const asSlot = <T,>(impl: T) => impl as unknown as never;

import { canvasArtifactService } from "@/features/canvas/services/canvasArtifactService";
import { SandboxFilesystemAdapter } from "@/features/code/adapters/SandboxFilesystemAdapter";
import { HTMLPageService } from "@/features/html-pages/services/htmlPageService";
import { sklActions } from "@/features/agent-connections/redux/skl/slice";
import HtmlPreviewFullScreenEditor from "@/features/html-pages/components/HtmlPreviewFullScreenEditor";
import { AgentEditAccessBadge } from "@/features/agents/components/context-policies-management/AgentEditAccessControl";
import { DataRefPreviewContent } from "@/features/agents/components/previews/DataRefHoverPreview";
import { BlockHoverPreview } from "@/features/agents/components/previews/BlockHoverPreview";
import { ConversationHoverPreview } from "@/features/agents/components/previews/ConversationHoverPreview";
import { NoteEditorCore } from "@/features/notes/components/NoteEditorCore";
import { ToolResultCanvasOpener } from "@/features/canvas/tool-results/ToolResultCanvasOpener";
import { CloudBrowserHandoffCanvasOpener } from "@/features/cloud-browser/components/CloudBrowserHandoffCanvasOpener";
import { SimpleTerminal } from "@/features/code/terminal/SimpleTerminal";
import { useHtmlPreviewState } from "@/features/html-pages/hooks/useHtmlPreviewState";
import { fetchArtifactsForMessageThunk, updateArtifactThunk, registerArtifactThunk } from "@/lib/redux/thunks/artifactThunks";
import { selectHtmlPageArtifactForMessage } from "@/lib/redux/selectors/artifactSelectors";
import { compileStoredComponent } from "@/lib/code-runtime/compile-stored";
import { reportCanvasOpenDrop } from "@/features/canvas/openRequest";
import { refreshNoteContent, fetchNotesList, saveNoteField } from "@/features/notes/redux/thunks";
import { loadProjectsWithTasks } from "@/features/tasks/redux/thunks";
import { humanLines } from "@/features/marketing/lib/copy-payloads";
import { useCanvasOpenGuard } from "@/features/canvas/hooks/useCanvasOpenGuard";
import { useRegisterChatAttachTarget } from "@/features/knowledge/command-bar/useKnowledgeAttachTarget";
import { useSkills } from "@/features/skills/hooks/useSkills";
import { useAutoLabel, generateLabelFromContent } from "@/features/notes/hooks/useAutoLabel";
import { usePickListForSelection } from "@/features/data-tables/pick-lists/hooks/usePickListForSelection";
import { useGitHubConnection } from "@/features/github-integration/useGitHubConnection";
import { useOutputFeedback } from "@/lib/output-feedback/useOutputFeedback";
import { saveOutputFeedback } from "@/lib/output-feedback/service";
import { precedingQuestion } from "@/features/masterwork/oracle/service";
import { invalidateCanvasItemCache } from "@/features/canvas/hooks/useCanvasItem";
import { studioDocumentContentChanged } from "@/features/transcript-studio/redux/slice";
import { selectEditorState } from "@/features/code-editor/redux/editor-state.slice";
import { selectActiveSandboxId, selectActiveSandboxProxyUrl, selectEditorMode } from "@/features/code/redux/codeWorkspaceSlice";
import { receivedFsChange } from "@/features/code/redux/fsChangesSlice";
import { loadCodeEditHistoryThunk } from "@/features/code/redux/codeEditHistoryHydration";
import { applySkillStreamEvent, isSkillStreamEvent } from "@/features/skills/service/skillsStreamHandler";
import { materializeMessageArtifacts } from "@/features/canvas/materialization/materializeMessageArtifacts";
import { reconcileMessagesArtifacts } from "@/features/canvas/materialization/reconcileArtifacts";
import { noteBrowserActivity, selectCloudBrowserRunLive } from "@/features/cloud-browser/redux/cloudBrowserSlice";
import { adoptCloudBrowserRunFromStream } from "@/features/cloud-browser/redux/adoptRunFromStream";
import { dispatchWarRoomTool } from "@/features/agents/war-room-tools/dispatcher/dispatch-war-room-tool.thunk";
import { dispatchWarRoomMasterTool } from "@/features/agents/war-room-master-tools/dispatcher/dispatch-war-room-master-tool.thunk";
import { resolveGmailSendConnection } from "@/features/google-workspace/connection";
import { convertMarkdownToHtml } from "@/features/html-pages/utils/html-preview-utils";
import { selectAllContentBlocksArray, selectContentBlocksByScope, selectContentBlocksByScopeRef, selectActiveContentBlocks } from "@/features/agent-connections/redux/skl/content-block-compat";
import { createElement } from "react";
import { Loader2 } from "lucide-react";

const LibraryPreviewPage = dynamic(
  () => import("@/features/rag/components/library/LibraryPreviewPage").then((m) => m.LibraryPreviewPage),
  { ssr: false, loading: () => createElement("div", { className: "flex h-full items-center justify-center gap-2 text-sm text-muted-foreground" }, createElement(Loader2, { className: "h-4 w-4 animate-spin" }), "Loading document…") },
);
const NoteVersionHistoryPanel = dynamic(
  () => import("@/features/notes/components/diff/NoteVersionHistoryPanel").then((m) => ({ default: m.NoteVersionHistoryPanel })),
  { ssr: false, loading: () => createElement("div", { className: "flex h-32 items-center justify-center text-xs text-muted-foreground" }, "Loading version history…") },
);

registerChatUi({
  HtmlPreviewFullScreenEditor,
  AgentEditAccessBadge,
  DataRefPreviewContent,
  BlockHoverPreview,
  ConversationHoverPreview,
  NoteEditorCore,
  ToolResultCanvasOpener,
  CloudBrowserHandoffCanvasOpener,
  SimpleTerminal,
  useHtmlPreviewState,
  fetchArtifactsForMessageThunk,
  updateArtifactThunk,
  registerArtifactThunk,
  selectHtmlPageArtifactForMessage,
  compileStoredComponent,
  reportCanvasOpenDrop,
  refreshNoteContent,
  fetchNotesList,
  saveNoteField,
  loadProjectsWithTasks,
  humanLines,
  useCanvasOpenGuard,
  useRegisterChatAttachTarget,
  useSkills,
  useAutoLabel,
  generateLabelFromContent,
  usePickListForSelection,
  useGitHubConnection,
  useOutputFeedback,
  saveOutputFeedback,
  precedingQuestion,
  invalidateCanvasItemCache,
  studioDocumentContentChanged,
  selectEditorState,
  selectActiveSandboxId,
  selectActiveSandboxProxyUrl,
  selectEditorMode,
  receivedFsChange,
  loadCodeEditHistoryThunk,
  applySkillStreamEvent,
  isSkillStreamEvent,
  materializeMessageArtifacts,
  reconcileMessagesArtifacts,
  noteBrowserActivity,
  selectCloudBrowserRunLive,
  adoptCloudBrowserRunFromStream,
  dispatchWarRoomTool,
  dispatchWarRoomMasterTool,
  resolveGmailSendConnection,
  canvasGetVersionHistory: (id: string) => canvasArtifactService.getVersionHistory(id),
  canvasGetById: (id: string) => canvasArtifactService.getById(id),
  createSandboxFilesystemAdapter: (instanceId: string) => new SandboxFilesystemAdapter(instanceId),
  notesGetById: (id: string) => NotesAPI.getById(id),
  createHtmlPage: (...args: Parameters<typeof HTMLPageService.createPage>) => HTMLPageService.createPage(...args),
  convertMarkdownToHtml,
  sklActions: sklActions,
  selectAllContentBlocksArray,
  selectContentBlocksByScope,
  selectContentBlocksByScopeRef,
  selectActiveContentBlocks,
  LibraryPreviewPage: LibraryPreviewPage,
  NoteVersionHistoryPanel: NoteVersionHistoryPanel,
});


import { ReadFailure as Host_ReadFailure } from "@/components/read-state/ReadFailure";
registerChatUi({
  ReadFailure: Host_ReadFailure,
});

import { ItemRow as Host_ItemRow } from "@/components/official/item/ItemRow";
registerChatUi({
  ItemRow: Host_ItemRow,
});

import { UntrustedCount as Host_UntrustedCount } from "@/components/official/stale-data/UntrustedCount";
registerChatUi({
  UntrustedCount: Host_UntrustedCount,
});

import { StaleDataNotice as Host_StaleDataNotice } from "@/components/official/stale-data/StaleDataNotice";
registerChatUi({
  StaleDataNotice: Host_StaleDataNotice,
});

import { WorkspaceGate as Host_WorkspaceGate } from "@/features/organizations/components/WorkspaceGate";
registerChatUi({
  WorkspaceGate: Host_WorkspaceGate,
});

import { OrganizationContextNotice as Host_OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
registerChatUi({
  OrganizationContextNotice: Host_OrganizationContextNotice,
});

import { JsonInspector as Host_JsonInspector } from "@/components/official-candidate/json-inspector/JsonInspector";
registerChatUi({
  JsonInspector: Host_JsonInspector,
});

import { ConfirmDialog as Host_ConfirmDialog } from "@/components/ui/confirm-dialog";
registerChatUi({
  ConfirmDialog: Host_ConfirmDialog,
});

import { ModelListDropdown as Host_ModelListDropdown } from "@ai-matrx/agents/models/react";
registerChatUi({
  ModelListDropdown: asSlot(Host_ModelListDropdown),
});

import { TextWithDoors as Host_TextWithDoors } from "@/components/official/entity-ref/TextWithDoors";
registerChatUi({
  TextWithDoors: Host_TextWithDoors,
});

import { EntityDoorControls as Host_EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
registerChatUi({
  EntityDoorControls: Host_EntityDoorControls,
});

import { StructuredValueView as Host_StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
registerChatUi({
  StructuredValueView: Host_StructuredValueView,
});

import { KindValueFrontDoor as Host_KindValueFrontDoor } from "@/components/official/structured-value/KindValueFrontDoor";
registerChatUi({
  KindValueFrontDoor: Host_KindValueFrontDoor,
});

import { KindDataGate as Host_KindDataGate } from "@/components/official/structured-value/KindDataGate";
registerChatUi({
  KindDataGate: Host_KindDataGate,
});

import { ServerNotes as Host_ServerNotes } from "@/components/official/ServerNotes";
registerChatUi({
  ServerNotes: Host_ServerNotes,
});

import { OptionCombobox as Host_OptionCombobox } from "@/components/official/option-combobox/OptionCombobox";
registerChatUi({
  OptionCombobox: Host_OptionCombobox,
});

import { NumberStepper as Host_NumberStepper } from "@/components/official-candidate/NumberStepper";
registerChatUi({
  NumberStepper: Host_NumberStepper,
});

import { MatrxFloatingFrame as Host_MatrxFloatingFrame } from "@/components/matrx/resizable/MatrxFloatingFrame";
registerChatUi({
  MatrxFloatingFrame: Host_MatrxFloatingFrame,
});

import { ItemMenu as Host_ItemMenu } from "@/components/official/item/ItemMenu";
registerChatUi({
  ItemMenu: Host_ItemMenu,
});

import { ClampedNumberInput as Host_ClampedNumberInput } from "@/components/official/ClampedNumberInput";
registerChatUi({
  ClampedNumberInput: Host_ClampedNumberInput,
});

import { AspectRatioSelect as Host_AspectRatioSelect } from "@/components/official/aspect-ratio/AspectRatioSelect";
registerChatUi({
  AspectRatioSelect: Host_AspectRatioSelect,
});

import { AnswerTextPreview as Host_AnswerTextPreview } from "@/components/official/structured-value/AnswerTextPreview";
registerChatUi({
  AnswerTextPreview: Host_AnswerTextPreview,
});

import { AccessGate as Host_AccessGate } from "@/features/access-gate/components/AccessGate";
registerChatUi({
  AccessGate: Host_AccessGate,
});

import { ReferenceCopyMenuItem as Host_ReferenceCopyMenuItem } from "@/features/matrx-envelope/components/ReferenceCopyMenuItem";
registerChatUi({
  ReferenceCopyMenuItem: Host_ReferenceCopyMenuItem,
});

import { ReferenceCopyButton as Host_ReferenceCopyButton } from "@/features/matrx-envelope/components/ReferenceCopyButton";
registerChatUi({
  ReferenceCopyButton: Host_ReferenceCopyButton,
});

import { MandateNotesPanel as Host_MandateNotesPanel } from "@/features/mandates/components/MandateNotesPanel";
registerChatUi({
  MandateNotesPanel: Host_MandateNotesPanel,
});

import { SurfaceBoundAgentsList as Host_SurfaceBoundAgentsList } from "@/features/surfaces/components/bind/SurfaceBoundAgentsList";
registerChatUi({
  SurfaceBoundAgentsList: Host_SurfaceBoundAgentsList,
});

import { ProposedDirectivesZone as Host_ProposedDirectivesZone } from "@/features/matrx-envelope/components/ProposedDirectivesZone";
registerChatUi({
  ProposedDirectivesZone: Host_ProposedDirectivesZone,
});

import { EntityCommentPopover as Host_EntityCommentPopover } from "@/components/comments/EntityCommentPopover";
registerChatUi({
  EntityCommentPopover: Host_EntityCommentPopover,
});

import { ProTextarea as Host_ProTextarea } from "@/components/official/ProTextarea";
registerChatUi({
  ProTextarea: Host_ProTextarea,
});

import { VoiceTextarea as Host_VoiceTextarea } from "@/components/official/VoiceTextarea";
registerChatUi({
  VoiceTextarea: Host_VoiceTextarea,
});

import Host_FloatingSheet from "@/components/official/FloatingSheet";
registerChatUi({
  FloatingSheet: Host_FloatingSheet,
});

import Host_AppLink from "@/components/navigation/AppLink";
registerChatUi({
  AppLink: Host_AppLink,
});

import Host_IconButton from "@/components/official/IconButton";
registerChatUi({
  IconButton: Host_IconButton,
});

import Host_LightSwitchToggle from "@/components/matrx/LightSwitchToggle";
registerChatUi({
  LightSwitchToggle: Host_LightSwitchToggle,
});

import Host_CitationChip from "@/components/official/citation-chip/CitationChip";
registerChatUi({
  CitationChip: Host_CitationChip,
});

import Host_MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";
registerChatUi({
  MatrxEnvelopeBlock: Host_MatrxEnvelopeBlock,
});

import { ErrorBoundaryWithCapture as Host_ErrorBoundaryWithCapture } from "@/lib/error-boundary/ErrorBoundaryWithCapture";
registerChatUi({
  ErrorBoundaryWithCapture: Host_ErrorBoundaryWithCapture,
});

import { ConfigurationTable as Host_ConfigurationTable } from "@/components/official/ConfigurationFields";
import { ConfigurationTableRow as Host_ConfigurationTableRow } from "@/components/official/ConfigurationFields";
import { FieldHelp as Host_FieldHelp } from "@/components/official/ConfigurationFields";
registerChatUi({
  ConfigurationTable: Host_ConfigurationTable,
  ConfigurationTableRow: Host_ConfigurationTableRow,
  FieldHelp: Host_FieldHelp,
});

import { useModelFull as Host_useModelFull } from "@/features/ai-models/hooks/useModels";
import { useModelOptions as Host_useModelOptions } from "@/features/ai-models/hooks/useModels";
registerChatUi({
  useModelFull: Host_useModelFull,
  useModelOptions: Host_useModelOptions,
});

import { useOrganizationRequired as Host_useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
registerChatUi({
  useOrganizationRequired: Host_useOrganizationRequired,
});

import { useAuthGuardedAction as Host_useAuthGuardedAction } from "@/features/auth/components/useAuthGuardedAction";
registerChatUi({
  useAuthGuardedAction: Host_useAuthGuardedAction,
});

import { readOf as Host_readOf } from "@/components/read-state/ReadGate";
registerChatUi({
  readOf: Host_readOf,
});

import { pushAppHref as Host_pushAppHref } from "@/lib/deployment/navigate";
import { replaceAppHref as Host_replaceAppHref } from "@/lib/deployment/navigate";
registerChatUi({
  pushAppHref: Host_pushAppHref,
  replaceAppHref: Host_replaceAppHref,
});

import { announceComingSoon as Host_announceComingSoon } from "@/lib/coming-soon/announce";
registerChatUi({
  announceComingSoon: Host_announceComingSoon,
});

import { peekSystemOrgId as Host_peekSystemOrgId } from "@/lib/organizations/systemOrg";
registerChatUi({
  peekSystemOrgId: Host_peekSystemOrgId,
});

import { toGlobalOwnershipRecord as Host_toGlobalOwnershipRecord } from "@/lib/organizations/globalOwnership";
import { fromGlobalOwnershipRecord as Host_fromGlobalOwnershipRecord } from "@/lib/organizations/globalOwnership";
registerChatUi({
  toGlobalOwnershipRecord: Host_toGlobalOwnershipRecord,
  fromGlobalOwnershipRecord: Host_fromGlobalOwnershipRecord,
});


import { peekMandateCatalogueEntry as Host_peekMandateCatalogueEntry } from "@/features/mandates/catalogue";
import { invalidateMandateCatalogueCache as Host_invalidateMandateCatalogueCache } from "@/features/mandates/catalogue";
registerChatUi({
  peekMandateCatalogueEntry: Host_peekMandateCatalogueEntry,
  invalidateMandateCatalogueCache: Host_invalidateMandateCatalogueCache,
});


import { useLoginHref as Host_useLoginHref } from "@/hooks/auth/useLoginHref";
registerChatUi({
  useLoginHref: Host_useLoginHref,
});

import { useAccess as Host_useAccess } from "@/utils/permissions/access";
registerChatUi({
  useAccess: Host_useAccess,
});

import { selectShouldPromptForOrganization as Host_selectShouldPromptForOrganization } from "@/lib/redux/slices/appContextSlice";
registerChatUi({
  selectShouldPromptForOrganization: Host_selectShouldPromptForOrganization,
});


import { resolveEntityToken as Host_resolveEntityToken } from "@/features/scopes/registry/entityRegistry";
registerChatUi({
  resolveEntityToken: Host_resolveEntityToken,
});

import { entityTitleFallback as Host_entityTitleFallback } from "@/features/scopes/service/entityTitles";
import { fetchEntityTitles as Host_fetchEntityTitles } from "@/features/scopes/service/entityTitles";
import { getCachedEntityTitle as Host_getCachedEntityTitle } from "@/features/scopes/service/entityTitles";
registerChatUi({
  entityTitleFallback: Host_entityTitleFallback,
  fetchEntityTitles: Host_fetchEntityTitles,
  getCachedEntityTitle: Host_getCachedEntityTitle,
});

import { bookmarksToReferenceDirectives as Host_bookmarksToReferenceDirectives } from "@/features/matrx-envelope/bookmarkToReference";
registerChatUi({
  bookmarksToReferenceDirectives: Host_bookmarksToReferenceDirectives,
});

import { ensureOrgAvailability as Host_ensureOrgAvailability } from "@/utils/permissions/service";
registerChatUi({
  ensureOrgAvailability: Host_ensureOrgAvailability,
});


import { requireAuthenticatedSupabaseSession as Host_requireAuthenticatedSupabaseSession } from "@/utils/supabase/webDb";
registerChatUi({
  requireAuthenticatedSupabaseSession: Host_requireAuthenticatedSupabaseSession,
});

import { notifyPrintOutcome as Host_notifyPrintOutcome } from "@/lib/print/print-outcome-toast";
registerChatUi({
  notifyPrintOutcome: Host_notifyPrintOutcome,
});


import { awaitEffectiveOrganizationId as Host_awaitEffectiveOrganizationId } from "@/features/organizations/awaitWorkspace";
registerChatUi({
  awaitEffectiveOrganizationId: Host_awaitEffectiveOrganizationId,
});

import { getAgentCatalog as Host_getAgentCatalog } from "@/lib/agents/catalog";
registerChatUi({
  getAgentCatalog: Host_getAgentCatalog,
});


import { resolvePreferredChatModel as Host_resolvePreferredChatModel } from "@/features/ai-models/preferredChatModel";
registerChatUi({
  resolvePreferredChatModel: Host_resolvePreferredChatModel,
});

import { publishedToWebPatch as Host_publishedToWebPatch } from "@/lib/row-access";
registerChatUi({
  publishedToWebPatch: Host_publishedToWebPatch,
});

import { isUuidValue as Host_isUuidValue } from "@/components/official/entity-ref/doors";
registerChatUi({
  isUuidValue: Host_isUuidValue,
});

import { toastDoor as Host_toastDoor } from "@/components/official/entity-ref/toastDoor";
registerChatUi({
  toastDoor: Host_toastDoor,
});

// Agent builder contributions drawn into chat (AGENT-CORE-PLAN B1).
import { AgentOptionsMenu as Host_AgentOptionsMenu } from "@/features/agents/components/shared/AgentOptionsMenu";
import { AgentSaveStatus as Host_AgentSaveStatus } from "@/features/agents/components/shared/AgentSaveStatus";
import { AgentSaveTapButton as Host_AgentSaveTapButton } from "@/features/agents/components/shared/AgentSaveTapButton";
import { AgentPeekDuplicateButton as Host_AgentPeekDuplicateButton } from "@/features/agents/components/shared/AgentPeekDuplicateButton";
import { CreatorRunPanelLazy as Host_CreatorRunPanel } from "@/features/agents/components/run-controls/CreatorRunPanelLazy";
registerChatUi({
  AgentOptionsMenu: Host_AgentOptionsMenu,
  AgentSaveStatus: Host_AgentSaveStatus,
  AgentSaveTapButton: Host_AgentSaveTapButton,
  AgentPeekDuplicateButton: Host_AgentPeekDuplicateButton,
  CreatorRunPanel: Host_CreatorRunPanel,
});

import { AgentSettingsCore as Host_AgentSettingsCore } from "@/features/agents/components/settings-management/AgentSettingsCore";
registerChatUi({
  AgentSettingsCore: Host_AgentSettingsCore,
});

import { SettingControlInput as Host_SettingControlInput } from "@/features/agents/components/settings-management/controls/SettingControlInput";
registerChatUi({
  SettingControlInput: Host_SettingControlInput,
});

import { InputCapabilitiesEditor as Host_InputCapabilitiesEditor } from "@/features/agents/components/settings-management/ui-gates/InputCapabilitiesEditor";
registerChatUi({
  InputCapabilitiesEditor: Host_InputCapabilitiesEditor,
});

import { CustomDataBindingSummary as Host_CustomDataBindingSummary } from "@/features/agents/components/variables-management/custom-data/CustomDataBindingSummary";
registerChatUi({
  CustomDataBindingSummary: Host_CustomDataBindingSummary,
});

import { CustomDataBindingPreview as Host_CustomDataBindingPreview } from "@/features/agents/components/variables-management/custom-data/CustomDataBindingPreview";
registerChatUi({
  CustomDataBindingPreview: Host_CustomDataBindingPreview,
});

import { AiModelRef as Host_AiModelRef } from "@/components/official/entity-ref/AiIdentityRef";
import { AiToolRef as Host_AiToolRef } from "@/components/official/entity-ref/AiIdentityRef";
registerChatUi({
  AiModelRef: Host_AiModelRef,
  AiToolRef: Host_AiToolRef,
});

import { TextInputDialog as Host_TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
registerChatUi({
  TextInputDialog: Host_TextInputDialog,
});

import { ProInput as Host_ProInput } from "@/components/official/ProInput";
registerChatUi({
  ProInput: Host_ProInput,
});

import { MatrxDynamicPanelHost as Host_MatrxDynamicPanelHost } from "@/components/matrx/resizable/MatrxDynamicPanelHost";
registerChatUi({
  MatrxDynamicPanelHost: Host_MatrxDynamicPanelHost,
});


import { useClippedContentGuard as Host_useClippedContentGuard } from "@/lib/layout/useClippedContentGuard";
registerChatUi({
  useClippedContentGuard: Host_useClippedContentGuard,
});

import { answerPreviewText as Host_answerPreviewText } from "@/components/official/structured-value/AnswerTextPreview";
registerChatUi({
  answerPreviewText: Host_answerPreviewText,
});

import { beginPlaybackSession as Host_beginPlaybackSession } from "@/features/audio/session/audioSessionRegistry";
registerChatUi({
  beginPlaybackSession: Host_beginPlaybackSession,
});


import { currentCostUnit as Host_currentCostUnit } from "@/components/cost/costUnit";
registerChatUi({
  currentCostUnit: Host_currentCostUnit,
});

import { Cost as Host_Cost } from "@/components/cost/Cost";
registerChatUi({
  Cost: Host_Cost,
});

import { currentPointsRate as Host_currentPointsRate } from "@/components/cost/pointsRate";
import { useCostDisplay as Host_useCostDisplay } from "@/components/cost/useCostDisplay";
registerChatUi({
  currentPointsRate: Host_currentPointsRate,
  useCostDisplay: Host_useCostDisplay,
});

