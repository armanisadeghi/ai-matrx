"use client";

/**
 * host/ui-slots — host registrations for app UI the package draws but does not own
 * (PACKAGE-INDEPENDENCE.md: "a host registration", not an import of app code).
 *
 * The host registers once at startup with `registerChatUi({...})`; package code
 * imports the named wrappers below. A component the host did not register renders
 * nothing and announces itself once; a function or hook it did not register throws,
 * naming the slot. A test registers a stand-in the same way (`registerChatUi`).
 *
 * Slot shapes are the host component's own props — package call sites keep passing
 * exactly what they passed when they imported the component directly.
 */

import { createElement, type ComponentType } from "react";
import { announceOnce } from "./errors";

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
  EditableContextMenu: AnyComponent;
  TableChooser: AnyComponent;
  FileResourceChip: AnyComponent;
  ConnectorMark: AnyComponent;
  InPlaceEditor: AnyComponent;
  EditInPlace: AnyComponent;
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

function slotComponent<K extends keyof ChatUiSlots>(name: K): ChatUiSlots[K] {
  const Wrapper = (props: object) => {
    const Impl = slots[name] as AnyComponent | undefined;
    if (!Impl) {
      announceOnce(`chat-ui-slot:${name}`, `The host registered no "${name}" component, so it renders nothing here.`);
      return null;
    }
    return createElement(Impl, props);
  };
  Wrapper.displayName = `ChatUi(${name})`;
  return Wrapper as ChatUiSlots[K];
}

function slotFn<K extends keyof ChatUiSlots>(name: K): ChatUiSlots[K] {
  const fn = (...args: unknown[]) => {
    const impl = slots[name] as AnyFn | undefined;
    if (!impl) throw new Error(`The host registered no "${name}" for the chat package (registerChatUi).`);
    return impl(...args);
  };
  return fn as ChatUiSlots[K];
}

export const RichContent = slotComponent("RichContent");
export const CopyButtons = slotComponent("CopyButtons");
export const InfoHint = slotComponent("InfoHint");
export const AnswerValueView = slotComponent("AnswerValueView");
export const ErrorAlchemyMenu = slotComponent("ErrorAlchemyMenu");
export const EntityRef = slotComponent("EntityRef");
export const AdvancedMenu = slotComponent("AdvancedMenu");
export const AuthGateDialog = slotComponent("AuthGateDialog");
export const EmailInputDialog = slotComponent("EmailInputDialog");
export const DockedSidePanel = slotComponent("DockedSidePanel");
export const EditableContextMenu = slotComponent("EditableContextMenu");
export const TableChooser = slotComponent("TableChooser");
export const FileResourceChip = slotComponent("FileResourceChip");
export const ConnectorMark = slotComponent("ConnectorMark");
export const InPlaceEditor = slotComponent("InPlaceEditor");
export const EditInPlace = slotComponent("EditInPlace");

export const confirm = slotFn("confirm");
export const copyRichContent = slotFn("copyRichContent");
export const copyToClipboard = slotFn("copyToClipboard");
export const useTablesEverywhere = slotFn("useTablesEverywhere");
export const useTextareaFormatting = slotFn("useTextareaFormatting");
export const useClipboardPaste = slotFn("useClipboardPaste");
export const useCenterControlFit = slotFn("useCenterControlFit");
export const useInPlaceTrigger = slotFn("useInPlaceTrigger");
export const connectorDefinitionFromMcp = slotFn("connectorDefinitionFromMcp");
export const notesCreate = slotFn("notesCreate");
