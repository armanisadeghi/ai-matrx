// providers/MessagingHost.tsx
//
// THE ONE `@ai-matrx/messaging` MOUNT for this app.
//
// It sits INSIDE `<RealtimeHost>` on purpose. `<MessagingProvider>` rides the
// manager that provider already built (`@ai-matrx/realtime` 0.3.0 gave it the
// probe to notice one), so messaging's channels and the app's other realtime
// consumers share ONE socket and ONE write ledger — a second manager would make
// each side's own optimistic writes look remote to the other.
//
// Everything hard is inside the package: the conversation store and its four
// arrival paths, the durable outbox, echo suppression and dedup, the typing
// lease and presence expiry, keyset pagination, atomic direct-conversation
// creation, and the backfill door on every reconnect. This file injects
// IDENTITY and APP CHROME (C22) and nothing else:
//
//   identity — the Supabase browser singleton, the signed-in user, the active org
//   chrome   — reference opening, the notification sound/desktop sink, action
//              surfaces, and a diagnostic sink that screams with a remedy
//
// It is mounted app-wide, not on /messages, because the unread badge in the
// header, the messages window panel, and the "Message" buttons in member panels
// all need it — the same reason the deleted `MessagingInitializer` was mounted
// globally. A signed-out visitor gets no engine at all: the provider stays inert
// until userId and organizationId are both real.
//
// Doctrine: the package's README (twelve rules) + `common-docs`
// /systems/communications/messaging/HANDOFF.md.

"use client";

import { useCallback, useEffect, useRef, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { MessagingProvider } from "@ai-matrx/messaging/react";
import type {
  EngineDiagnostic,
  IncomingMessageContext,
  Message,
} from "@ai-matrx/messaging/react";
import { supabase } from "@/utils/supabase/client";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { selectActiveOrganizationId } from "@/features/scopes/redux/selectors/active-context";
import { MESSAGE_ACTION_SURFACES } from "@/features/messaging/actions/messageActionSurfaces";
import {
  MessagingConversationRowChrome,
  MessagingFence,
  MessagingMessageChrome,
} from "@/features/messaging/components/MessagingChrome";
import { useIncomingMessageNotifier } from "@/features/messaging/lib/useIncomingMessageNotifier";
import { unlockAudio } from "@/features/messaging/utils/notificationSound";
import { toast } from "@/lib/toast";

export interface MessagingHostProps {
  children: ReactNode;
}

export function MessagingHost({ children }: MessagingHostProps) {
  const router = useRouter();
  const userId = useAppSelector(selectUserId);
  const organizationId = useAppSelector(selectActiveOrganizationId);
  const notifyIncoming = useIncomingMessageNotifier();

  // A background failure is never silent, and never a wall of red either: the
  // package classifies a missing session as a WARNING because it is a normal
  // lifecycle moment (a read landing between sign-in and token arrival). Only
  // real errors reach the user, and only once per remedy — a broken socket
  // retrying does not get to stack fifty toasts.
  const shownRef = useRef<Set<string>>(new Set());
  const onDiagnostic = useCallback((event: EngineDiagnostic) => {
    const line = `[messaging] ${event.message}${
      event.remedy !== undefined ? ` → ${event.remedy}` : ""
    }`;
    if (event.level === "error") {
      console.error(line);
      if (!shownRef.current.has(event.message)) {
        shownRef.current.add(event.message);
        toast.error(event.message, {
          ...(event.remedy !== undefined ? { description: event.remedy } : {}),
        });
      }
      return;
    }
    if (event.level === "warn") console.warn(line);
    else console.info(line);
  }, []);

  const onOpenReference = useCallback(
    (reference: { entityType: string; entityId: string }) => {
      router.push(`/${reference.entityType}/${reference.entityId}`);
    },
    [router],
  );

  const onIncomingMessage = useCallback(
    (message: Message, context: IncomingMessageContext) => {
      notifyIncoming(message, context);
    },
    [notifyIncoming],
  );

  // Browsers refuse to play audio until the person has interacted with the
  // page, and the refusal is silent — so the notification sound is unlocked on
  // the first click/key/touch, once, or the first message of a session arrives
  // mute with nothing in the console to explain it.
  useEffect(() => {
    const handle = (): void => {
      unlockAudio();
      document.removeEventListener("click", handle);
      document.removeEventListener("keydown", handle);
      document.removeEventListener("touchstart", handle);
    };
    document.addEventListener("click", handle, { once: true });
    document.addEventListener("keydown", handle, { once: true });
    document.addEventListener("touchstart", handle, { once: true });
    return () => {
      document.removeEventListener("click", handle);
      document.removeEventListener("keydown", handle);
      document.removeEventListener("touchstart", handle);
    };
  }, []);

  return (
    <MessagingProvider
      client={supabase}
      userId={userId}
      organizationId={organizationId}
      actionRenderers={MESSAGE_ACTION_SURFACES}
      // App chrome around the package's own surfaces: the data attributes the
      // v3 right-click menu resolves its target from, and this app's ONE
      // renderer for a ```matrx fence (the kind registry), so a reference in a
      // DM looks and behaves exactly as it does everywhere else.
      wrapMessage={MessagingMessageChrome}
      wrapConversationRow={MessagingConversationRowChrome}
      renderFence={MessagingFence}
      onOpenReference={onOpenReference}
      onIncomingMessage={onIncomingMessage}
      onDiagnostic={onDiagnostic}
      // Redux identity and the browser's Supabase session hydrate in separate
      // steps. Without this, a read that lands in between reports
      // `session-unavailable` instead of retrying once and recovering — which
      // is exactly the window that produced 909 captured errors in 0.6s.
      resolveSession={async () => {
        const { data } = await supabase.auth.getSession();
        return data.session !== null;
      }}
    >
      {children}
    </MessagingProvider>
  );
}

export default MessagingHost;
