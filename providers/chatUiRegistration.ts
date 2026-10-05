// providers/chatUiRegistration.ts
//
// The app's UI, registered into `@ai-matrx/chat` (packages/chat/src/host/ui-slots.tsx).
// The package draws these but must not import app code (PACKAGE-INDEPENDENCE.md), so the
// app hands them over once, here. Imported for its side effect by ChatHostAdapter.

import dynamic from "next/dynamic";
import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import { RichContent } from "@/components/rich-content/RichContent";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { InfoHint } from "@/components/official/InfoHint";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
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
import { InPlaceEditor } from "@/components/rich-editor/in-place/InPlaceEditor";
import { EditInPlace, useInPlaceTrigger } from "@/components/rich-editor/in-place/EditInPlace";
import { useTextareaFormatting } from "@/components/rich-editor/format/useTextareaFormatting";
import { useClipboardPaste } from "@/components/ui/file-upload/useClipboardPaste";
import { useCenterControlFit } from "@/features/shell/components/header/useCenterControlFit";
import { confirm } from "@/components/dialogs/confirm/ConfirmDialogHost";
import { copyRichContent, copyToClipboard } from "@/components/matrx/buttons/markdown-copy-utils";
import { selectAllSkills, selectSkillsStatus } from "@/features/skills/redux/skillsSelectors";
import { registerChatModelClassHooks } from "@ai-matrx/chat/host/model-class";
import { useModelClassControls } from "@/features/ai-models/hooks/useModelClassControls";
import { useModelClassLabels } from "@/features/ai-models/hooks/useModelClassLabel";
import { summarizeContextCell } from "@/features/scopes/utils/referenceCell";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { registerChatUsageGate } from "@ai-matrx/chat/host/usage-gate";
import * as usageGate from "@/features/entitlements/usage-gate/usageGate";
import { registerKindValueMarkdown } from "@ai-matrx/chat/utils/content-ir/kinds/kind-value-markdown";
import { useKnowledgeAttachSearch } from "@/features/resource-manager/resource-picker/useKnowledgeAttachSearch";
import { useConversationAttachments } from "@/features/connectors/useConversationAttachments";
import { useHeldWriteTableName } from "@/features/record-change-approvals/useHeldWriteTableName";
import { WebpageSnapshotView } from "@/features/resource-manager/webpage/WebpageSnapshotView";
import { getManifest as getSurfaceManifest } from "@/features/surfaces/manifests/registry";
import { usePageCapture, usePageCaptureContribution } from "@/components/agent-copy/page-capture/usePageCapture";
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
import { RichDocument } from "@/features/rich-document/RichDocument";
import { traceWarRoomRenderPath, isWarRoomThreadAgentSurface } from "@/features/war-room/utils/renderPathTrace";
import { useOpenCloudBrowserCanvas, cloudBrowserCanvasSourceId } from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { SystemInstructionEditor } from "@/features/agents/components/builder/message-builders/system-instructions/SystemInstructionEditor";
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

// Loaded on demand, client-only: the sharing modal is heavy and opens rarely.
const ShareModal = dynamic(
  () => import("@/features/sharing/components/ShareModal").then((m) => ({ default: m.ShareModal })),
  { ssr: false },
);

// The app's window manager hosts every chat window (drag, resize, tray, popout, `panels=`
// restore). Loaded on demand: WindowPanel and its pickers are heavy and client-only.
const WindowPanel = dynamic(
  () => import("@/features/window-panels/WindowPanel").then((m) => m.WindowPanel),
  { ssr: false },
);
// The heavy pickers load on first draw (server-rendered where the page draws them).
const FullScreenOverlay = dynamic(() => import("@/components/official/FullScreenOverlay"));
const ResourcePickerMenu = dynamic(() =>
  import("@/features/resource-manager/resource-picker/ResourcePickerMenu").then((m) => m.ResourcePickerMenu),
);
const FilesResourcePicker = dynamic(() =>
  import("@/features/resource-manager/resource-picker/FilesResourcePicker").then((m) => m.FilesResourcePicker),
);
const NotePickerPopover = dynamic(() =>
  import("@/features/notes/components/NotePickerPopover").then((m) => m.NotePickerPopover),
);
const SmartInputMessageTemplatePicker = dynamic(() =>
  import("@/features/message-templates/components/SmartInputMessageTemplatePicker").then(
    (m) => m.SmartInputMessageTemplatePicker,
  ),
);
const ResourcePickerWindow = dynamic(
  () =>
    import("@/features/window-panels/windows/ResourcePickerWindow").then((m) => ({
      default: m.ResourcePickerWindow,
    })),
  { ssr: false },
);

registerChatUi({
  WindowPanel,
  ResourcePickerWindow,
  FullScreenOverlay,
  ResourcePickerMenu,
  FilesResourcePicker,
  NotePickerPopover,
  SmartInputMessageTemplatePicker,
  flattenResourcePickerItems,
  useRunControlCounts,
  useAttachResourcePicker,
  usePopoutContainer,
  useUrlSync,
  useOverlaySurfaceRenderAck,
  disposeFullScreenEditorCallbackGroup,
  emitFullScreenEditorSave,
  SystemInstructionEditor,
  SystemInstructionModal,
  RichDocument,
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
  RichContent,
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
  InPlaceEditor,
  EditInPlace,
  confirm,
  copyRichContent,
  copyToClipboard,
  useTablesEverywhere,
  useTextareaFormatting,
  useClipboardPaste,
  useCenterControlFit,
  useInPlaceTrigger,
  connectorDefinitionFromMcp,
  useKnowledgeAttachSearch,
  useConversationAttachments,
  resolveSystemOrgId,
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
  notesCreate: (input: Parameters<typeof NotesAPI.create>[0]) => NotesAPI.create(input),
});

registerKindValueMarkdown(kindValueToMarkdown);
registerChatUsageGate(usageGate);
registerChatModelClassHooks({ useModelClassControls, useModelClassLabels });
