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
// ONE ENTRY POINT ONLY — see `features/meet/lib/meetClient.ts` (MRI-A5).
import { asUserId } from "@ai-matrx/meet/react";
import { PersonCallButton } from "@/features/meet/components/MeetCallSurfaces";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
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

/**
 * 🚨 THE ONE PLACE A PERSON IS SHOWN ON THIS APP'S MESSAGING SURFACES, so it is
 * the one place `<CallButton>` is mounted (adoption census item 6).
 *
 * Every conversation-list surface in the app draws through this wrapper — the
 * `/messages` route, the floating messages window, the side sheet and the
 * agent-review workspace all render `@ai-matrx/messaging`'s ONE
 * `<ConversationList>` — so a single mount here is calling everywhere, and
 * five copies is the defect it avoids.
 *
 * WHO gets a button, and who deliberately does not:
 *  - a DIRECT conversation with exactly one other participant who is a person →
 *    the button, next to the row.
 *  - a group, an org channel, a conversation whose other participant is an AI
 *    agent, or a viewer whose own id has not hydrated yet → NOTHING. `is_agent`
 *    is data messaging already carries; ringing a model is not a feature.
 *  - a GUEST identity → the package itself renders nothing (`calls.canCall` is
 *    false by construction, D6). Absent, never a disabled button.
 *
 * The wrapper stops being `display: contents` for a callable row because the
 * button is a real sibling of the package's row `<button>`: `.mx-msg__row` is
 * `width: 100%` inside this flex line and simply shrinks to make room, so the
 * unread badge and timestamp stay visible rather than being covered by an
 * overlay. Non-callable rows keep `contents` and are byte-identical to before.
 */
export function MessagingConversationRowChrome({
  conversation,
  children,
}: ConversationRowWrapperProps) {
  const viewerId = useAppSelector(selectUserId);
  const others = conversation.participants.filter(
    (participant) => String(participant.userId) !== viewerId,
  );
  const callable =
    conversation.conversation.type === "direct" &&
    viewerId !== null &&
    others.length === 1 &&
    others[0] !== undefined &&
    !others[0].isAgent
      ? others[0]
      : null;

  if (callable === null) {
    return (
      <div data-conversation-id={conversation.conversation.id} className="contents">
        {children}
      </div>
    );
  }

  return (
    <div
      data-conversation-id={conversation.conversation.id}
      className="flex items-center pr-2"
    >
      {children}
      <PersonCallButton
        person={{
          userId: asUserId(String(callable.userId)),
          displayName: callable.displayName,
          avatarUrl: callable.avatarUrl,
        }}
      />
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
