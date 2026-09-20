"use client";

import { Fragment, useCallback, useRef, useState } from "react";
import { Loader2, MessagesSquare, Plus, RotateCcw, Split } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { useAppDispatch } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { destroyInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { forkConversationServer } from "@/features/agents/redux/execution-system/message-crud/server/fork-conversation-server.thunk";
import { ConversationPickerWindow } from "@/features/agents/components/conversation-history/ConversationPickerWindow";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import { ModePicker } from "@/features/agent-comparison/shared/ModePicker";
import { ConversationBattleColumn } from "./ConversationBattleColumn";
import { createConversationBattleForks } from "../forkConversationBattle";
import type {
  ConversationBattleFork,
  ConversationBattleSource,
} from "../types";

const INITIAL_FORK_COUNT = 2;

export function ConversationBattlePage() {
  const dispatch = useAppDispatch();
  const [source, setSource] = useState<ConversationBattleSource | null>(null);
  const [forks, setForks] = useState<ConversationBattleFork[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const nextForkNumberRef = useRef(1);

  const selectSource = useCallback((conversation: ConversationListItem) => {
    setSource({
      conversationId: conversation.conversationId,
      title: conversation.title,
      updatedAt: conversation.updatedAt,
    });
  }, []);

  const addForks = useCallback(
    async (count: number) => {
      if (!source || isForking) return;
      setIsForking(true);
      const firstForkNumber = nextForkNumberRef.current;
      nextForkNumberRef.current += count;
      const sourceTitle = source.title?.trim() || "Untitled chat";

      try {
        const { created, failures } = await createConversationBattleForks({
          count,
          firstForkNumber,
          sourceTitle,
          forkConversation: (title) =>
            dispatch(
              forkConversationServer({
                conversationId: source.conversationId,
                title,
                retainForkOnHydrationFailure: true,
              }),
            )
              .unwrap()
              .then((result) => ({
                conversationId: result.conversationId,
                loadError: result.hydrationError,
              })),
        });
        const failed = failures.length;
        if (created.length > 0) {
          setForks((current) => [...current, ...created]);
          const recovering = created.filter((fork) => fork.loadError).length;
          if (recovering > 0) {
            toast.warning(
              `${created.length} fork${created.length === 1 ? "" : "s"} created · ${recovering} require${recovering === 1 ? "s" : ""} a loading retry`,
            );
          } else {
            toast.success(
              `${created.length} conversation fork${created.length === 1 ? "" : "s"} ready`,
            );
          }
        }
        if (failed > 0) {
          toast.error(
            `${failed} fork${failed === 1 ? "" : "s"} failed: ${formatError(failures[0])}`,
          );
        }
      } finally {
        setIsForking(false);
      }
    },
    [dispatch, isForking, source],
  );

  const removeFork = useCallback(
    (fork: ConversationBattleFork) => {
      dispatch(destroyInstance(fork.conversationId));
      setForks((current) =>
        current.filter((item) => item.columnId !== fork.columnId),
      );
    },
    [dispatch],
  );

  const resetBattle = useCallback(() => {
    for (const fork of forks) {
      dispatch(destroyInstance(fork.conversationId));
    }
    setForks([]);
    setSource(null);
    nextForkNumberRef.current = 1;
    setResetConfirmOpen(false);
  }, [dispatch, forks]);

  return (
    <div
      className="matrx-touch-targets h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <ModePicker />

      <div className="shrink-0 flex items-center gap-2 border-b border-border bg-card px-2 py-1.5">
        <div className="flex items-center gap-2 min-w-0">
          <MessagesSquare className="size-4 text-primary shrink-0" />
          <div className="min-w-0">
            <div className="text-[10px] uppercase tracking-wider font-semibold text-muted-foreground">
              Source conversation
            </div>
            <div className="text-xs font-medium truncate max-w-[360px]">
              {source?.title?.trim() ||
                (source ? "Untitled chat" : "None selected")}
            </div>
          </div>
          {source && (
            <EntityDoorControls
              token="conversation"
              id={source.conversationId}
              name={source.title}
              className="shrink-0"
            />
          )}
        </div>

        <Button
          size="sm"
          variant="outline"
          className="h-7"
          disabled={forks.length > 0 || isForking}
          onClick={() => setPickerOpen(true)}
          title={
            forks.length > 0
              ? "Start a new battle before changing the source"
              : "Choose an existing conversation"
          }
        >
          {source ? "Change source" : "Choose conversation"}
        </Button>

        <div className="flex-1" />

        {source && forks.length === 0 && (
          <Button
            size="sm"
            className="h-7"
            disabled={isForking}
            onClick={() => void addForks(INITIAL_FORK_COUNT)}
          >
            {isForking ? (
              <Loader2 className="size-3.5 animate-spin" />
            ) : (
              <Split className="size-3.5" />
            )}
            Create {INITIAL_FORK_COUNT} forks
          </Button>
        )}

        {forks.length > 0 && (
          <>
            <Button
              size="sm"
              className="h-7"
              disabled={isForking}
              onClick={() => void addForks(1)}
            >
              {isForking ? (
                <Loader2 className="size-3.5 animate-spin" />
              ) : (
                <Plus className="size-3.5" />
              )}
              Add fork
            </Button>
            <Button
              size="sm"
              variant="ghost"
              className="h-7"
              disabled={isForking}
              onClick={() => setResetConfirmOpen(true)}
            >
              <RotateCcw className="size-3.5" />
              New battle
            </Button>
          </>
        )}
      </div>

      <div className="shrink-0 border-b border-border bg-muted/20 px-3 py-1.5 text-[11px] text-muted-foreground">
        The source stays untouched. Every column is a durable fork with the full
        normal chat composer, so its message, attachments, resources, variables,
        context, and follow-up turns can diverge independently.
      </div>

      <div className="flex-1 min-h-0 overflow-hidden">
        {forks.length === 0 ? (
          <EmptyState
            hasSource={!!source}
            isForking={isForking}
            onChoose={() => setPickerOpen(true)}
            onCreate={() => void addForks(INITIAL_FORK_COUNT)}
          />
        ) : (
          <ForkColumns forks={forks} onRemove={removeFork} />
        )}
      </div>

      <ConversationPickerWindow
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={selectSource}
        scopeId="conversation-battle-source"
        title="Choose the conversation to fork"
        activeConversationId={source?.conversationId ?? null}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Start a new conversation battle?"
        description="This clears the battle view so you can choose another source. The durable forks you already created stay available in chat history."
        confirmLabel="New battle"
        variant="destructive"
        onConfirm={resetBattle}
      />
    </div>
  );
}

function ForkColumns({
  forks,
  onRemove,
}: {
  forks: ConversationBattleFork[];
  onRemove: (fork: ConversationBattleFork) => void;
}) {
  const groupKey = forks.map((fork) => fork.columnId).join("|");
  const equalSize = `${100 / forks.length}%`;

  return (
    <div className="h-full overflow-x-auto">
      <div
        className="h-full"
        style={{ minWidth: `${Math.max(forks.length * 320, 640)}px` }}
      >
        <ResizablePanelGroup
          key={groupKey}
          id="agent-comparison-conversation-columns"
          orientation="horizontal"
          className="h-full w-full"
        >
          {forks.map((fork, index) => (
            <Fragment key={fork.columnId}>
              {index > 0 && <ResizableHandle withHandle />}
              <ResizablePanel
                id={fork.columnId}
                defaultSize={equalSize}
                minSize="280px"
                style={{ overflow: "hidden" }}
              >
                <ConversationBattleColumn fork={fork} onRemove={onRemove} />
              </ResizablePanel>
            </Fragment>
          ))}
        </ResizablePanelGroup>
      </div>
    </div>
  );
}

function EmptyState({
  hasSource,
  isForking,
  onChoose,
  onCreate,
}: {
  hasSource: boolean;
  isForking: boolean;
  onChoose: () => void;
  onCreate: () => void;
}) {
  return (
    <div className="h-full flex items-center justify-center p-8 text-center">
      <div className="max-w-lg space-y-4">
        <div className="mx-auto size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Split className="size-6" />
        </div>
        <div>
          <h2 className="text-base font-semibold">
            {hasSource
              ? "Ready to branch the conversation"
              : "Start every contender from the same history"}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {hasSource
              ? "Create two independent copies, then send a different normal chat message in each column."
              : "Choose an existing chat. Conversation Battle will fork it instead of modifying the original."}
          </p>
        </div>
        <Button onClick={hasSource ? onCreate : onChoose} disabled={isForking}>
          {isForking ? (
            <Loader2 className="size-4 animate-spin" />
          ) : hasSource ? (
            <Split className="size-4" />
          ) : (
            <MessagesSquare className="size-4" />
          )}
          {hasSource ? "Create 2 forks" : "Choose conversation"}
        </Button>
      </div>
    </div>
  );
}

function formatError(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (
    typeof error === "object" &&
    error !== null &&
    "message" in error &&
    typeof error.message === "string"
  ) {
    return error.message;
  }
  return String(error ?? "Unknown error");
}
