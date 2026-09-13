"use client";

/**
 * ChatSandboxToggleButton — the chat header's Sandbox control.
 *
 * Present ONLY when this conversation has a bound box: with no box there is
 * nothing to show, and a control that opens an empty explanation is the dead
 * control the repo bans. The icon fills while the panel is open, and a dot
 * marks the box working so the user can tell there is something to look at
 * without opening it.
 */

import { Box } from "lucide-react";

import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectLiveToolLifecycleByConversation } from "@/features/agents/redux/execution-system/active-requests/active-requests.selectors";
import { useChatSandboxPanel } from "./useChatSandboxPanel";
import { isSandboxTool } from "./sandbox-activity";

export function ChatSandboxToggleButton({
  conversationId,
}: {
  conversationId?: string;
}) {
  const { available, open, toggle } = useChatSandboxPanel(conversationId);
  const live = useAppSelector(
    selectLiveToolLifecycleByConversation(conversationId ?? ""),
  );

  if (!conversationId || !available) return null;

  const busy = live
    ? [...live.values()].some(
        (entry) =>
          isSandboxTool(entry.toolName) &&
          (entry.status === "started" ||
            entry.status === "progress" ||
            entry.status === "step"),
      )
    : false;

  return (
    <button
      type="button"
      onClick={toggle}
      aria-pressed={open}
      title={open ? "Hide the sandbox panel" : "Show the sandbox panel"}
      data-testid="chat-sandbox-toggle"
      className={cn(
        "relative flex items-center gap-1 rounded px-1.5 py-1 text-xs transition-colors",
        open
          ? "bg-accent text-foreground"
          : "text-muted-foreground hover:bg-accent/50 hover:text-foreground",
      )}
    >
      <Box className="size-4" />
      <span className="hidden sm:inline">Sandbox</span>
      {busy && (
        <span className="absolute right-0.5 top-0.5 size-1.5 animate-pulse rounded-full bg-emerald-500" />
      )}
    </button>
  );
}
