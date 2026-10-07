// The host's own shapes, handed to the chat package's context-menu types
// (../aidream/apps/shared/chat/src/context-menu/types.ts `ContextMenuHostTypes`). Imported for its side effect
// by the menu's types shim so the augmentation is always part of the program.
import type {
  ContentSource as HostContentSource,
  RichDocumentAction as HostRichDocumentAction,
  RichDocumentActionContext as HostRichDocumentActionContext,
} from "@ai-matrx/rich-content/rich-document/types";
import type { ResourceType as HostResourceType } from "@/utils/permissions/types";

declare module "@ai-matrx/chat/context-menu/types" {
  interface ContextMenuHostTypes {
    contentSource: HostContentSource;
    richDocumentAction: HostRichDocumentAction;
    richDocumentActionContext: HostRichDocumentActionContext;
    resourceType: HostResourceType;
  }
}

export {};
