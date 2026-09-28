"use client";

/**
 * CustomAgentWindow — "Custom agent…" from the right-click menu (and the ⋯ menu).
 *
 * One window, two steps:
 *   1. THE agent picker (`AgentPickerFrame` → `AgentListPanel`).
 *   2. Map inputs: every input the agent has (the message, then each variable)
 *      against a dropdown of what the menu captured — selected text, the whole
 *      content, the text around it, every surface value — default "Skip".
 * Open launches the agent in its own window (a new one every time, so several
 * can work on the same text at once) with the mapped inputs filled and the
 * whole captured scope as context. Nothing is sent until the person sends.
 * When the text can be saved back, the new conversation is bound to it and
 * each answer offers "Apply to source" (review/applyTargets).
 */

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowLeft, BookmarkPlus, Loader2 } from "lucide-react";
import { useAgentCatalogRows } from "@ai-matrx/agents/catalog/react";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import { selectAgentVariableDefinitions } from "@/features/agents/redux/agent-definition/selectors";
import { AgentPickerFrame } from "@/features/window-panels/windows/agents/AgentPickerWindow";
import { bindConversationToApplyTarget } from "@/features/rich-document/review/applyTargets";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import {
  SKIP,
  buildInputRows,
  buildMappedRuntime,
} from "./custom-agent-plan";
import { getCustomAgentSession, releaseCustomAgentSession } from "./session";
import { putShortcutDraftSeed } from "@/features/agent-shortcuts/draft-seed";
import { getSurfaceRuntime } from "@/features/surfaces/runtime/SurfaceRuntimeContext";

export interface CustomAgentWindowProps {
  isOpen: boolean;
  onClose: () => void;
  instanceId: string;
  /** From overlay data — the captured values (session.ts). */
  sessionId: string | null;
}

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export default function CustomAgentWindow({
  isOpen,
  onClose,
  instanceId,
  sessionId,
}: CustomAgentWindowProps) {
  const dispatch = useAppDispatch();
  const { launchAgent } = useAgentLauncher();
  const router = useRouter();
  const [isNavigating, startNavigation] = useTransition();
  const session = getCustomAgentSession(sessionId);
  const [agentId, setAgentId] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [mapping, setMapping] = useState<Record<string, string>>({});
  const [isOpening, setIsOpening] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const agentRow = useAgentCatalogRows().find((row) => row.id === agentId);
  const variables = useAppSelector((s) =>
    agentId ? selectAgentVariableDefinitions(s, agentId) : null,
  );

  useEffect(() => {
    if (!agentId) return undefined;
    let cancelled = false;
    setLoad({ status: "loading" });
    setMapping({});
    dispatch(fetchAgentExecutionMinimal(agentId))
      .unwrap()
      .then(() => {
        if (!cancelled) setLoad({ status: "ready" });
      })
      .catch((err: unknown) => {
        if (!cancelled)
          setLoad({ status: "error", message: extractErrorMessage(err) });
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, attempt, dispatch]);

  if (!isOpen) return null;

  // The captured values belong to this open only; release them on close.
  const close = () => {
    releaseCustomAgentSession(sessionId);
    onClose();
  };

  const sources = session?.sources ?? [];
  const rows = buildInputRows(variables);
  const agentName = agentRow?.name?.trim() || "Agent";

  const handleOpen = async () => {
    if (!agentId) return;
    setIsOpening(true);
    try {
      const result = await launchAgent(agentId, {
        // A fresh surface key per open: every window is its own conversation.
        surfaceKey: `custom-agent:${instanceId}:${Date.now()}`,
        sourceFeature: "agent-runner",
        config: {
          displayMode: "floating-chat",
          autoRun: false,
          allowChat: true,
        },
        runtime: buildMappedRuntime(mapping, sources, rows, session?.scope),
      });
      if (session?.applyTargetId) {
        bindConversationToApplyTarget(result.conversationId, session.applyTargetId);
      }
      close();
    } catch (err) {
      toast.error(`Couldn't open ${agentName}`, {
        description: extractErrorMessage(err),
      });
    } finally {
      setIsOpening(false);
    }
  };

  // The same mapping, saved: the ONE shortcut editor opens with it filled in,
  // bound to the page it was captured on.
  const handleSaveAsShortcut = () => {
    if (!agentId) return;
    const runtime = buildMappedRuntime(mapping, sources, rows, session?.scope);
    // The page the text was captured on: the scope's own name when it carries
    // one, else the surface mounted under it (the same lookup a launch uses).
    const scoped = session?.scope?.surface_name;
    const surfaceName =
      typeof scoped === "string" && scoped
        ? scoped
        : (getSurfaceRuntime()?.surfaceName ?? null);
    const seedId = putShortcutDraftSeed({
      surfaceName,
      valueMappings: runtime.valueMappings ?? {},
      displayMode: "floating-chat",
      allowChat: true,
      autoRun: false,
    });
    startNavigation(() => {
      // agent-link-ok: the shortcut editor lives under the user-shell agent route
      router.push(`/agents/${agentId}/shortcuts/new?seed=${seedId}`);
    });
    close();
  };

  return (
    <AgentPickerFrame
      id={`custom-agent-${instanceId}`}
      overlayId="customAgentWindow"
      title={agentId ? "Map Inputs" : "Select Agent"}
      onClose={close}
      onSelect={setAgentId}
      consumerId="custom-agent-picker"
      {...(agentId
        ? {
            footerLeft: (
              <>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setAgentId(null)}
                  disabled={isOpening}
                >
                  <ArrowLeft className="mr-1 h-4 w-4" />
                  Back
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleSaveAsShortcut}
                  disabled={load.status !== "ready" || isNavigating}
                >
                  <BookmarkPlus className="mr-1 h-4 w-4" />
                  Save as shortcut
                </Button>
              </>
            ),
            footerRight: (
              <>
                <Button variant="outline" size="sm" onClick={close}>
                  Cancel
                </Button>
                <Button
                  size="sm"
                  onClick={handleOpen}
                  disabled={load.status !== "ready" || isOpening}
                >
                  {isOpening ? (
                    <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                  ) : null}
                  Open
                </Button>
              </>
            ),
          }
        : {})}
    >
      {agentId ? (
        <div className="flex h-full min-h-0 w-full min-w-0 flex-col">
          <div className="flex min-w-0 shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-xs">
            <span className="truncate font-medium">{agentName}</span>
            {session?.sourceTitle ? (
              <>
                <span className="shrink-0 text-muted-foreground">·</span>
                <span className="min-w-0 truncate text-muted-foreground">
                  {session.sourceTitle}
                </span>
              </>
            ) : null}
          </div>

          <div className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden px-4 py-3">
            {load.status === "loading" ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
              </div>
            ) : load.status === "error" ? (
              <div className="flex items-center gap-3 py-4 text-sm">
                <span className="text-destructive">
                  {load.message}
                  <ErrorAlchemyMenu error={load.message} />
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  onClick={() => setAttempt((n) => n + 1)}
                >
                  Try again
                </Button>
              </div>
            ) : (
              <div className="flex min-w-0 flex-col gap-1.5">
                {rows.map((row) => {
                  const disabled = Boolean(row.disabledReason);
                  return (
                    <div
                      key={row.id}
                      className={cn(
                        "flex min-w-0 items-center gap-3 rounded-md border border-border px-3 py-2",
                        disabled && "opacity-60",
                      )}
                    >
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-baseline gap-x-2 text-sm font-medium">
                          <span>{row.label}</span>
                          {row.disabledReason ? (
                            <span className="text-xs font-normal text-muted-foreground">
                              {row.disabledReason}
                            </span>
                          ) : null}
                        </div>
                        {row.description ? (
                          <div className="break-words text-xs text-muted-foreground">
                            {row.description}
                          </div>
                        ) : null}
                      </div>
                      <Select
                        value={mapping[row.id] ?? SKIP}
                        onValueChange={(value) =>
                          setMapping((m) => ({ ...m, [row.id]: value }))
                        }
                        disabled={disabled}
                      >
                        <SelectTrigger className="h-8 w-44 shrink-0 text-xs">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value={SKIP}>Skip</SelectItem>
                          {sources.map((source) => (
                            <SelectItem key={source.id} value={source.id}>
                              {source.label}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      ) : null}
    </AgentPickerFrame>
  );
}
