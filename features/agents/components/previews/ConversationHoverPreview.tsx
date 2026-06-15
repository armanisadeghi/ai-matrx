"use client";

/**
 * Lightweight hover preview for a conversation. Reads from Redux directly —
 * no fetch — because conversations are essentially always already in state by
 * the time anything renders a reference to them. Designed for inline triggers
 * like sidebar rows and attachment chips: appears on hover, follows the
 * pointer onto the popover so the user can click "Open" or "Copy ID", and
 * dismisses on mouse leave with a small grace delay.
 */

import { useState } from "react";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectInstance } from "@/features/agents/redux/execution-system/conversations/conversations.selectors";
import { selectAgentName } from "@/features/agents/redux/agent-definition/selectors";
import { selectMessageCount } from "@/features/agents/redux/execution-system/messages/messages.selectors";
import {
  CircuitBoard,
  Check,
  Copy,
  ExternalLink,
  MessagesSquare,
  Tag,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";

const STATUS_COLORS: Record<string, string> = {
  draft: "bg-muted text-muted-foreground",
  ready: "bg-muted text-muted-foreground",
  running: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  streaming: "bg-amber-500/15 text-amber-600 dark:text-amber-400",
  complete: "bg-emerald-500/15 text-emerald-600 dark:text-emerald-400",
  error: "bg-destructive/15 text-destructive",
  cancelled: "bg-muted text-muted-foreground",
};

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

interface ConversationPreviewContentProps {
  conversationId: string;
  /** When provided, the "Open" button calls this instead of navigating. */
  onOpen?: () => void;
}

/**
 * Pure body content for the conversation preview. Use directly when you want
 * the preview to render without a hover trigger (e.g. inside another popover).
 */
export function ConversationPreviewContent({
  conversationId,
  onOpen,
}: ConversationPreviewContentProps) {
  const conv = useAppSelector(selectInstance(conversationId));
  const agentName = useAppSelector((state) =>
    selectAgentName(state, conv?.agentId ?? ""),
  );
  const messageCount = useAppSelector(selectMessageCount(conversationId));
  const [copied, setCopied] = useState(false);

  const handleCopyId = async () => {
    try {
      await navigator.clipboard.writeText(conversationId);
      setCopied(true);
      toast.success("Conversation ID copied");
      setTimeout(() => setCopied(false), 1500);
    } catch {
      toast.error("Failed to copy");
    }
  };

  if (!conv) {
    return (
      <div className="text-xs text-muted-foreground italic">
        Conversation not loaded.
      </div>
    );
  }

  const title = conv.title?.trim() || "Untitled";
  const status = (conv.status ?? "ready") as string;
  const openHref = `/agents/${conv.agentId}/run?conversationId=${conversationId}`;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-start gap-2">
        <MessagesSquare className="w-3.5 h-3.5 text-blue-500 mt-0.5 shrink-0" />
        <div className="flex-1 min-w-0">
          <div className="text-sm font-semibold text-foreground truncate">
            {title}
          </div>
          {agentName && (
            <div className="flex items-center gap-1 text-[11px] text-muted-foreground mt-0.5">
              <CircuitBoard className="w-3 h-3" />
              <span className="truncate">{agentName}</span>
            </div>
          )}
        </div>
      </div>

      <div className="flex items-center gap-1.5 flex-wrap text-[10px]">
        <span
          className={cn(
            "inline-flex items-center px-1.5 py-0.5 rounded font-semibold capitalize",
            STATUS_COLORS[status] ?? "bg-muted text-muted-foreground",
          )}
        >
          {status}
        </span>
        <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground tabular-nums">
          {messageCount} msg{messageCount === 1 ? "" : "s"}
        </span>
        {conv.isEphemeral && (
          <span className="px-1.5 py-0.5 rounded bg-muted text-muted-foreground">
            ephemeral
          </span>
        )}
      </div>

      {conv.description && (
        <p className="text-xs text-foreground/90 whitespace-pre-wrap line-clamp-3">
          {conv.description}
        </p>
      )}

      {conv.keywords && conv.keywords.length > 0 && (
        <div className="flex flex-wrap items-center gap-1">
          <Tag className="w-3 h-3 text-muted-foreground" />
          {conv.keywords.slice(0, 6).map((k) => (
            <span
              key={k}
              className="text-[10px] px-1.5 py-0.5 rounded bg-muted text-foreground"
            >
              {k}
            </span>
          ))}
        </div>
      )}

      <div className="grid grid-cols-2 gap-1 text-[10px] text-muted-foreground pt-1 border-t border-border">
        <div>
          <div className="uppercase tracking-wider opacity-70">Updated</div>
          <div className="text-foreground/80">
            {formatDateTime(conv.updatedAt)}
          </div>
        </div>
        <div>
          <div className="uppercase tracking-wider opacity-70">Created</div>
          <div className="text-foreground/80">
            {formatDateTime(conv.createdAt)}
          </div>
        </div>
      </div>

      <div className="flex items-center gap-1.5 pt-1 border-t border-border">
        <Button
          size="sm"
          variant="ghost"
          className="h-7 px-2 text-xs gap-1"
          onClick={handleCopyId}
        >
          {copied ? (
            <Check className="text-success" />
          ) : (
            <Copy />
          )}
          {copied ? "Copied" : "Copy ID"}
        </Button>
        <div className="ml-auto">
          {onOpen ? (
            <Button
              size="sm"
              className="h-7 px-2.5 text-xs gap-1"
              onClick={onOpen}
            >
              <ExternalLink />
              Open
            </Button>
          ) : (
            <Link href={openHref} target="_blank" rel="noopener noreferrer">
              <Button size="sm" className="h-7 px-2.5 text-xs gap-1">
                <ExternalLink />
                Open
              </Button>
            </Link>
          )}
        </div>
      </div>
    </div>
  );
}

interface ConversationHoverPreviewProps {
  conversationId: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  /** When provided, the "Open" button calls this instead of navigating. */
  onOpen?: () => void;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

/**
 * Wraps a trigger element in a hover-only popover that previews a conversation.
 * The trigger receives no visual modification — it stays exactly as authored.
 */
export function ConversationHoverPreview({
  conversationId,
  children,
  side = "right",
  align = "start",
  onOpen,
  openDelay = 250,
  closeDelay = 140,
  className,
}: ConversationHoverPreviewProps) {
  return (
    <HoverCard openDelay={openDelay} closeDelay={closeDelay}>
      <HoverCardTrigger asChild>{children}</HoverCardTrigger>
      <HoverCardContent
        side={side}
        align={align}
        sideOffset={8}
        className={cn(
          "w-80 p-3 bg-card border border-border shadow-lg",
          className,
        )}
      >
        <ConversationPreviewContent
          conversationId={conversationId}
          onOpen={onOpen}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
