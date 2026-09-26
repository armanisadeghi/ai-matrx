"use client";

/**
 * SendToAgentDialog — "Send to another agent…" from a response's ⋯ menu.
 *
 *   1. Pick the agent with THE canonical picker (`AgentListInlinePicker`).
 *   2. The agent's declared variables and context slots are read and listed,
 *      beside "Important context" (the default) and "Your message"; the person
 *      decides where the content goes.
 *   3. The agent opens in a floating window with the content already placed
 *      and NOTHING sent — the person edits and submits as they wish.
 *
 * Opened only through the `sendToAgentDialog` overlay
 * (`features/overlays/openers/sendToAgentDialog.tsx`).
 */

import { useEffect, useState } from "react";
import { ArrowLeft, Forward, Loader2 } from "lucide-react";
import {
  AgentListInlinePicker,
  useAgentCatalogRows,
} from "@ai-matrx/agents/catalog/react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentContextPolicies,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  DEFAULT_DESTINATION_ID,
  IMPORTANT_CONTEXT_INLINE_CHARS,
  buildDestinationOptions,
  buildLaunchPlan,
  type SendToAgentDestinationOption,
} from "./send-to-agent-plan";

export interface SendToAgentDialogProps {
  isOpen: boolean;
  onClose: () => void;
  /** The response text being sent on. */
  initialContent?: string | null;
  /** Where it came from — shown so the person knows what they are sending. */
  initialSourceTitle?: string | null;
  /** The source conversation's organization — the run files under the same one. */
  initialOrganizationId?: string | null;
}

const PICKER_CONSUMER_ID = "send-to-agent-picker";

const GROUP_LABELS: Record<SendToAgentDestinationOption["group"], string> = {
  general: "Send it as",
  variables: "This agent's inputs",
  context: "This agent's context slots",
};

type LoadState =
  | { status: "loading" }
  | { status: "ready" }
  | { status: "error"; message: string };

export default function SendToAgentDialog({
  isOpen,
  onClose,
  initialContent,
  initialSourceTitle,
  initialOrganizationId,
}: SendToAgentDialogProps) {
  const dispatch = useAppDispatch();
  const content = initialContent ?? "";
  const [agentId, setAgentId] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  const [selectedId, setSelectedId] = useState(DEFAULT_DESTINATION_ID);
  const [isOpening, setIsOpening] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const agentRow = useAgentCatalogRows().find((row) => row.id === agentId);
  const variables = useAppSelector((s) =>
    agentId ? selectAgentVariableDefinitions(s, agentId) : null,
  );
  const contextSlots = useAppSelector((s) =>
    agentId ? selectAgentContextPolicies(s, agentId) : undefined,
  );

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    setSelectedId(DEFAULT_DESTINATION_ID);
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

  const options = buildDestinationOptions(variables, contextSlots);
  const selected =
    options.find((o) => o.id === selectedId) ?? options[0];
  const agentName = agentRow?.name?.trim() || "this agent";
  const tooLongToInline =
    selected.destination.kind === "important-context" &&
    content.length > IMPORTANT_CONTEXT_INLINE_CHARS;

  const handlePick = (id: string) => {
    if (id.startsWith("mandate:")) {
      toast.error("Pick a specific agent", {
        description: "This list entry is a job, not an agent you can send to.",
      });
      return;
    }
    setAgentId(id);
  };

  const handleOpen = async () => {
    if (!agentId) return;
    setIsOpening(true);
    const plan = buildLaunchPlan(selected.destination, content);
    try {
      await dispatch(
        launchAgentExecution({
          agentId,
          surfaceKey: `send-to-agent:${agentId}`,
          sourceFeature: "agent-runner",
          ...(initialOrganizationId
            ? { organizationId: initialOrganizationId }
            : {}),
          config: {
            displayMode: "floating-chat",
            autoRun: false,
            allowChat: true,
            ...(plan.showVariablePanel ? { showVariablePanel: true } : {}),
          },
          runtime: plan.runtime,
        }),
      ).unwrap();
      onClose();
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
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Forward className="h-4 w-4 text-primary" />
            {agentId ? `Send to ${agentName}` : "Send to another agent"}
          </DialogTitle>
          <DialogDescription>
            {agentId
              ? "Choose where this goes. The agent opens with it in place — nothing is sent until you press send."
              : `Pick the agent that should work with ${
                  initialSourceTitle?.trim()
                    ? `"${initialSourceTitle.trim()}"`
                    : "this response"
                } (${content.length.toLocaleString()} characters).`}
          </DialogDescription>
        </DialogHeader>

        {!agentId ? (
          <div className="min-h-0 flex-1 overflow-hidden">
            <AgentListInlinePicker
              consumerId={PICKER_CONSUMER_ID}
              onSelect={handlePick}
              showPinnedAgent={false}
              className="h-full"
            />
          </div>
        ) : load.status === "loading" ? (
          <div className="flex items-center gap-2 py-8 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin" />
            Reading {agentName}&apos;s inputs and context slots…
          </div>
        ) : load.status === "error" ? (
          <div className="space-y-3 py-4 text-sm">
            <p className="text-destructive">
              Couldn&apos;t read {agentName}&apos;s inputs: {load.message}
            </p>
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
            value={selected.id}
            onValueChange={setSelectedId}
            className="min-h-0 flex-1 gap-4 overflow-y-auto pr-1"
          >
            {groups.map(({ group, items }) => (
              <div key={group} className="space-y-1.5">
                <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                  {GROUP_LABELS[group]}
                </div>
                {items.map((option) => (
                  <label
                    key={option.id}
                    htmlFor={`send-to-agent-${option.id}`}
                    className={cn(
                      "flex cursor-pointer items-start gap-3 rounded-md border border-border p-2.5 transition-colors hover:bg-accent/50",
                      option.id === selected.id && "border-primary bg-primary/5",
                    )}
                  >
                    <RadioGroupItem
                      id={`send-to-agent-${option.id}`}
                      value={option.id}
                      className="mt-0.5"
                    />
                    <span className="min-w-0 flex-1">
                      <span className="flex items-center gap-2 text-sm font-medium">
                        <span className="truncate">{option.label}</span>
                        {option.id === DEFAULT_DESTINATION_ID ? (
                          <span className="text-xs font-normal text-muted-foreground">
                            Default
                          </span>
                        ) : null}
                      </span>
                      <span className="block text-xs text-muted-foreground">
                        {option.description}
                      </span>
                    </span>
                  </label>
                ))}
              </div>
            ))}
            {options.length === 2 ? (
              <p className="text-xs text-muted-foreground">
                {agentName} declares no inputs or context slots of its own.
              </p>
            ) : null}
          </RadioGroup>
        )}

        {tooLongToInline && agentId && load.status === "ready" ? (
          <p className="text-xs text-muted-foreground">
            At {content.length.toLocaleString()} characters this is longer than
            the {IMPORTANT_CONTEXT_INLINE_CHARS.toLocaleString()} that go
            straight into the prompt. It is still sent in full — the agent sees
            it listed and reads it when it needs it.
          </p>
        ) : null}

        <DialogFooter className="gap-2 sm:justify-between">
          {agentId ? (
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setAgentId(null)}
              disabled={isOpening}
            >
              <ArrowLeft className="mr-1 h-4 w-4" />
              Choose a different agent
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={onClose}>
              Cancel
            </Button>
            {agentId ? (
              <Button
                size="sm"
                onClick={handleOpen}
                disabled={load.status !== "ready" || isOpening}
              >
                {isOpening ? (
                  <Loader2 className="mr-1 h-4 w-4 animate-spin" />
                ) : null}
                Open {agentName}
              </Button>
            ) : null}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
