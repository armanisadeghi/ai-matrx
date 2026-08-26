"use client";

/**
 * AgentSamplesLauncher — ONE small floating icon that opens the agent's test
 * cases (agent.exemplar) in a sheet. Builder-only by Arman's ruling
 * (2026-08-26): the earlier full-width chip strip sat on top of the run
 * surfaces and was ripped out — samples must never add page chrome. Picking a
 * sample ("Use") prefills the test instance's variables + user input through
 * the SAME slices the human's own typing uses; the sample's user_input IS
 * human-typed text (raw-values invariant), so this is not a USER-INPUT-LAW
 * violation.
 */

import { useCallback, useState } from "react";
import { FlaskConical } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import type { AgentSampleRow } from "@/features/agents/samples/service";
import { AgentSamplesManager } from "./AgentSamplesManager";
import { isJsonObject } from "@/types/json";

export interface AgentSamplesLauncherProps {
  agentId: string;
  /** The live test instance a chosen sample prefills. */
  conversationId: string;
  /** Positioning classes from the host (e.g. "absolute top-2 right-2 z-10"). */
  className?: string;
}

export function AgentSamplesLauncher({
  agentId,
  conversationId,
  className,
}: AgentSamplesLauncherProps) {
  const dispatch = useAppDispatch();
  const [open, setOpen] = useState(false);

  const applySample = useCallback(
    (sample: AgentSampleRow) => {
      const values = isJsonObject(sample.variables) ? sample.variables : {};
      dispatch(setUserVariableValues({ conversationId, values }));
      dispatch(
        setUserInputText({
          conversationId,
          text: sample.user_input ?? "",
          userValues: values,
        }),
      );
      toast.success(`Sample “${sample.label}” loaded — press send to run it.`);
      setOpen(false);
    },
    [conversationId, dispatch],
  );

  return (
    <div className={cn(className)}>
      <Button
        size="icon"
        variant="ghost"
        className="h-7 w-7 text-muted-foreground hover:text-foreground"
        title="Test cases — run this agent with saved sample inputs"
        onClick={() => setOpen(true)}
      >
        <FlaskConical className="h-4 w-4" />
      </Button>
      <Sheet open={open} onOpenChange={setOpen}>
        <SheetContent
          side="right"
          className="w-full overflow-y-auto sm:max-w-lg"
        >
          <SheetHeader>
            <SheetTitle>Test cases</SheetTitle>
          </SheetHeader>
          <div className="mt-4 px-1">
            <AgentSamplesManager agentId={agentId} onUseSample={applySample} />
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
