// features/notifications/display.ts
//
// The ONE place a stored notification becomes the shape `NotificationItem`
// already renders (`types/notification.types.ts`). The bell reuses the repo's
// existing item primitive rather than growing a second notification card.

import type { Notification } from "@/types/notification.types";
import type { PlatformNotification } from "./types";

const ERROR_WORDS = /(fail|error|denied|reject|declin)/i;
const SUCCESS_WORDS = /(success|approved|complete|delivered|done)/i;
const WARNING_WORDS = /(warn|expir|overdue|retry|pending)/i;

/**
 * Tone comes from the door's own `outcome` when it said one, and otherwise
 * from the event key. Anything we cannot read as a tone is `info` — never a
 * green tick over a failure.
 */
function toneOf(notification: PlatformNotification): Notification["type"] {
  const signal = notification.outcome ?? notification.eventKey;
  if (ERROR_WORDS.test(signal)) return "error";
  if (SUCCESS_WORDS.test(signal)) return "success";
  if (WARNING_WORDS.test(signal)) return "warning";
  return "info";
}

export function toDisplayNotification(
  notification: PlatformNotification,
): Notification {
  return {
    id: notification.id,
    title: notification.subject,
    // The body is the only message there is; an empty one says so rather than
    // painting a blank line under the subject.
    message: notification.body ?? "No further detail was recorded.",
    link: notification.deepLink ?? undefined,
    timestamp: notification.createdAt,
    type: toneOf(notification),
    isRead: notification.readAt !== null,
  };
}
