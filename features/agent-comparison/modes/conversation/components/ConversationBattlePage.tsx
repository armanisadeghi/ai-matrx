"use client";

import { Fragment, useState } from "react";
import { Loader2, MessagesSquare, Plus, RotateCcw, Split } from "lucide-react";
import {
  ResizableHandle,
  ResizablePanel,
  ResizablePanelGroup,
} from "@/components/ui/resizable";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { TextInputDialog } from "@/components/dialogs/text-input/TextInputDialog";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { destroyInstance } from "@/features/agents/redux/execution-system/conversations/conversations.slice";
import { forkConversationServer } from "@/features/agents/redux/execution-system/message-crud/server/fork-conversation-server.thunk";
import { ConversationPickerWindow } from "@/features/agents/components/conversation-history/ConversationPickerWindow";
import type { ConversationListItem } from "@/features/agents/redux/conversation-list/conversation-list.types";
import type { HeaderAction } from "@/features/shell/components/header/variants/types";
import { BattleHeader } from "@/features/agent-comparison/shared/BattleHeader";
import { ComparisonSetLoaderDialog } from "@/features/agent-comparison/components/ComparisonSetLoaderDialog";
import {
  BattleRouteNotice,
  useBattleRoute,
} from "@/features/agent-comparison/shared/useBattleRoute";
import {
  persistForRun,
  type PersistedBattle,
} from "@/features/agent-comparison/shared/battlePersistence";
import { ConversationBattleColumn } from "./ConversationBattleColumn";
import { createConversationBattleForks } from "../forkConversationBattle";
import {
  addConversationForks,
  removeConversationFork,
  reserveForkNumbers,
  setActiveConversationSet,
  setConversationBattleSource,
} from "../redux/slice";
import {
  clearConversationBattle,
  loadConversationBattleSet,
  persistConversationBattle,
  renameConversationBattle,
} from "../redux/thunks";
import type { ConversationBattleFork } from "../types";

const INITIAL_FORK_COUNT = 2;

export function ConversationBattlePage({
  setId = null,
}: {
  setId?: string | null;
}) {
  const dispatch = useAppDispatch();
  const source = useAppSelector((s) => s.agentComparisonConversation.source);
  const forks = useAppSelector((s) => s.agentComparisonConversation.forks);
  const activeSetId = useAppSelector(
    (s) => s.agentComparisonConversation.activeSetId,
  );
  const activeSetName = useAppSelector(
    (s) => s.agentComparisonConversation.activeSetName,
  );
  const nextForkNumber = useAppSelector(
    (s) => s.agentComparisonConversation.nextForkNumber,
  );
  const [pickerOpen, setPickerOpen] = useState(false);
  const [isForking, setIsForking] = useState(false);
  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);
  const [loaderOpen, setLoaderOpen] = useState(false);
  const [renameOpen, setRenameOpen] = useState(false);
  const [renameBusy, setRenameBusy] = useState(false);

  const routeStatus = useBattleRoute({
    mode: "conversation",
    urlSetId: setId,
    activeSetId,
    load: (id) => dispatch(loadConversationBattleSet({ setId: id })).unwrap(),
  });

  /**
   * Keep the saved battle in step with the forks on screen. The first save
   * creates the battle (and its URL); a failure never undoes the forks — the
   * forks are durable chats either way — it says so instead.
   */
  const saveForks = async () => {
    const { cancelled, error } = await persistForRun(
      (): Promise<PersistedBattle> =>
        dispatch(persistConversationBattle()).unwrap(),
    );
    if (!cancelled && error) {
      toast.warning("The forks are ready, but this battle could not be saved", {
        description: `${error} It has no link yet; use Save battle to try again.`,
      });
    }
  };

  const selectSource = (conversation: ConversationListItem) => {
    dispatch(
      setConversationBattleSource({
        conversationId: conversation.conversationId,
        title: conversation.title,
        updatedAt: conversation.updatedAt,
        agentId: conversation.agentId ?? null,
      }),
    );
  };

  const addForks = async (count: number) => {
    if (!source || isForking) return;
    setIsForking(true);
    const firstForkNumber = nextForkNumber;
    dispatch(reserveForkNumbers(count));
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
        dispatch(addConversationForks(created));
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
        await saveForks();
      }
      if (failed > 0) {
        toast.error(
          `${failed} fork${failed === 1 ? "" : "s"} failed: ${formatError(failures[0])}`,
        );
      }
    } finally {
      setIsForking(false);
    }
  };

  const removeFork = (fork: ConversationBattleFork) => {
    dispatch(destroyInstance(fork.conversationId));
    dispatch(removeConversationFork({ columnId: fork.columnId }));
    // A saved battle forgets the fork too (the chat stays in history). The
    // last fork cannot be removed from a saved battle's record — the save
    // path refuses an empty battle — so the record keeps it until re-forked.
    if (activeSetId && forks.length > 1) void saveForks();
  };

  const resetBattle = () => {
    void dispatch(clearConversationBattle());
    setResetConfirmOpen(false);
  };

  const handleSave = async () => {
    try {
      const saved = await dispatch(persistConversationBattle()).unwrap();
      toast.success(saved.created ? "Battle saved" : "Changes saved");
    } catch (err) {
      toast.error(`Couldn't save: ${formatError(err)}`);
    }
  };

  const handleRename = async (name: string) => {
    setRenameBusy(true);
    try {
      await dispatch(renameConversationBattle({ name })).unwrap();
      setRenameOpen(false);
    } catch (err) {
      toast.error(`Couldn't rename: ${formatError(err)}`);
    } finally {
      setRenameBusy(false);
    }
  };

  const actions: HeaderAction[] = [
    {
      icon: "Library",
      label: "Open a saved battle",
      onPress: () => setLoaderOpen(true),
    },
    ...(forks.length > 0
      ? [
          {
            icon: "Save",
            label: activeSetId ? "Save changes" : "Save battle",
            onPress: () => {
              void handleSave();
            },
          },
        ]
      : []),
    ...(activeSetId
      ? [
          {
            icon: "Pencil",
            label: "Rename battle…",
            onPress: () => setRenameOpen(true),
          },
        ]
      : []),
    ...(source || forks.length > 0
      ? [
          {
            icon: "SquarePlus",
            label: "Start a new battle",
            destructive: true,
            onPress: () => setResetConfirmOpen(true),
          },
        ]
      : []),
  ];

  return (
    <div
      className="matrx-touch-targets h-full flex flex-col overflow-hidden"
      style={{ paddingTop: "var(--shell-header-h)" }}
    >
      <BattleHeader
        battleName={activeSetName}
        fallbackTitle="Conversation battle"
        actions={actions}
      />

      <BattleRouteNotice status={routeStatus} mode="conversation" />

      <div className="shrink-0 flex h-10 items-center gap-2 border-b border-border bg-card px-3">
        <div className="flex min-w-0 items-center gap-1.5">
          <MessagesSquare className="size-4 text-primary shrink-0" />
          <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wider text-muted-foreground">
            Source
          </span>
          <span className="min-w-0 max-w-[360px] truncate text-xs font-medium text-foreground">
            {source?.title?.trim() ||
              (source ? "Untitled chat" : "None selected")}
          </span>
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
        title="Choose conversation"
        activeConversationId={source?.conversationId ?? null}
      />

      <ConfirmDialog
        open={resetConfirmOpen}
        onOpenChange={setResetConfirmOpen}
        title="Start a new conversation battle?"
        description={
          activeSetId
            ? "This clears the battle view so you can choose another source. This battle stays saved — reopen it from Open a saved battle — and its forks stay in chat history."
            : "This clears the battle view so you can choose another source. The durable forks you already created stay available in chat history."
        }
        confirmLabel="New battle"
        variant="destructive"
        onConfirm={resetBattle}
      />

      <ComparisonSetLoaderDialog
        open={loaderOpen}
        onOpenChange={setLoaderOpen}
        mode="conversation"
        activeSetId={activeSetId}
        onDeleted={(id) => {
          if (id === activeSetId) dispatch(setActiveConversationSet(null));
        }}
      />

      <TextInputDialog
        open={renameOpen}
        onOpenChange={(o) => !renameBusy && setRenameOpen(o)}
        title="Rename battle"
        placeholder="Battle name"
        defaultValue={activeSetName ?? ""}
        confirmLabel="Rename"
        busy={renameBusy}
        onConfirm={handleRename}
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
      <div className="space-y-3">
        <div className="mx-auto size-12 rounded-full bg-primary/10 text-primary flex items-center justify-center">
          <Split className="size-6" />
        </div>
        <h2 className="text-sm font-semibold">
          {hasSource ? "Ready to fork" : "Choose a source conversation"}
        </h2>
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
