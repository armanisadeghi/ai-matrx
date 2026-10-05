// The host's own shapes, handed to the chat package's context-menu types
// (packages/chat/src/context-menu/types.ts `ContextMenuHostTypes`). Imported for its side effect
// by the menu's types shim so the augmentation is always part of the program.
import type {
  ContentSource,
  RichDocumentAction,
  RichDocumentActionContext,
} from "@/features/rich-document/types";
import type { ResourceType } from "@/utils/permissions/types";

declare module "@ai-matrx/chat/context-menu/types" {
  interface ContextMenuHostTypes {
    contentSource: ContentSource;
    richDocumentAction: RichDocumentAction;
    richDocumentActionContext: RichDocumentActionContext;
    resourceType: ResourceType;
  }
}

export {};
