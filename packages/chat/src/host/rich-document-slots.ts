/**
 * host/rich-document-slots — the app's rich-document action registry, dialogs host and record
 * annotations, registered into the package (chat-package-move P14).
 *
 * Every action under a chat message (thumbs, read aloud, edit, regenerate, print, convert, the
 * Alchemy copy menu, the right-click menu) comes from the host's ONE rich-document registry
 * (`features/rich-document`), and so do its dialogs and the highlight/comment sidecar. The package
 * draws them through these slots and never imports them; the app registers them in
 * `providers/chatRichDocumentRegistration.ts`. A bare host draws no action bar, menu or
 * annotation layer — the message and its text stay exactly as they are — and the missing
 * capability is reported once (Law 4).
 *
 * The slot names extend `ChatUiSlots` by augmentation, so `registerChatUi` accepts them.
 */

import { createElement, type ComponentType, type ReactNode } from "react";
import { hostFn, hostSlot } from "./ui-slots";

/* eslint-disable @typescript-eslint/no-explicit-any */
/** What a rich document is the text of (the host's `ContentSource`); `type` names the kind of thing. */
export interface RichDocumentSource {
  type: string;
  readOnly?: boolean;
  [prop: string]: unknown;
}

/** The facts the host's registry needs to offer one chat message's actions. */
export interface ChatMessageActionFacts {
  conversationId: string;
  messageId: string;
  role: "assistant" | "user";
  messageContent: string;
  contentIsStructuredRaw?: boolean;
  turnContent?: string | null;
  editTarget?: { messageId: string; content: string; isStructuredRaw: boolean } | null;
  metadata?: Record<string, unknown> | null;
  streamRequestId?: string | null;
  contentHistoryCount?: number;
  groupMessageIds?: string[];
  isCreator?: boolean;
  surfaceKey?: string | null;
  showFullPrint?: boolean;
  isCapturing?: boolean;
  callbacks?: Record<string, unknown>;
}

/** What the host's registry hands back for one message: the text, its source and the action set. */
export interface ChatMessageActionConfig {
  content: string;
  source: RichDocumentSource;
  actions: any;
}

/** The host's dialogs for the actions it offers: merge `callbacks` into the actions, render `dialogs` once. */
export interface DocumentDialogsHost {
  callbacks: Record<string, any>;
  dialogs: ReactNode;
}

/** What a saved answer / note / document is, to the annotation layer (the host's `AnnotationSource`). */
export interface AnnotationRecord {
  token: string;
  id: string;
  title?: string;
  href?: string;
  conversationId?: string;
}

declare module "./ui-slots" {
  interface ChatUiSlots {
    /** The action bar for a document (the host's `RichDocumentActions`), same props. */
    RichDocumentActions: ComponentType<any>;
    /** Right-click menu around a document's content (the host's `RegistryContextMenu`), same props. */
    RegistryContextMenu: ComponentType<any>;
    /** The ⋯ menu for a document (the host's `RegistryActionMenu`), same props. */
    RegistryActionMenu: ComponentType<any>;
    /** Headless: registers a document's actions for a surface id (the host's `RichDocumentActionProvider`). */
    RichDocumentActionProvider: ComponentType<any>;
    /** Draws a registered surface's actions as a bar or a menu (the host's `RichDocumentActionSurface`). */
    RichDocumentActionSurface: ComponentType<any>;
    /** The highlight / comment / suggest layer around a saved record (the host's `RecordAnnotations`). */
    RecordAnnotations: ComponentType<any>;
    /** The ONE builder from a chat message to its rich-document action configuration. */
    buildChatMessageActions: (facts: any) => ChatMessageActionConfig;
    /** The lineage origin a converted message points back at, or null when it has none. */
    convertOriginForSource: (source: any, title: string) => unknown;
    /** The host's dialogs for a document's actions (hook). */
    useDocumentDialogsHost: (args: {
      convertOrigin: any;
      text: string;
      writable?: boolean;
      chatMessage?: { conversationId: string; messageId: string; surfaceKey: string | null } | null;
    }) => DocumentDialogsHost;
    /** The annotation identity of a source (a saved chat answer, a note), or null when it has none. */
    annotationRecordOf: (source: any) => AnnotationRecord | null;
    /** Binds a conversation to the apply target a review-and-apply session will write back into. */
    bindConversationToApplyTarget: (conversationId: string, applyTargetId: string) => void;
  }
}

/** A host with no action registry offers no actions under a message: nothing is drawn (reported once). */
export const RichDocumentActions = hostSlot("RichDocumentActions");
export const RegistryActionMenu = hostSlot("RegistryActionMenu");
export const RichDocumentActionProvider = hostSlot("RichDocumentActionProvider");
/** A host with no registry draws a surface's own `fallback`, as the surface already allows. */
export const RichDocumentActionSurface = hostSlot("RichDocumentActionSurface", ({ fallback }: { fallback?: ReactNode }) => fallback ?? null);
/** A host with no menu registry leaves the content as it is: no right-click actions, the children draw. */
export const RegistryContextMenu = hostSlot("RegistryContextMenu", ({ children }: { children?: ReactNode }) =>
  createElement("div", { className: "contents", "data-chat-slot-fallback": "RegistryContextMenu" }, children),
);
/** A host with no annotation layer leaves the record's content as it is. */
export const RecordAnnotations = hostSlot("RecordAnnotations", ({ children }: { children?: ReactNode }) =>
  createElement("div", { className: "contents", "data-chat-slot-fallback": "RecordAnnotations" }, children),
);

/** A host with no registry derives no actions: the message text and its source, an empty action set. */
export const buildChatMessageActions = hostFn("buildChatMessageActions", (facts: ChatMessageActionFacts): ChatMessageActionConfig => ({
  content: facts.turnContent ?? facts.messageContent,
  source: { type: "chat-message", conversationId: facts.conversationId, messageId: facts.messageId },
  actions: { callbacks: facts.callbacks ?? {} },
}));
export const convertOriginForSource = hostFn("convertOriginForSource", () => null);
export const useDocumentDialogsHost = hostFn("useDocumentDialogsHost", (): DocumentDialogsHost => ({ callbacks: {}, dialogs: null }));
export const annotationRecordOf = hostFn("annotationRecordOf", () => null);
export const bindConversationToApplyTarget = hostFn("bindConversationToApplyTarget", () => undefined);
/* eslint-enable @typescript-eslint/no-explicit-any */
