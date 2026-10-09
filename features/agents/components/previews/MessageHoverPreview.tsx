"use client";

/**
 * Lightweight hover preview for a single message. Reads from Redux directly —
 * no fetch — because messages are essentially always already in state by the
 * time anything renders a reference to one. Pairs with ConversationHoverPreview
 * for "attached" chips and inline links.
 */

import { useClipboard } from "@ai-matrx/kit/clipboard";
import { copyNotify } from "@/lib/clipboard/copy-notify";
import { kindTextToMarkdown } from "@/features/content-ir/surfaces/kind-text-to-markdown";
import { useState } from "react";
import Link from "next/link";
import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@/components/ui/hover-card";
import { Button } from "@/components/ui/button";
import { useAppSelector } from "@/lib/redux/hooks";
import {
  extractInspectableText,
  selectMessageById,
} from "@ai-matrx/chat/agents/redux/execution-system/messages/messages.selectors";
import { selectInstance } from "@ai-matrx/chat/agents/redux/execution-system/conversations/conversations.selectors";
import {
  Check,
  Copy,
  ExternalLink,
  CircleDot,
  User,
  Settings,
  Wrench,
  ArrowUpRight,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";

const MESSAGE_PREVIEW_CHARS = 600;

const ROLE_STYLE: Record<
  string,
  { Icon: React.ComponentType<{ className?: string }>; color: string; label: string }
> = {
  system: {
    Icon: Settings,
    color:
      "bg-amber-500/15 text-amber-600 dark:text-amber-400 border-amber-500/30",
    label: "System",
  },
  user: {
    Icon: User,
    color:
      "bg-blue-500/15 text-blue-600 dark:text-blue-400 border-blue-500/30",
    label: "User",
  },
  assistant: {
    Icon: CircleDot,
    color:
      "bg-violet-500/15 text-violet-600 dark:text-violet-400 border-violet-500/30",
    label: "Assistant",
  },
};

function countToolCalls(content: unknown): number {
  if (!Array.isArray(content)) return 0;
  return (content as Array<{ type?: string }>).filter(
    (b) => b?.type === "tool_call",
  ).length;
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const d = new Date(value);
  if (isNaN(d.getTime())) return value;
  return d.toLocaleString();
}

interface MessagePreviewContentProps {
  conversationId: string;
  messageId: string;
  /** When provided, "Open" calls this; otherwise links to the conversation. */
  onOpen?: () => void;
}

export function MessagePreviewContent({
  conversationId,
  messageId,
  onOpen,
}: MessagePreviewContentProps) {
  const { copyText } = useClipboard({
    notify: copyNotify,
  });
  const message = useAppSelector(
    selectMessageById(conversationId, messageId),
  );
  const conversation = useAppSelector(selectInstance(conversationId));
  const [copied, setCopied] = useState(false);

  // Structured (non-text) payloads preview instead of a blank ("screen lies"
  // class fix).
  // A preview is read by a person: a `__kind` answer previews as its kind's
  // markdown, never its stored JSON (the record itself is untouched).
  const text = message ? kindTextToMarkdown(extractInspectableText(message).text) : "";
  const toolCalls = countToolCalls(message?.content);

  const handleCopy = async () => {
    if (!text) return;
    if (!(await copyText(text, "Message text copied"))) return;
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  if (!message) {
    return (
      <div className="type-secondary text-muted-foreground italic">
        Message not loaded.
      </div>
    );
  }

  const roleKey = message.role as keyof typeof ROLE_STYLE;
  const role = ROLE_STYLE[roleKey] ?? ROLE_STYLE.assistant;
  const RoleIcon = role.Icon;

  const truncated =
    text.length > MESSAGE_PREVIEW_CHARS
      ? text.slice(0, MESSAGE_PREVIEW_CHARS).trimEnd() + "…"
      : text;

  const openHref = conversation
    ? `/agents/go/${conversation.agentId}/run?conversationId=${conversationId}`
    : null;

  return (
    <div className="flex flex-col gap-2.5">
      <div className="flex items-center gap-2">
        <span
          className={cn(
            "inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border type-meta font-semibold",
            role.color,
          )}
        >
          <RoleIcon className="w-3 h-3" />
          {role.label}
        </span>
        {message.position != null && (
          <span className="type-meta text-muted-foreground tabular-nums">
            #{message.position + 1}
          </span>
        )}
        {toolCalls > 0 && (
          <span className="inline-flex items-center gap-0.5 type-meta text-orange-600 dark:text-orange-400">
            <Wrench className="w-2.5 h-2.5" />
            {toolCalls} tool{toolCalls === 1 ? "" : "s"}
          </span>
        )}
      </div>

      {conversation?.title?.trim() && (
        <div className="type-meta text-muted-foreground truncate">
          in <span className="text-foreground/80">{conversation.title}</span>
        </div>
      )}

      {truncated ? (
        <p className="type-secondary text-foreground whitespace-pre-wrap break-words max-h-48 overflow-y-auto">
          {truncated}
        </p>
      ) : (
        // read-gate-exempt: describes one message record already loaded in the store (non-text message), not a read's empty answer
        <p className="type-secondary text-muted-foreground italic">No text content</p>
      )}

      <div className="type-meta text-muted-foreground pt-1 border-t border-border">
        {formatDateTime(message.createdAt)}
      </div>

      <div className="flex items-center gap-1.5">
        <Button
          icon={copied ? <Check className="text-success" /> : <Copy />}
          variant="quiet"
          onClick={handleCopy}
          disabled={!text}
        >
          {copied ? "Copied" : "Copy text"}
        </Button>
        <div className="ml-auto">
          {onOpen ? (
            <Button
              icon={<ArrowUpRight />}
              variant="primary"
              onClick={onOpen}
            >
              Open
            </Button>
          ) : openHref ? (
            <Link href={openHref} target="_blank" rel="noopener noreferrer">
              <Button icon={<ExternalLink />} type="submit" variant="primary">
                Open
              </Button>
            </Link>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface MessageHoverPreviewProps {
  conversationId: string;
  messageId: string;
  children: React.ReactNode;
  side?: "top" | "right" | "bottom" | "left";
  align?: "start" | "center" | "end";
  onOpen?: () => void;
  openDelay?: number;
  closeDelay?: number;
  className?: string;
}

/**
 * Wraps a trigger element in a hover-only popover that previews a single
 * message. The trigger receives no visual modification — it stays exactly as
 * authored.
 */
export function MessageHoverPreview({
  conversationId,
  messageId,
  children,
  side = "right",
  align = "start",
  onOpen,
  openDelay = 250,
  closeDelay = 140,
  className,
}: MessageHoverPreviewProps) {
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
        <MessagePreviewContent
          conversationId={conversationId}
          messageId={messageId}
          onOpen={onOpen}
        />
      </HoverCardContent>
    </HoverCard>
  );
}
