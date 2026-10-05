import { toast } from "../../../../../host/notify";

/**
 * Choosing the agent that is already answering is never silent: the composer
 * pill says "Custom" when that agent holds the default-chat job, while the
 * agent list names it by its own name — so the press answers who is in the seat.
 */
export function announceAlreadyAnswering(info: {
  agentName: string | null;
  isCustom: boolean;
}): void {
  const name = info.agentName ?? "This agent";
  toast.info(
    info.isCustom
      ? `${name} is your Custom chat, and it is already answering this conversation.`
      : `${name} is already answering this conversation.`,
  );
}
