"use client";

/**
 * ShortcutEditorWindow — THE shortcut editor (`ShortcutEditorNext`) in a
 * window, so saving a shortcut never takes a person off the page they are
 * working on. A new draft may start from a seed (`draft-seed.ts`) — e.g. the
 * mapping of a Custom Agent run.
 */

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import { extractErrorMessage } from "@/utils/errors";
import { WindowPanel } from "@/features/window-panels/WindowPanel";
import { ShortcutEditorNext } from "@/features/agent-shortcuts/components/next/ShortcutEditorNext";
import { fetchFullAgent } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentById } from "@/features/agents/redux/agent-definition/selectors";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface ShortcutEditorWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  agentId: string | null;
  /** "new" or an existing shortcut id. */
  shortcutId: string;
  seedId: string | null;
}

export default function ShortcutEditorWindow({
  isOpen,
  onClose,
  instanceId,
  agentId,
  shortcutId,
  seedId,
}: ShortcutEditorWindowProps) {
  const dispatch = useAppDispatch();
  const agent = useAppSelector((s) =>
    agentId ? selectAgentById(s, agentId) : undefined,
  );
  const [loadError, setLoadError] = useState<string | null>(null);
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    if (!agentId) return undefined;
    let cancelled = false;
    setLoadError(null);
    dispatch(fetchFullAgent(agentId))
      .unwrap()
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(extractErrorMessage(err));
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, attempt, dispatch]);

  if (!isOpen) return null;

  return (
    <WindowPanel
      id={`shortcut-editor-${instanceId}`}
      overlayId="shortcutEditorWindow"
      title={shortcutId === "new" ? "New Shortcut" : "Edit Shortcut"}
      onClose={onClose}
      position="center"
      width={760}
      height="80dvh"
      minWidth={420}
      minHeight={420}
      bodyClassName="flex min-h-0 flex-1 flex-col overflow-hidden p-0"
    >
      {loadError ? (
        <div className="flex items-center gap-3 p-4 text-sm">
          <span className="text-destructive">
            {loadError}
            <ErrorAlchemyMenu error={loadError} />
          </span>
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAttempt((n) => n + 1)}
          >
            Try again
          </Button>
        </div>
      ) : agent ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <ShortcutEditorNext
            agent={agent}
            shortcutId={shortcutId}
            seedId={seedId}
            embedded
            onSaved={onClose}
            onCancel={onClose}
          />
        </div>
      ) : (
        <div className="flex flex-1 justify-center py-10">
          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
        </div>
      )}
    </WindowPanel>
  );
}
