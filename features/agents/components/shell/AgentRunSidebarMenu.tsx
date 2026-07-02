"use client";

// AgentRunSidebarMenu — conversation history grouped by agent version.
// Controls (back, agent selector, new run) live in the shell header, not here.

import { useEffect, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Loader2, ChevronRight, ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.thunks";
import { makeSelectAgentConversations } from "@/features/agents/redux/conversation-list/conversation-list.selectors";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { ItemRow } from "@/components/official/item/ItemRow";
import { buildConversationMenu } from "@/features/agents/components/conversation-actions/conversationActionRegistry";
import { renameConversation } from "@/features/agents/redux/conversation-list/conversation-row-actions.thunks";

interface AgentRunSidebarMenuProps {
  expanded: boolean;
}

function extractAgentId(pathname: string): string | null {
  const match = pathname.match(/^\/agents\/([^/]+)\/run/);
  return match?.[1] ?? null;
}

function formatRelativeDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  const now = new Date();
  const diffMs = now.getTime() - d.getTime();
  const diffDays = Math.floor(diffMs / 86_400_000);
  if (diffDays === 0)
    return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  if (diffDays === 1) return "Yesterday";
  if (diffDays < 7) return `${diffDays}d ago`;
  return d.toLocaleDateString([], { month: "short", day: "numeric" });
}

/** Group conversations by agentVersionNumber, sorted highest version first. */
function groupByVersion(
  conversations: ConversationListItem[],
): { version: number; items: ConversationListItem[] }[] {
  const map = new Map<number, ConversationListItem[]>();
  for (const conv of conversations) {
    const v = conv.agentVersionNumber ?? 0;
    let bucket = map.get(v);
    if (!bucket) {
      bucket = [];
      map.set(v, bucket);
    }
    bucket.push(conv);
  }
  return Array.from(map.entries())
    .sort(([a], [b]) => b - a)
    .map(([version, items]) => ({ version, items }));
}

export default function AgentRunSidebarMenu({
  expanded,
}: AgentRunSidebarMenuProps) {
  const dispatch = useAppDispatch();
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const agentId = extractAgentId(pathname);
  const conversationIdFromUrl = searchParams.get("conversationId") ?? undefined;

  const canonicalAgentId = useAppSelector((state) => {
    if (!agentId) return null;
    const agent = selectAgentById(state, agentId);
    return agent?.parentAgentId ?? agent?.id ?? agentId;
  });

  const selectConversations = useMemo(
    () => makeSelectAgentConversations(canonicalAgentId ?? "", null),
    [canonicalAgentId],
  );

  const {
    status: convStatus,
    conversations,
    error: convError,
  } = useAppSelector(selectConversations);

  useEffect(() => {
    if (canonicalAgentId && convStatus === "idle") {
      dispatch(
        fetchAgentConversations({
          agentId: canonicalAgentId,
          versionFilter: null,
        }),
      );
    }
  }, [canonicalAgentId, convStatus, dispatch]);

  const versionGroups = useMemo(
    () => groupByVersion(conversations),
    [conversations],
  );

  const handleConversationSelect = (convId: string) => {
    if (!agentId) return;
    router.push(`/agents/${agentId}/run?conversationId=${convId}`);
  };

  if (!agentId) return null;

  // Collapsed: version number badges
  if (!expanded) {
    return (
      <div className="flex flex-col items-center gap-1 py-0.5">
        {versionGroups.slice(0, 10).map(({ version, items }) => {
          const isActive = items.some(
            (c) => c.conversationId === conversationIdFromUrl,
          );
          return (
            <button
              key={version}
              onClick={() => handleConversationSelect(items[0].conversationId)}
              title={`Version ${version} — ${items.length} run${items.length === 1 ? "" : "s"}`}
              className={cn(
                "w-full flex items-center justify-center py-1.5",
                "shell-tactile-subtle rounded-sm transition-colors",
                isActive && "shell-active-pill",
              )}
            >
              <span
                className={cn(
                  "font-black leading-none tabular-nums",
                  "text-[12px]",
                  isActive
                    ? "text-[var(--shell-pill-text)]"
                    : "text-muted-foreground",
                )}
              >
                V{version}
              </span>
            </button>
          );
        })}
      </div>
    );
  }

  // Expanded: conversations grouped by version
  return (
    <div className="flex flex-col flex-1 min-h-0">
      <div className="px-2 py-1 shrink-0">
        <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
          Test History
        </span>
      </div>

      <div className="flex-1 overflow-y-auto min-h-0 scrollbar-thin-auto">
        {convStatus === "loading" && (
          <div className="flex items-center justify-center py-4">
            <Loader2 className="w-4 h-4 animate-spin text-muted-foreground" />
          </div>
        )}
        {convStatus === "failed" && (
          <p className="px-2 py-2 text-[10px] text-destructive">
            {convError ?? "Failed to load conversations"}
          </p>
        )}
        {convStatus === "succeeded" && conversations.length === 0 && (
          <div className="px-2 py-3 text-center">
            <p className="text-[10px] text-muted-foreground">
              No test runs yet
            </p>
          </div>
        )}
        {versionGroups.map(({ version, items }) => (
          <VersionGroup
            key={version}
            version={version}
            items={items}
            agentId={agentId}
            activeConversationId={conversationIdFromUrl}
            onSelect={handleConversationSelect}
          />
        ))}
      </div>
    </div>
  );
}

function VersionGroup({
  version,
  items,
  agentId,
  activeConversationId,
  onSelect,
}: {
  version: number;
  items: ConversationListItem[];
  agentId: string;
  activeConversationId: string | undefined;
  onSelect: (convId: string) => void;
}) {
  const hasActive = items.some(
    (c) => c.conversationId === activeConversationId,
  );
  const [open, setOpen] = useState(hasActive);

  const latestDate = useMemo(() => {
    const timestamps = items
      .map((c) => c.updatedAt)
      .filter(Boolean)
      .map((d) => new Date(d).getTime());
    if (timestamps.length === 0) return "";
    return formatRelativeDate(new Date(Math.max(...timestamps)).toISOString());
  }, [items]);

  return (
    <div className="mb-0.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 w-full px-2 py-1 text-left transition-colors hover:bg-[var(--matrx-glass-bg-hover)] rounded-sm group"
      >
        {open ? (
          <ChevronDown className="w-3 h-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="w-3 h-3 shrink-0 text-muted-foreground" />
        )}
        <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wide">
          Version {version}
        </span>
        <span className="text-[10px] text-muted-foreground/60 ml-auto">
          {latestDate}
        </span>
      </button>

      {open && (
        <div className="pl-1">
          {items.map((conv) => (
            <ConversationRow
              key={conv.conversationId}
              conv={conv}
              agentId={agentId}
              isActive={conv.conversationId === activeConversationId}
              onSelect={() => onSelect(conv.conversationId)}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function ConversationRow({
  conv,
  agentId,
  isActive,
  onSelect,
}: {
  conv: ConversationListItem;
  agentId: string;
  isActive: boolean;
  onSelect: () => void;
}) {
  const dispatch = useAppDispatch();
  const title = conv.title?.trim() || "Untitled";
  // Runner-route href — new tab + copy link land on the runner, not /chat.
  const href = `/agents/${agentId}/run?conversationId=${conv.conversationId}`;

  return (
    <ItemRow
      className="mx-1"
      size="sm"
      label={title}
      secondaryLabel={
        conv.updatedAt ? formatRelativeDate(conv.updatedAt) : undefined
      }
      active={isActive}
      onOpen={onSelect}
      menu={() =>
        buildConversationMenu({
          conversationId: conv.conversationId,
          title: conv.title,
          isFavorite: conv.isFavorite ?? false,
          isArchived: conv.status === "archived",
          excludeFromKg: conv.excludeFromKg ?? false,
          isOwner: true,
          href,
          surfaceKey: `agent-run:${agentId}`,
          dispatch,
        })
      }
      rename={{
        value: conv.title ?? "",
        emptyFallback: "Untitled",
        onCommit: (next) =>
          void dispatch(
            renameConversation({
              conversationId: conv.conversationId,
              title: next,
            }),
          ),
      }}
      trailing={
        isActive ? <ChevronRight className="w-3 h-3 shrink-0" /> : undefined
      }
    />
  );
}
