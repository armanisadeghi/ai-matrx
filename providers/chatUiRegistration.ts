// providers/chatUiRegistration.ts
//
// The app's UI, registered into `@ai-matrx/chat` (packages/chat/src/host/ui-slots.tsx).
// The package draws these but must not import app code (PACKAGE-INDEPENDENCE.md), so the
// app hands them over once, here. Imported for its side effect by ChatHostAdapter.

import { registerChatUi } from "@ai-matrx/chat/host/ui-slots";
import { RichContent } from "@/components/rich-content/RichContent";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { InfoHint } from "@/components/official/InfoHint";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
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
import { registerKindValueMarkdown } from "@ai-matrx/chat/utils/content-ir/kinds/kind-value-markdown";
import { NotesAPI } from "@/features/notes/service/notesApi";
import { kindValueToMarkdown } from "@/features/canvas/export/exportArtifactMarkdown";

registerChatUi({
  RichContent,
  CopyButtons,
  InfoHint,
  AnswerValueView,
  ErrorAlchemyMenu,
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
  notesCreate: (input: Parameters<typeof NotesAPI.create>[0]) => NotesAPI.create(input),
});

registerKindValueMarkdown(kindValueToMarkdown);
