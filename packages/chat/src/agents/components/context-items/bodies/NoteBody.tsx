"use client";

/**
 * Note drawer body, footer and title actions: the note editor is an app feature, so the host
 * registers them (`registerChatUi` in the app's `features/chat-context-bodies`). A bare host
 * draws the generic body with a one-line label naming what is missing (PACKAGE-INDEPENDENCE.md
 * section 5.1), reported once through host diagnostics.
 */

import { hostSlot } from "../../../../host/ui-slots";
import type { ContextItemBodyProps } from "../types";
import { UnregisteredBody } from "./UnregisteredBody";

function NoteBodyStandIn(props: ContextItemBodyProps) {
  return <UnregisteredBody name="NoteBody" what="The note editor" props={props} />;
}

export const NoteBody = hostSlot("NoteBody", NoteBodyStandIn);
export const NoteFooter = hostSlot("NoteFooter");
export const NoteTitleActions = hostSlot("NoteTitleActions");
