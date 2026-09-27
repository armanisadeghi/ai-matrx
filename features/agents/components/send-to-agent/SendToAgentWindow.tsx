"use client";

/**
 * SendToAgentWindow — "Send to another agent…" from a response's ⋯ menu.
 *
 * One window, one size, two steps:
 *   1. THE agent picker (`AgentPickerFrame` → the package's `AgentListPanel`,
 *      the dropdown's exact list + peek).
 *   2. Where the content goes: "Important context" (default), "Your message",
 *      or one of the picked agent's own inputs / context slots — shown in the
 *      SAME frame at the SAME 680 × 528 footprint.
 * Then the agent opens through `useAgentLauncher` with the content in place
 * and nothing sent. The run is in the active organization like every run.
 */

import { useEffect, useState } from "react";
import { ArrowLeft, Loader2 } from "lucide-react";
import { useAgentCatalogRows } from "@ai-matrx/agents/catalog/react";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { useAgentLauncher } from "@/features/agents/hooks/useAgentLauncher";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentAutoContextDisabled,
  selectAgentContextPolicies,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import { AgentPickerFrame } from "@/features/window-panels/windows/agents/AgentPickerWindow";
import {
  IMPORTANT_CONTEXT_INLINE_CHARS,
  buildDestinationOptions,
  buildLaunchPlan,
  defaultDestination,
  type SendToAgentDestinationOption,
} from "./send-to-agent-plan";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

export interface SendToAgentWindowProps {
  isOpen: boolean;
  onClose: () => void;
  /** The text being sent on. */
  initialContent?: string | null;
  /** Where it came from — shown so the person knows what they are sending. */
  initialSourceTitle?: string | null;
}

const PICKER_CONSUMER_ID = "send-to-agent-picker";

const GROUP_LABELS: Record<SendToAgentDestinationOption["group"], string> = {
  general: "Send as",
  variables: "Variables",
  context: "Context slots",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export default function SendToAgentWindow({
  isOpen,
  onClose,
  initialContent,
  initialSourceTitle,
}: SendToAgentWindowProps) {
  const [agentId, setAgentId] = useState<string | null>(null);
  if (!isOpen) return null;

  return (
    <AgentPickerFrame
      id="send-to-agent"
      overlayId="sendToAgentWindow"
      title={agentId ? "Select Destination" : "Select Agent"}
      onClose={onClose}
      onSelect={setAgentId}
      consumerId={PICKER_CONSUMER_ID}
    >
      {agentId ? (
        <DestinationStep
          key={agentId}
          agentId={agentId}
          content={initialContent ?? ""}
          sourceTitle={initialSourceTitle?.trim() || null}
          onBack={() => setAgentId(null)}
          onCancel={onClose}
          onOpened={onClose}
        />
      ) : null}
    </AgentPickerFrame>
  );
}

function DestinationStep({
  agentId,
  content,
  sourceTitle,
  onBack,
  onCancel,
  onOpened,
}: {
  agentId: string;
  content: string;
  sourceTitle: string | null;
  onBack: () => void;
  onCancel: () => void;
  onOpened: () => void;
}) {
  const dispatch = useAppDispatch();
  const { launchAgent } = useAgentLauncher();
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  /** null = the agent's first (default) destination. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const agentRow = useAgentCatalogRows().find((row) => row.id === agentId);
  const variables = useAppSelector((s) =>
    selectAgentVariableDefinitions(s, agentId),
  );
  const contextSlots = useAppSelector((s) =>
    selectAgentContextPolicies(s, agentId),
  );
  const autoContextDisabled = useAppSelector((s) =>
    selectAgentAutoContextDisabled(s, agentId),
  );

  useEffect(() => {
    let cancelled = false;
    setLoad({ status: "loading" });
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

  const options = buildDestinationOptions(variables, contextSlots, {
    autoContextDisabled,
  });
  const selected =
    options.find((o) => o.id === selectedId && !o.disabledReason) ??
    defaultDestination(options) ??
    options[1];
  const agentName = agentRow?.name?.trim() || "Agent";
  const overInlineLimit = content.length > IMPORTANT_CONTEXT_INLINE_CHARS;

  const handleOpen = async () => {
    if (!selected) return;
    setIsOpening(true);
    const plan = buildLaunchPlan(selected.destination, content);
    try {
      await launchAgent(agentId, {
        surfaceKey: `send-to-agent:${agentId}`,
        sourceFeature: "agent-runner",
        config: {
          displayMode: "floating-chat",
          autoRun: false,
          allowChat: true,
          ...(plan.showVariablePanel ? { showVariablePanel: true } : {}),
        },
        runtime: plan.runtime,
      });
      onOpened();
    } catch (err) {
      toast.error(`Couldn't open ${agentName}`, {
        description: extractErrorMessage(err),
      });
    } finally {
      setIsOpening(false);
    }
  };

  const groups = (["general", "variables", "context"] as const)
    .map((group) => ({
      group,
      items: options.filter((o) => o.group === group),
    }))
    .filter((g) => g.items.length > 0);

  return (
    <>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-2 text-xs">
        <span className="truncate font-medium">{agentName}</span>
        <span className="shrink-0 text-muted-foreground">·</span>
        <span className="min-w-0 truncate text-muted-foreground">
          {sourceTitle ?? "Response"}
        </span>
        <span className="ml-auto shrink-0 tabular-nums text-muted-foreground">
          {content.length.toLocaleString()} characters
        </span>
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
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
          <RadioGroup
            value={selected?.id ?? ""}
            onValueChange={setSelectedId}
            className="gap-4"
          >
            {groups.map(({ group, items }) => (
              <div key={group} className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABELS[group]}
                </div>
                {items.map((option) => {
                  const disabled = Boolean(option.disabledReason);
                  const note =
                    option.disabledReason ??
                    (option.destination.kind === "important-context" &&
                    overInlineLimit
                      ? `Over ${IMPORTANT_CONTEXT_INLINE_CHARS.toLocaleString()} characters: sent as a reference`
                      : undefined);
                  return (
                    <label
                      key={option.id}
                      htmlFor={`send-to-agent-${option.id}`}
                      className={cn(
                        "flex items-start gap-3 rounded-md border border-border p-2.5 transition-colors",
                        disabled
                          ? "cursor-not-allowed opacity-60"
                          : "cursor-pointer hover:bg-accent/50",
                        option.id === selected?.id &&
                          "border-primary bg-primary/5",
                      )}
                    >
                      <RadioGroupItem
                        id={`send-to-agent-${option.id}`}
                        value={option.id}
                        disabled={disabled}
                        className="mt-0.5"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-2 text-sm font-medium">
                          <span className="truncate">{option.label}</span>
                          {note ? (
                            <span className="ml-auto shrink-0 text-xs font-normal text-muted-foreground">
                              {note}
                            </span>
                          ) : null}
                        </span>
                        {option.description ? (
                          <span className="block truncate text-xs text-muted-foreground">
                            {option.description}
                          </span>
                        ) : null}
                      </span>
                    </label>
                  );
                })}
              </div>
            ))}
          </RadioGroup>
        )}
      </div>

      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border px-4 py-2.5">
        <Button variant="ghost" size="sm" onClick={onBack} disabled={isOpening}>
          <ArrowLeft className="mr-1 h-4 w-4" />
          Back
        </Button>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={onCancel}>
            Cancel
          </Button>
          <Button
            size="sm"
            onClick={handleOpen}
            disabled={load.status !== "ready" || isOpening || !selected}
          >
            {isOpening ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
            Open
          </Button>
        </div>
      </div>
    </>
  );
}
