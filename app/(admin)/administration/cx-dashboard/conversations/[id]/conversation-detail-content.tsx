"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { CxJsonViewer } from "@/features/cx-dashboard/components/CxJsonViewer";
import { CxEmptyState } from "@/features/cx-dashboard/components/CxEmptyState";
import { CxDashboardErrorBoundary } from "@/features/cx-dashboard/components/CxDashboardErrorBoundary";
import {
  formatDate,
  formatDateFull,
  formatCost,
  formatTokens,
  formatDuration,
  statusBadgeVariant,
  truncateId,
  computeDuration,
} from "@/features/cx-dashboard/utils/format";
import {
  exportToCSV,
  exportToJSON,
} from "@/features/cx-dashboard/utils/export";
import type {
  CxConversation,
  CxMessage,
  CxUserRequest,
} from "@/features/cx-dashboard/types/cxDashboardTypes";
import {
  ArrowLeft,
  GitBranch,
  Clock,
  Send,
  ExternalLink,
  Download,
  MessageSquare,
  ChevronRight,
} from "lucide-react";
import dynamic from "next/dynamic";

const MarkdownStream = dynamic(() => import("@/components/MarkdownStream"), {
  ssr: false,
});

type Detail = {
  conversation: CxConversation;
  messages: CxMessage[];
  user_requests: CxUserRequest[];
  child_conversations: CxConversation[];
};

export function ConversationDetailContent({ detail }: { detail: Detail }) {
  const router = useRouter();
  const {
    conversation: conv,
    messages,
    user_requests,
    child_conversations,
  } = detail;

  return (
    <div className="p-4 space-y-4">
      {/* Header */}
      <div className="flex items-start gap-3">
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 mt-0.5"
          onClick={() => router.back()}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
        </Button>
        <div className="flex-1 min-w-0">
          <h2 className="text-sm font-semibold truncate">
            {conv.title || (
              <span className="italic text-muted-foreground">
                Untitled Conversation
              </span>
            )}
          </h2>
          <div className="flex items-center gap-3 text-xs text-muted-foreground mt-0.5">
            <span className="font-mono">{truncateId(conv.id, 12)}</span>
            <Badge
              variant={statusBadgeVariant(conv.status)}
              className="text-[10px]"
            >
              {conv.status}
            </Badge>
            {conv.model_name && (
              <span>
                {conv.model_name} ({conv.provider})
              </span>
            )}
            <span>{formatDateFull(conv.created_at)}</span>
          </div>
        </div>
        <div className="flex gap-1">
          <Button
            variant="outline"
            size="sm"
            className="h-7 text-xs"
            onClick={() =>
              exportToJSON(messages as any[], "conversation-messages")
            }
          >
            <Download className="w-3 h-3 mr-1" />
            Export
          </Button>
        </div>
      </div>

      {/* Parent link */}
      {conv.parent_conversation_id && (
        <Link
          href={`/administration/cx-dashboard/conversations/${conv.parent_conversation_id}`}
          className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground p-2 rounded border border-border/50 bg-muted/20 transition-colors"
        >
          <GitBranch className="w-3.5 h-3.5" />
          <span>Sub-agent of conversation</span>
          <span className="font-mono">
            {truncateId(conv.parent_conversation_id, 12)}
          </span>
          <ExternalLink className="w-3 h-3 ml-auto" />
        </Link>
      )}

      {/* Child conversations */}
      {child_conversations.length > 0 && (
        <div className="border border-border rounded-md p-3 bg-card">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <GitBranch className="w-3.5 h-3.5" />
            Child Conversations ({child_conversations.length})
          </h3>
          <div className="space-y-1">
            {child_conversations.map((child) => (
              <Link
                key={child.id}
                href={`/administration/cx-dashboard/conversations/${child.id}`}
                className="flex items-center gap-3 text-xs p-2 rounded hover:bg-muted/50 transition-colors group"
              >
                <span className="font-mono text-muted-foreground">
                  {truncateId(child.id)}
                </span>
                <span className="flex-1 truncate">
                  {child.title || "Untitled"}
                </span>
                {child.model_name && (
                  <span className="text-muted-foreground">
                    {child.model_name}
                  </span>
                )}
                <span className="text-muted-foreground">
                  {child.message_count} msgs
                </span>
                <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
              </Link>
            ))}
          </div>
        </div>
      )}

      {/* User requests for this conversation */}
      {user_requests.length > 0 && (
        <div className="border border-border rounded-md p-3 bg-card">
          <h3 className="text-xs font-medium text-muted-foreground mb-2 flex items-center gap-1.5">
            <Send className="w-3.5 h-3.5" />
            User Requests ({user_requests.length})
          </h3>
          <div className="space-y-1">
            {user_requests.map((ur) => {
              const dur = computeDuration(
                ur.created_at,
                ur.completed_at,
                ur.total_duration_ms,
              );
              return (
                <Link
                  key={ur.id}
                  href={`/administration/cx-dashboard/requests/${ur.id}`}
                  className="flex items-center gap-3 text-xs p-2 rounded hover:bg-muted/50 transition-colors group"
                >
                  <span className="font-mono text-muted-foreground">
                    {truncateId(ur.id)}
                  </span>
                  <Badge
                    variant={statusBadgeVariant(ur.status)}
                    className="text-[10px]"
                  >
                    {ur.status}
                  </Badge>
                  <span>{ur.iterations} iter</span>
                  <span>{ur.total_tool_calls} tools</span>
                  <span className="font-mono">
                    {formatCost(Number(ur.total_cost))}
                  </span>
                  <span className="text-muted-foreground">
                    {formatTokens(ur.total_tokens)} tok
                  </span>
                  <span className="text-muted-foreground ml-auto">
                    {formatDuration(dur)}
                  </span>
                  <ChevronRight className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100" />
                </Link>
              );
            })}
          </div>
        </div>
      )}

      {/* Messages */}
      <div className="border border-border rounded-md bg-card">
        <div className="flex items-center gap-2 px-3 py-2 border-b border-border">
          <MessageSquare className="w-3.5 h-3.5 text-muted-foreground" />
          <h3 className="text-xs font-medium text-muted-foreground">
            Messages ({messages.length})
          </h3>
        </div>
        {messages.length === 0 ? (
          <CxEmptyState
            title="No messages"
            description="This conversation has no messages yet."
          />
        ) : (
          <div className="divide-y divide-border/50">
            {messages.map((msg) => (
              <CxDashboardErrorBoundary
                key={msg.id}
                fallbackMessage={`Failed to render message ${msg.id}`}
              >
                <MessageRow message={msg} />
              </CxDashboardErrorBoundary>
            ))}
          </div>
        )}
      </div>

      {/* Debug JSON views */}
      <CxJsonViewer data={conv} label="Conversation Raw Data" />
      <CxJsonViewer
        data={{
          config: conv.config,
          variables: conv.variables,
          overrides: conv.overrides,
          metadata: conv.metadata,
        }}
        label="Config / Variables / Metadata"
      />
    </div>
  );
}

function MessageRow({ message }: { message: CxMessage }) {
  const roleColors: Record<string, string> = {
    user: "bg-blue-500/10 text-blue-500 border-blue-500/20",
    assistant: "bg-emerald-500/10 text-emerald-500 border-emerald-500/20",
    tool: "bg-amber-500/10 text-amber-500 border-amber-500/20",
    system: "bg-purple-500/10 text-purple-500 border-purple-500/20",
  };

  // Extract text content from content blocks
  // cx_message.content is Json — narrow to an array of block-shaped records.
  const contentBlocks: Array<{ type?: string; text?: string }> = Array.isArray(
    message.content,
  )
    ? (message.content as Array<{ type?: string; text?: string }>)
    : [];

  const textContent = contentBlocks
    .filter((block) => block.type === "text" && block.text)
    .map((block) => block.text!)
    .join("\n\n");

  const thinkingContent = contentBlocks
    .filter((block) => block.type === "thinking" && block.text)
    .map((block) => block.text!)
    .join("\n\n");

  return (
    <div className="p-3">
      <div className="flex items-center gap-2 mb-1.5">
        <Badge
          variant="outline"
          className={`text-[10px] font-mono ${roleColors[message.role] || ""}`}
        >
          {message.role}
        </Badge>
        <span className="text-[10px] text-muted-foreground">
          pos: {message.position}
        </span>
        <span className="text-[10px] text-muted-foreground font-mono">
          {truncateId(message.id)}
        </span>
        <span className="text-[10px] text-muted-foreground ml-auto">
          {formatDate(message.created_at)}
        </span>
      </div>

      {/* Thinking blocks (collapsed by default) */}
      {thinkingContent && (
        <details className="mb-2">
          <summary className="text-[10px] text-muted-foreground cursor-pointer hover:text-foreground">
            Thinking ({thinkingContent.length.toLocaleString()} chars)
          </summary>
          <div className="mt-1 pl-2 border-l-2 border-purple-500/20 text-xs text-muted-foreground max-h-[200px] overflow-auto">
            <pre className="whitespace-pre-wrap font-mono text-[11px]">
              {thinkingContent.slice(0, 2000)}
              {thinkingContent.length > 2000 ? "..." : ""}
            </pre>
          </div>
        </details>
      )}

      {/* Main content */}
      {textContent ? (
        <div className="text-sm prose prose-sm dark:prose-invert max-w-none">
          <MarkdownStream
            content={textContent}
            isStreamActive={false}
            hideCopyButton={false}
            allowFullScreenEditor={false}
          />
        </div>
      ) : contentBlocks.length === 0 ? (
        <p className="text-xs text-muted-foreground italic">Empty message</p>
      ) : null}

      {/* Non-text/thinking blocks as JSON */}
      {contentBlocks.some(
        (b) => b.type !== "text" && b.type !== "thinking",
      ) && (
        <CxJsonViewer
          data={contentBlocks.filter(
            (b) => b.type !== "text" && b.type !== "thinking",
          )}
          label={`Other Content Blocks (${contentBlocks.filter((b) => b.type !== "text" && b.type !== "thinking").length})`}
          maxHeight="150px"
        />
      )}
    </div>
  );
}
