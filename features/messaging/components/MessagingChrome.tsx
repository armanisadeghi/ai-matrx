"use client";

/**
 * The app chrome `@ai-matrx/messaging` wraps around its own bubbles and rows.
 *
 * Two tiny things, both of them ours and neither of them the package's:
 *
 *  - `data-message-id` / `data-conversation-id`, so the pane-level v3 context
 *    menu can tell WHICH message or row was right-clicked. The menu resolves
 *    its target from the DOM on open (`resolveContextOnOpen`), which is how one
 *    menu serves a whole list instead of one menu per row.
 *  - the app's fence renderer, so a ```matrx reference in a DM renders exactly
 *    as it does in chat, notes and every other surface — through the ONE kind
 *    registry, never a second treatment of one shape.
 *
 * These are passed to `<MessagingProvider>` in `providers/MessagingHost.tsx`.
 * They WRAP the package's surfaces; nothing here re-renders a message.
 */

import type {
  ConversationRowWrapperProps,
  MessageWrapperProps,
} from "@ai-matrx/messaging/react";
import MatrxEnvelopeBlock from "@/features/matrx-envelope/MatrxEnvelopeBlock";

export function MessagingMessageChrome({
  message,
  children,
}: MessageWrapperProps) {
  return (
    <div data-message-id={message.id} className="contents">
      {children}
    </div>
  );
}

export function MessagingConversationRowChrome({
  conversation,
  children,
}: ConversationRowWrapperProps) {
  return (
    <div data-conversation-id={conversation.conversation.id} className="contents">
      {children}
    </div>
  );
}

/**
 * A ```matrx fence inside a DM renders as the SAME live chip the rest of the
 * app draws — through the ONE decoder and the kind registry.
 *
 * This is why the package's `renderFence` seam exists: Matrx fences are two-key
 * `__kind` directive shells whose items are typed per noun, and only this app's
 * registry can resolve them. `MatrxEnvelopeBlock` takes the fence BODY, which
 * is exactly what the package hands over.
 */
export function MessagingFence({ body }: { body: string }) {
  return <MatrxEnvelopeBlock content={body} />;
}
