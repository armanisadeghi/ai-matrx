"use client";

/**
 * The app's notification sink for an incoming message.
 *
 * `@ai-matrx/messaging` owns delivery; the SOUND and the desktop notification
 * are this app's chrome — they read this app's user preferences and use this
 * app's audio unlock — so the package hands us the message and we decide
 * whether the person should be interrupted.
 *
 * Two rules, both from the surface this replaced:
 *  - Never interrupt someone for the conversation they are looking at. The
 *    package tells us whether this message landed in the ACTIVE conversation;
 *    it is the only thing that knows.
 *  - A notification shows the sender's NAME. The deleted initializer showed the
 *    first eight characters of a UUID here, with a `// Placeholder` beside it —
 *    the conversation summary the package passes carries the participants, so
 *    the name is simply available now.
 */

import { useCallback } from "react";
import { useAppSelector } from "@/lib/redux/hooks";
import type { IncomingMessageContext, Message } from "@ai-matrx/messaging/react";
import { summarizeMatrxText } from "@/features/matrx-envelope/referenceText";
import {
  playNotificationSound,
  showDesktopNotification,
} from "@/features/messaging/utils/notificationSound";

export type IncomingMessageNotifier = (
  message: Message,
  context: IncomingMessageContext,
) => void;

export function useIncomingMessageNotifier(): IncomingMessageNotifier {
  const preferences = useAppSelector((state) => state.userPreferences.messaging);

  return useCallback(
    (message: Message, context: IncomingMessageContext) => {
      // Looking right at it is not something to be told about.
      if (context.isActiveConversation) return;

      if (preferences?.notificationSoundEnabled) {
        playNotificationSound(preferences.notificationVolume);
      }

      if (preferences?.showDesktopNotifications) {
        const sender = context.conversation?.participants.find(
          (participant) => participant.userId === message.senderId,
        );
        // A ```matrx fence collapses to its human label — a desktop
        // notification must never carry envelope JSON.
        const preview = summarizeMatrxText(message.content);
        showDesktopNotification(
          sender?.displayName ?? context.conversation?.displayName ?? "New message",
          preview.length > 120 ? `${preview.slice(0, 120)}…` : preview,
        );
      }
    },
    [preferences],
  );
}
