/** This app's types in the rich-document contract (see the package's rich-document/host-types). */
import type { AppDispatch, RootState } from "@/lib/redux/store";
import type { Note } from "@/features/notes/types";
import type { NoteSaveReceipt } from "@/features/notes/service/noteSaveErrors";
import type { ApplicationScope } from "@ai-matrx/chat/agents/types/scope.types";
import type { ServerProcessedBlock } from "@ai-matrx/chat/ui/markdown-stream/EnhancedChatMarkdown";

declare module "@ai-matrx/rich-content/rich-document/host-types" {
  interface RichDocumentHostTypes {
    dispatch: AppDispatch;
    state: RootState;
    note: Note;
    noteSaveReceipt: NoteSaveReceipt;
    applicationScope: ApplicationScope;
    serverProcessedBlock: ServerProcessedBlock;
  }
}
