/**
 * Renders the deep-link chips for a message's action_data (drift notifications
 * first). Sits inside the message bubble, below the text. Renders nothing for
 * plain messages or unknown action kinds.
 */

"use client";

import { renderMessageActionChips } from "@/features/messaging/actions/messageActionRegistry";
import type { MessageActionData } from "@/features/messaging/types";

interface MessageActionChipsProps {
  actionData: MessageActionData | null | undefined;
  isOwn: boolean;
}

export function MessageActionChips({ actionData, isOwn }: MessageActionChipsProps) {
  const chips = renderMessageActionChips(actionData, { isOwn });
  if (!chips) return null;
  return <div className="mt-2 flex flex-wrap gap-1.5">{chips}</div>;
}
