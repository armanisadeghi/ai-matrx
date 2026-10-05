// features/agents/org-chart/components/DefineSeatJobDialog.tsx
//
// Rung 2 of the open-position ladder (common-docs/systems/agents/org-chart/VISION.md):
// a noted seat gets what it is given, what it hands back and its goal — and with
// those three it becomes a Mandate, recorded in the database and linked to the
// seat. Everything after (goal writer, building the agent, testing) happens in
// the mandate's own window, opened in place.
//
// The mandate is an ORGANIZATION soft mandate homed in the seat's organization
// (`createSoftMandate`, the one door). Its key is made from the seat's name, as
// the mandate pages make it, and the next number is tried when it is taken.

"use client";

import { useState } from "react";
import { Plus, X } from "lucide-react";
import { Button, Field, Textarea } from "@ai-matrx/design-system/controls";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createSoftMandate } from "@/features/mandates/authoring-level/service";
import { keyFromName, softMandateNamespace } from "@/features/mandates/authoring-level/soft-key";
import { BackendApiError } from "@/lib/api/errors";
import { isOrganizationSelectionCancelled } from "@/lib/organization/selection-cancelled";
import { updateOrgPosition, loadSeatJobs } from "@/features/agents/redux/orchestras/orgChartThunks";
import type { OrgPosition } from "../positionsService";

export interface DefinedSeatJob {
  mandateKey: string;
  mandateId: string;
}

export function DefineSeatJobDialog({
  position,
  onClose,
  onDefined,
}: {
  position: OrgPosition | null;
  onClose: () => void;
  onDefined: (job: DefinedSeatJob) => void;
}) {
  return (
    <Dialog open={position !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-lg">
        {position && <Body key={position.id} position={position} onClose={onClose} onDefined={onDefined} />}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  position,
  onClose,
  onDefined,
}: {
  position: OrgPosition;
  onClose: () => void;
  onDefined: (job: DefinedSeatJob) => void;
}) {
  const dispatch = useAppDispatch();
  const [goal, setGoal] = useState(position.description ?? "");
  const [inputs, setInputs] = useState<string[]>([""]);
  const [output, setOutput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const missing = [
    !inputs.some((i) => i.trim()) && "what it's given",
    !output.trim() && "what it hands back",
  ].filter(Boolean) as string[];

  const create = async () => {
    if (!goal.trim()) return;
    setSaving(true);
    setError(null);
    try {
      const namespace = softMandateNamespace("organization");
      let attempt = 1;
      let made: Awaited<ReturnType<typeof createSoftMandate>> | null = null;
      while (!made) {
        try {
          made = await createSoftMandate(dispatch, {
            level: "organization",
            organizationId: position.organizationId,
            mandateKey: keyFromName(position.name, attempt, namespace),
            label: position.name,
            goal: goal.trim(),
            description: position.description ?? undefined,
            outputConstraints: output.trim() || undefined,
            draftInputs: inputs.filter((i) => i.trim()).map((description) => ({ description })),
          });
        } catch (e) {
          // A made key can belong to a job this person cannot see: try the next number.
          if (!(e instanceof BackendApiError && e.status === 409) || attempt >= 50) throw e;
          attempt += 1;
        }
      }
      const linked = await dispatch(updateOrgPosition(position.id, { mandateId: made.mandateId }));
      if (!linked.ok) throw new Error(`The job was created, but the position could not be linked to it: ${linked.error}`);
      await dispatch(loadSeatJobs([made.mandateId]));
      onDefined({ mandateKey: made.mandateKey, mandateId: made.mandateId });
    } catch (e) {
      if (isOrganizationSelectionCancelled(e)) return;
      setError(e instanceof Error ? e.message : "The job could not be created.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>Define the job: {position.name}</DialogTitle>
        <DialogDescription>Its inputs, output and goal make it a job an agent can do.</DialogDescription>
      </DialogHeader>

      <div className="flex flex-col gap-4">
        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">Goal</span>
          <Textarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What this seat is for, and what a great result looks like"
            rows={3}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">What it&apos;s given</span>
          {inputs.map((value, i) => (
            <div key={i} className="flex items-center gap-1.5">
              <Field
                value={value}
                onChange={(e) => setInputs((cur) => cur.map((v, j) => (j === i ? e.target.value : v)))}
                placeholder={i === 0 ? "e.g. the client's website address" : "Another input"}
                aria-label={`Input ${i + 1}`}
                className="flex-1"
              />
              {inputs.length > 1 && (
                <Button
                  variant="quiet"
                  icon={<X />}
                  aria-label={`Remove input ${i + 1}`}
                  onClick={() => setInputs((cur) => cur.filter((_, j) => j !== i))}
                />
              )}
            </div>
          ))}
          <div>
            <Button variant="quiet" icon={<Plus />} onClick={() => setInputs((cur) => [...cur, ""])}>
              Add input
            </Button>
          </div>
        </div>

        <label className="flex flex-col gap-1.5">
          <span className="text-xs font-medium text-foreground">What it hands back</span>
          <Field
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="e.g. a one-page SEO audit with the top 5 fixes"
          />
        </label>

        {missing.length > 0 && goal.trim() && (
          <p className="text-xs text-muted-foreground">You can add {missing.join(" and ")} later.</p>
        )}
        {error && <p className="text-xs text-destructive">{error}</p>}

        <div className="flex justify-end gap-2">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!goal.trim() || saving} onClick={() => void create()}>
            {saving ? "Creating…" : "Create job"}
          </Button>
        </div>
      </div>
    </>
  );
}
