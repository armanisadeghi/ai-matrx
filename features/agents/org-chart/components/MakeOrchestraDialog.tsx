// features/agents/org-chart/components/MakeOrchestraDialog.tsx
//
// The two ways to make an Orchestra from the chart (common-docs/systems/agents/
// org-chart/VISION.md rule 1):
//   • from agents — they become the members of a new Conductor, which takes
//     their place under whatever they sat under;
//   • from a box (a person or a position) — a new Conductor sits under it with
//     no members yet: the leader first, the team filled later by dragging
//     agents onto it.
// Composes the Orchestra primitives only: `useCreateConductor` (template copy +
// name + marker), `addAgentToOrchestra`, `syncConductorPrompt` (its prompt
// learns its members), and the chart's recorded placement.

"use client";

import { useState } from "react";
import { Network } from "lucide-react";
import { Button, Field } from "@ai-matrx/design-system/controls";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useCreateConductor } from "@/features/agents/orchestras/conductor/useCreateConductor";
import { syncConductorPrompt } from "@/features/agents/orchestras/conductor/thunks";
import { addAgentToOrchestra } from "@/features/agents/redux/orchestras/thunks";
import { removeManualManager, setManualManager } from "@/features/agents/redux/orchestras/orgChartThunks";
import { DEFAULT_ORCHESTRA_ACCENT } from "@/features/agents/orchestras/constants";
import { boxId } from "../constants";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
export interface MakeOrchestraRequest {
  /** Agent ids that become its members (form A). Empty for a leader-first team (form B). */
  memberIds: string[];
  /** The box the new Conductor sits under (box id), if any. */
  underBoxId: string | null;
  /** Recorded placements the members leave, because the Conductor now holds them. */
  leaving: Array<{ managerId: string; reportId: string }>;
  /** Suggested name. */
  suggestedName: string;
  /** Names for the sentence that says what will happen. */
  underName: string | null;
}

export function MakeOrchestraDialog({
  request,
  onClose,
  onMade,
}: {
  request: MakeOrchestraRequest | null;
  onClose: () => void;
  onMade: (conductorId: string, warnings: string[]) => void;
}) {
  return (
    <Dialog open={request !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {request && <Body key={request.suggestedName + request.memberIds.join()} request={request} onMade={onMade} onClose={onClose} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  request,
  onClose,
  onMade,
}: {
  request: MakeOrchestraRequest;
  onClose: () => void;
  onMade: (conductorId: string, warnings: string[]) => void;
}) {
  const dispatch = useAppDispatch();
  const { create, error: createError } = useCreateConductor();
  const [name, setName] = useState(request.suggestedName);
  const [step, setStep] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Made, with problems: they stay on screen until read (never a toast that vanishes). */
  const [made, setMade] = useState<{ conductorId: string; warnings: string[] } | null>(null);
  const n = request.memberIds.length;

  const make = async () => {
    setError(null);
    setStep("Creating the leader…");
    const conductorId = await create({ name: name.trim() || request.suggestedName, accent: DEFAULT_ORCHESTRA_ACCENT });
    if (!conductorId) {
      setStep(null);
      setError("The leader could not be created."); // the hook's own reason shows beside it
      return;
    }
    const warnings: string[] = [];
    if (n > 0) {
      setStep(`Adding ${n} ${n === 1 ? "agent" : "agents"}…`);
      for (const agentId of request.memberIds) {
        const res = await dispatch(addAgentToOrchestra({ conductorId, agentId }));
        if (!res.ok) warnings.push(res.error ?? "An agent could not be added.");
      }
    }
    if (request.underBoxId) {
      setStep("Placing it on the chart…");
      const placed = await dispatch(setManualManager(request.underBoxId, boxId("agent", conductorId)));
      if (!placed.ok) warnings.push(placed.error ?? "It could not be placed on the chart.");
    }
    for (const l of request.leaving) {
      const res = await dispatch(removeManualManager(l.managerId, l.reportId));
      if (!res.ok) warnings.push(res.error ?? "An old placement could not be removed.");
    }
    if (n > 0) {
      setStep("Teaching the leader its team…");
      const sync = await dispatch(syncConductorPrompt({ conductorId, memberIds: request.memberIds }));
      if (!sync.ok) warnings.push(`Its prompt still needs its team: ${sync.error ?? "sync failed"}. Use Sync agent listings in the Orchestra.`);
    }
    setStep(null);
    if (warnings.length) setMade({ conductorId, warnings });
    else onMade(conductorId, []);
  };

  if (made) {
    return (
      <>
        <DialogHeader>
          <DialogTitle>Made, with {made.warnings.length === 1 ? "a problem" : "problems"}</DialogTitle>
          <DialogDescription>The leader exists. These steps did not finish:</DialogDescription>
        </DialogHeader>
        <ul className="flex list-disc flex-col gap-1 pl-5 type-secondary text-destructive">
          {made.warnings.map((w, i) => (
            <li key={i}>{w}</li>
          ))}
        </ul>
        <div className="flex justify-end">
          <Button variant="primary" onClick={() => onMade(made.conductorId, made.warnings)}>
            Show it on the chart
          </Button>
        </div>
      </>
    );
  }

  return (
    <>
      <DialogHeader>
        <DialogTitle className="flex items-center"><span className="flex items-center gap-2">
          <Network className="h-4 w-4" />
          {n > 0 ? `Make an Orchestra of ${n}` : "Add a leader agent"}
        </span></DialogTitle>
        <DialogDescription>
          {n > 0
            ? `A new Conductor directs ${n === 1 ? "this agent" : `these ${n} agents`}${request.underName ? ` under ${request.underName}` : ""}.`
            : `A new Conductor sits under ${request.underName ?? "this box"}. Drag agents onto it to build its team.`}
        </DialogDescription>
      </DialogHeader>
      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="type-secondary font-medium text-foreground">Leader&apos;s name</span>
          <Field value={name} onChange={(e) => setName(e.target.value)} disabled={step !== null} />
        </label>
        {step && <p className="type-secondary text-muted-foreground">{step}</p>}
        {error && (
          <p className="type-secondary text-destructive">
            {error}
            {createError ? ` ${createError}` : ""}
          <ErrorAlchemyMenu error={error} /></p>
        )}
        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose} disabled={step !== null}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void make()} disabled={step !== null || !name.trim()}>
            {n > 0 ? "Make Orchestra" : "Add leader"}
          </Button>
        </div>
      </div>
    </>
  );
}
