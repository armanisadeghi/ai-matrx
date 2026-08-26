"use client";

/**
 * AgentSampleStrip — "run it with sample data" in one click.
 *
 * Renders the agent's APPROVED test cases (agent.exemplar) as chips above a run
 * surface; clicking one prefills the instance's variable values + user input —
 * through the SAME slices the human's own typing uses, so nothing downstream
 * changes. A sample's user_input IS human-typed text (raw-values invariant),
 * so writing it into the composer is not a USER-INPUT-LAW violation.
 *
 * The "Test cases" button opens the full manager (browse, borrow from real
 * runs, approve, prune). The strip renders nothing while the agent has no
 * samples and the host did not ask for the manage affordance.
 */

import { useCallback, useEffect, useState } from "react";
import { FlaskConical, Loader2 } from "lucide-react";
import { useAppDispatch } from "@/lib/redux/hooks";
import { Button } from "@/components/ui/button";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import { toast } from "@/lib/toast";
import { setUserVariableValues } from "@/features/agents/redux/execution-system/instance-variable-values/instance-variable-values.slice";
import { setUserInputText } from "@/features/agents/redux/execution-system/instance-user-input/instance-user-input.slice";
import {
  fetchAgentSamples,
  type AgentSampleRow,
} from "@/features/agents/samples/service";
import { AgentSamplesManager } from "./AgentSamplesManager";
import { isJsonObject } from "@/types/json";

export interface AgentSampleStripProps {
  agentId: string;
  /** The live instance the chips prefill. */
  conversationId: string;
  /** Show the "Test cases" manage button (builder: yes; runner: yes). */
  showManage?: boolean;
}

export function AgentSampleStrip({
  agentId,
  conversationId,
  showManage = true,
}: AgentSampleStripProps) {
  const dispatch = useAppDispatch();
  const [approved, setApproved] = useState<AgentSampleRow[] | null>(null);
  const [manageOpen, setManageOpen] = useState(false);

  const reload = useCallback(async () => {
    try {
      const rows = await fetchAgentSamples(agentId);
      setApproved(rows.filter((row) => row.status === "approved"));
    } catch {
      // A run surface must never break because samples failed to load; the
      // manager surfaces load errors loudly when opened.
      setApproved([]);
    }
  }, [agentId]);

  useEffect(() => {
    const timerId = window.setTimeout(() => {
      void reload();
    }, 0);
    return () => window.clearTimeout(timerId);
  }, [reload]);

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
      setManageOpen(false);
    },
    [conversationId, dispatch],
  );

  const hasChips = (approved?.length ?? 0) > 0;
  if (!hasChips && !showManage) return null;
  if (approved === null) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
      {hasChips ? (
        <span className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
          Samples
        </span>
      ) : null}
      {approved.map((sample) => (
        <Button
          key={sample.id}
          size="sm"
          variant="outline"
          className="h-6 rounded-full px-2.5 text-xs"
          title={sample.user_input ?? undefined}
          onClick={() => applySample(sample)}
        >
          {sample.label}
        </Button>
      ))}
      {showManage ? (
        <Button
          size="sm"
          variant="ghost"
          className="h-6 px-2 text-xs text-muted-foreground"
          onClick={() => setManageOpen(true)}
        >
          <FlaskConical className="mr-1 h-3.5 w-3.5" />
          Test cases
        </Button>
      ) : null}
      <Sheet
        open={manageOpen}
        onOpenChange={(open) => {
          setManageOpen(open);
          if (!open) void reload();
        }}
      >
        <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-lg">
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
