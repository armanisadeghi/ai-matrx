"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Loader2,
  MessagesSquare,
  RefreshCw,
  X,
} from "lucide-react";
import { EntityDoorControls } from "@/components/official/entity-ref/EntityDoorControls";
import { BoundColumn } from "@/features/agent-comparison/shared/BoundColumn";
import { useAppDispatch } from "@/lib/redux/hooks";
import { loadConversation } from "@/features/agents/redux/execution-system/thunks/load-conversation.thunk";
import type { ConversationBattleFork } from "../types";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

interface ConversationBattleColumnProps {
  fork: ConversationBattleFork;
  onRemove: (fork: ConversationBattleFork) => void;
}

export function ConversationBattleColumn({
  fork,
  onRemove,
}: ConversationBattleColumnProps) {
  const dispatch = useAppDispatch();
  const [loadError, setLoadError] = useState(fork.loadError ?? null);
  const [isRetrying, setIsRetrying] = useState(false);

  const retryLoad = async () => {
    setIsRetrying(true);
    try {
      await dispatch(
        loadConversation({
          conversationId: fork.conversationId,
          expectMaterialized: true,
        }),
      ).unwrap();
      setLoadError(null);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : String(error));
    } finally {
      setIsRetrying(false);
    }
  };

  return (
    <div className="h-full min-h-0 min-w-0 bg-background flex flex-col">
      <div className="h-10 shrink-0 flex items-center gap-2 border-b border-border bg-card px-2">
        <MessagesSquare className="size-3.5 text-primary shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="truncate text-xs font-semibold">{fork.label}</div>
          <div className="truncate text-[10px] text-muted-foreground">
            Independent fork
          </div>
        </div>
        <EntityDoorControls
          token="conversation"
          id={fork.conversationId}
          name={fork.label}
          className="shrink-0"
        />
        <button
          type="button"
          onClick={() => onRemove(fork)}
          title="Remove this fork from the battle (the chat stays in history)"
          className="p-1 rounded text-muted-foreground hover:text-destructive hover:bg-destructive/10"
        >
          <X className="size-3.5" />
        </button>
      </div>
      <div className="flex-1 min-h-0 overflow-hidden">
        {loadError ? (
          <div className="h-full flex items-center justify-center p-6 text-center">
            <div className="max-w-sm space-y-3">
              <AlertTriangle className="mx-auto size-6 text-amber-500" />
              <div>
                <div className="text-sm font-semibold">Fork created</div>
                <p className="mt-1 text-xs text-muted-foreground">
                  The durable chat exists, but its conversation bundle could not
                  be loaded into this column yet.
                </p>
              </div>
              <button
                type="button"
                onClick={() => void retryLoad()}
                disabled={isRetrying}
                className="inline-flex h-8 items-center gap-2 rounded-md bg-primary px-3 text-xs font-medium text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
              >
                {isRetrying ? (
                  <Loader2 className="size-3.5 animate-spin" />
                ) : (
                  <RefreshCw className="size-3.5" />
                )}
                Retry loading
              </button>
              <p className="text-[10px] text-muted-foreground break-words">
                {loadError}
                <ErrorAlchemyMenu error={loadError} />
              </p>
            </div>
          </div>
        ) : (
          <BoundColumn
            conversationId={fork.conversationId}
            surfaceKey="agent-comparison-conversation"
          />
        )}
      </div>
    </div>
  );
}
