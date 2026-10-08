// providers/chatUiRegistrationBase.ts
//
// The registrations every build profile needs at shell startup. The larger
// post-v0.4.2884 slot set remains in chatUiRegistration.ts and is selected only
// for full profiles; demos imports it at its chat route boundary.

import dynamic from "next/dynamic";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { InfoHint } from "@/components/official/InfoHint";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ErrorNotice } from "@ai-matrx/design-system";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import AdvancedMenu from "@/components/official/AdvancedMenu";
import { AuthGateDialog } from "@/components/dialogs/AuthGateDialog";
import { EmailInputDialog } from "@/components/dialogs/EmailInputDialog";
import { DockedSidePanel } from "@/components/official/side-panel/DockedSidePanel";
import { EditableContextMenu } from "@/features/context-menu-v3/EditableContextMenu";
import { NonEditableContextMenu } from "@/features/context-menu-v3/NonEditableContextMenu";
import { TableChooser } from "@/features/unified-data/hub/TableChooser";
import { useTablesEverywhere } from "@/features/unified-data/hub/useTablesEverywhere";
import { FileResourceChip } from "@/features/files/components/preview/FileResourceChip";
import { ConnectorMark } from "@/features/connectors/ConnectorMark";
import { connectorDefinitionFromMcp } from "@/features/connectors/live-connectors";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { useCenterControlFit } from "@/features/shell/components/header/useCenterControlFit";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import {
  selectAllSkills,
  selectSkillsStatus,
} from "@/features/skills/redux/skillsSelectors";
import { summarizeContextCell } from "@/features/scopes/utils/referenceCell";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { registerChatUsageGate } from "@ai-matrx/chat/host/usage-gate";
import * as usageGate from "@/features/entitlements/usage-gate/usageGate";
import { registerKindValueMarkdown } from "@ai-matrx/content-ir/surfaces";
import { useKnowledgeAttachSearch } from "@/features/resource-manager/resource-picker/useKnowledgeAttachSearch";
import { useConversationAttachments } from "@/features/connectors/useConversationAttachments";
import { useHeldWriteTableName } from "@/features/record-change-approvals/useHeldWriteTableName";
import { WebpageSnapshotView } from "@/features/resource-manager/webpage/WebpageSnapshotView";
import { getManifest as getSurfaceManifest } from "@/features/surfaces/manifests/registry";
import {
  usePageCapture,
  usePageCaptureContribution,
} from "@/components/agent-copy/page-capture/usePageCapture";
import {
  fetchConversationAttachments,
  attachConversationResource,
  detachConversationResource,
} from "@/features/connectors/attachments.service";
import { AttachedResourcesSection } from "@/features/connectors/AttachedResourcesSection";
import { ConnectorPromptHost } from "@/features/connectors/ConnectorPromptHost";
import { useConnectMcpServer } from "@/features/connectors/useConnectMcpServer";
import { resolveSystemOrgId } from "@/lib/organizations/systemOrg";
import { createClient as createAppClient } from "@/utils/supabase/client";
import { projectsDb } from "@/utils/supabase/projectsDb";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { MessageFilesStrip } from "@/features/code/views/history/MessageFilesStrip";
import { RulebookNudge } from "@/features/masterwork/oracle/RulebookNudge";
import { NegativeVerdictFollowUp } from "@/features/review-walk/components/NegativeVerdictFollowUp";
import { SpeakerButton } from "@/features/tts/components/SpeakerButton";
import { GmailReviewCard } from "@/features/google-workspace/agent/GmailReviewCard";
import { ShareButton } from "@/features/sharing/components/ShareButton";
import { ReviewAnswersLink } from "@/features/agents/decision-review/components/ReviewAnswersLink";
import { RecordChangeApprovalCard } from "@/features/record-change-approvals/RecordChangeApprovalCard";
import {
  traceWarRoomRenderPath,
  isWarRoomThreadAgentSurface,
} from "@/features/war-room/utils/renderPathTrace";
import {
  useOpenCloudBrowserCanvas,
  cloudBrowserCanvasSourceId,
} from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { SystemInstructionModal } from "@/features/agents/components/builder/message-builders/system-instructions/SystemInstructionModal";
import { flattenResourcePickerItems } from "@/features/resource-manager/resource-picker/resource-picker-menu-items";
import { useRunControlCounts } from "@/features/resource-manager/resource-picker/useRunControlCounts";
import { useAttachResourcePicker } from "@/features/connectors/useAttachResourcePicker";
import { usePopoutContainer } from "@/features/window-panels/popout/usePopoutContainer";
import { useUrlSync } from "@/features/window-panels/url-sync/useUrlSync";
import { useOverlaySurfaceRenderAck } from "@/features/window-panels/diagnostics/useOverlaySurfaceRenderAck";
import {
  disposeFullScreenEditorCallbackGroup,
  emitFullScreenEditorSave,
} from "@/features/overlays/callbacks/fullScreenEditor";
import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";

/**
 * Slots typed by the props the package passes. Components that require their
 * own props cross this boundary as slots so the package keeps the call-site
 * contract rather than the host component's implementation signature.
 */
const asSlot = <T>(impl: T) => impl as unknown as never;

const ShareModal = dynamic(
  () =>
    import("@/features/sharing/components/ShareModal").then((m) => ({
      default: m.ShareModal,
    })),
  { ssr: false },
);
const WindowPanel = dynamic(
  () =>
    import("@/features/window-panels/WindowPanel").then((m) => m.WindowPanel),
  { ssr: false },
);
const FullScreenOverlay = dynamic(
  () => import("@/components/official/FullScreenOverlay"),
);
const ResourcePickerMenu = dynamic(() =>
  import("@/features/resource-manager/resource-picker/ResourcePickerMenu").then(
    (m) => m.ResourcePickerMenu,
  ),
);
const FilesResourcePicker = dynamic(() =>
  import("@/features/resource-manager/resource-picker/FilesResourcePicker").then(
    (m) => m.FilesResourcePicker,
  ),
);
const NotePickerPopover = dynamic(() =>
  import("@/features/notes/components/NotePickerPopover").then(
    (m) => m.NotePickerPopover,
  ),
);
const SmartInputMessageTemplatePicker = dynamic(() =>
  import("@/features/message-templates/components/SmartInputMessageTemplatePicker").then(
    (m) => m.SmartInputMessageTemplatePicker,
  ),
);
const ResourcePickerWindow = dynamic(
  () =>
    import("@/features/window-panels/windows/ResourcePickerWindow").then(
      (m) => ({
        default: m.ResourcePickerWindow,
      }),
    ),
  { ssr: false },
);

import { FileRagBadge } from "@/features/files/components/core/FileBadges/FileRagBadge";
import { MediaAttachmentThumbnail } from "@/features/files/components/inline/MediaAttachmentThumbnail";
import { UnifiedImageBlockRenderer } from "@/features/files/blocks/image/UnifiedImageBlockRenderer";
import { MicrophoneIconButton } from "@/features/audio/components/MicrophoneIconButton";
import { TranscriptionLoader } from "@/features/audio/components/TranscriptionLoader";
import { MicDeviceMenu } from "@/components/audio/MicDeviceMenu";
import { PdfNamedSurfaceSwitcher } from "@/features/pdf/components/PdfNamedSurfaceSwitcher";
import { resolvePdfSurfaceIds } from "@/features/pdf/hooks/usePdfSurfaceLinks";
import { ChangeDiff } from "@/components/ui/change-diff";
import {
  SearchGroup,
  SearchGroupTrigger,
} from "@/components/icons/SearchToolbar";
import { useFileDocument } from "@/features/files/hooks/useFileDocument";
import { useFileResourceFamily } from "@/features/files/hooks/useFileResourceFamily";
import { useFileActions } from "@/features/files/components/core/FileActions/useFileActions";
import { useRecordAndTranscribe } from "@/features/audio/hooks/useRecordAndTranscribe";
import { requestScribeAudioSeek } from "@/features/transcript-studio/state/scribeAudioBus";
import { readListRpc } from "@/lib/entity-list/readListRpc";

registerChatUi({
  FileRagBadge,
  MediaAttachmentThumbnail,
  UnifiedImageBlockRenderer,
  MicrophoneIconButton,
  TranscriptionLoader,
  MicDeviceMenu,
  PdfNamedSurfaceSwitcher,
  ChangeDiff,
  SearchGroup,
  SearchGroupTrigger,
  useFileDocument,
  useFileResourceFamily,
  useFileActions,
  useRecordAndTranscribe,
  requestScribeAudioSeek,
  resolvePdfSurfaceIds,
  readListRpc,
  WindowPanel,
  ResourcePickerWindow,
  FullScreenOverlay,
  ResourcePickerMenu: asSlot(ResourcePickerMenu),
  FilesResourcePicker: asSlot(FilesResourcePicker),
  NotePickerPopover: asSlot(NotePickerPopover),
  SmartInputMessageTemplatePicker: asSlot(SmartInputMessageTemplatePicker),
  flattenResourcePickerItems,
  useRunControlCounts,
  useAttachResourcePicker,
  usePopoutContainer,
  useUrlSync,
  useOverlaySurfaceRenderAck,
  disposeFullScreenEditorCallbackGroup,
  emitFullScreenEditorSave,
  SystemInstructionModal,
  traceWarRoomRenderPath,
  isWarRoomThreadAgentSurface,
  useOpenCloudBrowserCanvas,
  cloudBrowserCanvasSourceId,
  MessageFilesStrip,
  RulebookNudge,
  NegativeVerdictFollowUp,
  SpeakerButton,
  GmailReviewCard,
  ShareButton,
  ShareModal,
  ReviewAnswersLink,
  RecordChangeApprovalCard,
  CopyButtons,
  InfoHint,
  AnswerValueView,
  ErrorAlchemyMenu,
  ErrorNotice,
  EntityRef,
  AdvancedMenu,
  AuthGateDialog,
  EmailInputDialog,
  DockedSidePanel,
  EditableContextMenu,
  NonEditableContextMenu,
  TableChooser,
  FileResourceChip,
  ConnectorMark,
  confirm,
  useTablesEverywhere,
  useClipboardPaste,
  useCenterControlFit,
  connectorDefinitionFromMcp,
  useKnowledgeAttachSearch,
  useConversationAttachments,
  resolveSystemOrgId,
  AttachedResourcesSection,
  ConnectorPromptHost,
  useConnectMcpServer,
  fetchConversationAttachments,
  attachConversationResource,
  detachConversationResource,
  getSurfaceManifest,
  usePageCapture,
  usePageCaptureContribution,
  useHeldWriteTableName,
  WebpageSnapshotView,
  readProjectScopeOrganizationId: (tier: "project" | "task", id: string) => {
    const db = projectsDb(createAppClient());
    return tier === "project"
      ? db.from("projects").select("organization_id").eq("id", id).maybeSingle()
      : db.from("tasks").select("organization_id").eq("id", id).maybeSingle();
  },
  summarizeContextCell,
  loadedSkills: (state: Parameters<typeof selectSkillsStatus>[0]) => ({
    status: selectSkillsStatus(state),
    skills: selectAllSkills(state),
  }),
  useEntityTitles,
  notesCreate: (input: Parameters<typeof NotesAPI.create>[0]) =>
    NotesAPI.create(input),
});

registerKindValueMarkdown(kindValueToMarkdown);
registerChatUsageGate(usageGate);
