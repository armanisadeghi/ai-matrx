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
import {
  Drawer,
  DrawerBody,
  DrawerContent,
  DrawerDescription,
  DrawerFooter,
  DrawerHeader,
  DrawerTitle,
} from "@/components/ui/drawer";
import { Button } from "@/components/ui/button";
import { useIsMobile } from "@/hooks/use-mobile";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";
import { extractErrorMessage } from "@/utils/errors";
import { fetchAgentExecutionMinimal } from "@/features/agents/redux/agent-definition/thunks";
import {
  selectAgentAutoContextDisabled,
  selectAgentContextPolicies,
  selectAgentVariableDefinitions,
} from "@/features/agents/redux/agent-definition/selectors";
import { launchAgentExecution } from "@/features/agents/redux/execution-system/thunks/launch-agent-execution.thunk";
import {
  IMPORTANT_CONTEXT_INLINE_CHARS,
  buildDestinationOptions,
  buildLaunchPlan,
  type SendToAgentDestinationOption,
} from "./send-to-agent-plan";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

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
  const isMobile = useIsMobile();
  const content = initialContent ?? "";
  const [agentId, setAgentId] = useState<string | null>(null);
  const [load, setLoad] = useState<LoadState>({ status: "loading" });
  /** null = the agent's first (default) destination. */
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isOpening, setIsOpening] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const agentRow = useAgentCatalogRows().find((row) => row.id === agentId);
  const variables = useAppSelector((s) =>
    agentId ? selectAgentVariableDefinitions(s, agentId) : null,
  );
  const contextSlots = useAppSelector((s) =>
    agentId ? selectAgentContextPolicies(s, agentId) : undefined,
  );
  const autoContextDisabled = useAppSelector((s) =>
    agentId ? selectAgentAutoContextDisabled(s, agentId) : false,
  );

  useEffect(() => {
    if (!agentId) return;
    let cancelled = false;
    setLoad({ status: "loading" });
    setSelectedId(null);
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
  const selected = options.find((o) => o.id === selectedId) ?? options[0];
  const agentName = agentRow?.name?.trim() || "this agent";
  const tooLongToInline =
    selected.destination.kind === "important-context" &&
    content.length > IMPORTANT_CONTEXT_INLINE_CHARS;

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

  const title = (
    <>
      <Forward className="h-4 w-4 text-primary" />
      {agentId ? `Send to ${agentName}` : "Send to another agent"}
    </>
  );
  const description = (
    <>
      {agentId
        ? "Choose where this goes. The agent opens with it in place — nothing is sent until you press send."
        : `Pick the agent that should work with ${
            initialSourceTitle?.trim()
              ? `"${initialSourceTitle.trim()}"`
              : "this response"
          } (${content.length.toLocaleString()} characters).`}
    </>
  );
  const body = (
    <>
      {!agentId ? (
        <div className="min-h-0 flex-1 overflow-hidden">
          <AgentListInlinePicker
            consumerId={PICKER_CONSUMER_ID}
            onSelect={setAgentId}
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
            <ErrorAlchemyMenu error={load.message} operation={`Read ${agentName}'s inputs`} />
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
                      {option.id === options[0].id ? (
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
          {autoContextDisabled ? (
            <p className="text-xs text-muted-foreground">
              {agentName} only accepts the inputs and context slots it declares,
              so &quot;Important context&quot; isn&apos;t offered.
            </p>
          ) : options.length === 2 ? (
            <p className="text-xs text-muted-foreground">
              {agentName} declares no inputs or context slots of its own.
            </p>
          ) : null}
        </RadioGroup>
      )}

      {tooLongToInline && agentId && load.status === "ready" ? (
        <p className="text-xs text-muted-foreground">
          At {content.length.toLocaleString()} characters this is longer than
          the {IMPORTANT_CONTEXT_INLINE_CHARS.toLocaleString()} that go straight
          into the prompt. It is still sent in full — the agent sees it listed
          and reads it when it needs it.
        </p>
      ) : null}
    </>
  );
  const backButton = agentId ? (
    <Button
      variant="ghost"
      size="sm"
      onClick={() => setAgentId(null)}
      disabled={isOpening}
    >
      <ArrowLeft className="mr-1 h-4 w-4" />
      Choose a different agent
    </Button>
  ) : null;
  const cancelButton = (
    <Button variant="outline" size="sm" onClick={onClose}>
      Cancel
    </Button>
  );
  const openButton = agentId ? (
    <Button
      size="sm"
      onClick={handleOpen}
      disabled={load.status !== "ready" || isOpening}
      className="min-w-0"
    >
      {isOpening ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : null}
      <span className="truncate">Open {agentName}</span>
    </Button>
  ) : null;

  if (isMobile) {
    return (
      <Drawer open={isOpen} onOpenChange={(open) => !open && onClose()}>
        <DrawerContent className="max-h-[90dvh]">
          <DrawerHeader className="text-left">
            <DrawerTitle className="flex items-center gap-2">
              {title}
            </DrawerTitle>
            <DrawerDescription>{description}</DrawerDescription>
          </DrawerHeader>
          <DrawerBody className="flex flex-col gap-3 px-4">{body}</DrawerBody>
          <DrawerFooter className="flex flex-col gap-2">
            {openButton}
            <div className="flex justify-between gap-2">
              {backButton ?? <span />}
              {cancelButton}
            </div>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex max-h-[85dvh] flex-col gap-3 sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter className="gap-2 sm:justify-between">
          {backButton ?? <span />}
          <div className="flex min-w-0 gap-2">
            {cancelButton}
            {openButton}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
