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
import { ParkedOnPersonCard } from "@/features/action-requests/components/ParkedOnPersonCard";
import { RichDocument } from "@/features/rich-document/RichDocument";
import { traceWarRoomRenderPath, isWarRoomThreadAgentSurface } from "@/features/war-room/utils/renderPathTrace";
import { useOpenCloudBrowserCanvas, cloudBrowserCanvasSourceId } from "@/features/cloud-browser/hooks/useOpenCloudBrowserCanvas";
import { SystemInstructionEditor } from "@/features/agents/components/builder/message-builders/system-instructions/SystemInstructionEditor";
import { SystemInstructionModal } from "@/features/agents/components/builder/message-builders/system-instructions/SystemInstructionModal";
import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";

// Loaded on demand, client-only: the sharing modal is heavy and opens rarely.
const ShareModal = dynamic(
  () => import("@/features/sharing/components/ShareModal").then((m) => ({ default: m.ShareModal })),
  { ssr: false },
);

registerChatUi({
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
  ParkedOnPersonCard,
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
