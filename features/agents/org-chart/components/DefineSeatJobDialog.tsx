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
import { Plus, Wand2, X } from "lucide-react";
import { useHeadlessAgentJson } from "@ai-matrx/chat/agents/hooks/useHeadlessAgentJson";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";
import { MANDATE_KEYS, type AnyMandateKey } from "@ai-matrx/agents/mandates";
import { Button, Field } from "@ai-matrx/design-system/controls";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { useAppDispatch } from "@/lib/redux/hooks";
import { createSoftMandate } from "@/features/mandates/authoring-level/service";
import { keyFromName, softMandateNamespace } from "@/features/mandates/authoring-level/soft-key";
import { BackendApiError } from "@/lib/api/errors";
import { updateOrgPosition, loadSeatJobs } from "@/features/agents/redux/orchestras/orgChartThunks";
import type { OrgPosition } from "../positionsService";

import { ProTextarea } from "@/components/official/ProTextarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
/** What the chart knows around the seat, for the suggester. */
export interface SeatContext {
  /** The box above: its name and kind ("Head of Marketing (Agent)"). */
  reportsTo: string | null;
  /** The boxes beside it. */
  team: string[];
}

const SUGGESTER = MANDATE_KEYS.org_chart__seat_job_suggester;
const SUGGESTER_DISCLOSURE = [{ mandateKey: SUGGESTER, does: "suggests a position's goal, inputs and output" }] as const;

interface SeatJobSuggestion {
  goal?: string;
  inputs?: Array<{ name?: string; description?: string; required?: boolean }>;
  output?: string;
  questions?: string[];
}

export interface DefinedSeatJob {
  mandateKey: AnyMandateKey;
  mandateId: string;
}

export function DefineSeatJobDialog({
  position,
  context,
  onClose,
  onDefined,
}: {
  position: OrgPosition | null;
  context?: SeatContext;
  onClose: () => void;
  onDefined: (job: DefinedSeatJob) => void;
}) {
  return (
    <Dialog open={position !== null} onOpenChange={(open) => !open && onClose()}>
      <DialogContent>
        {position && (
          <Body key={position.id} position={position} context={context} onClose={onClose} onDefined={onDefined} />
        )}
      </DialogContent>
    </Dialog>
  );
}

function Body({
  position,
  context,
  onClose,
  onDefined,
}: {
  position: OrgPosition;
  context?: SeatContext;
  onClose: () => void;
  onDefined: (job: DefinedSeatJob) => void;
}) {
  const dispatch = useAppDispatch();
  const [goal, setGoal] = useState(position.description ?? "");
  const [inputs, setInputs] = useState<string[]>([""]);
  const [output, setOutput] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [questions, setQuestions] = useState<string[]>([]);
  const suggester = useHeadlessAgentJson();
  useDeclaredSurfaceMandates(SUGGESTER_DISCLOSURE);

  /** Ideas, never decisions: fills only what is still empty; what the person typed stays. */
  const suggest = async () => {
    setError(null);
    try {
      const s = await suggester.run<SeatJobSuggestion>({
        mandateKey: SUGGESTER,
        surfaceKey: `mandate:${SUGGESTER}`,
        sourceFeature: "agent-builder",
        expect: "json",
        initiation: "user",
        variables: {
          seat_name: position.name,
          ...(position.description?.trim() ? { seat_description: position.description.trim() } : {}),
          ...(context?.reportsTo ? { reports_to: context.reportsTo } : {}),
          ...(context?.team.length ? { team: context.team.join("\n") } : {}),
        },
      });
      if (s.goal && !goal.trim()) setGoal(s.goal);
      const suggestedInputs = (s.inputs ?? [])
        .map((i) => i.description?.trim())
        .filter((d): d is string => Boolean(d));
      if (suggestedInputs.length && !inputs.some((i) => i.trim())) setInputs(suggestedInputs);
      if (s.output && !output.trim()) setOutput(s.output);
      setQuestions(s.questions ?? []);
    } catch (e) {
      setError(e instanceof Error ? e.message : "No suggestion came back.");
    }
  };

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
        <div>
          <Button variant="outline" icon={<Wand2 />} disabled={suggester.isRunning || saving} onClick={() => void suggest()}>
            {suggester.isRunning ? "Suggesting…" : "Suggest"}
          </Button>
        </div>
        <label className="flex flex-col gap-1.5">
          <span className="type-secondary font-medium text-foreground">Goal</span>
          <ProTextarea
            value={goal}
            onChange={(e) => setGoal(e.target.value)}
            placeholder="What this seat is for, and what a great result looks like"
            rows={3}
          />
        </label>

        <div className="flex flex-col gap-1.5">
          <span className="type-secondary font-medium text-foreground">What it&apos;s given</span>
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
          <span className="type-secondary font-medium text-foreground">What it hands back</span>
          <Field
            value={output}
            onChange={(e) => setOutput(e.target.value)}
            placeholder="e.g. a one-page SEO audit with the top 5 fixes"
          />
        </label>

        {questions.length > 0 && (
          <div className="flex flex-col gap-1">
            <span className="type-secondary font-medium text-foreground">Worth deciding</span>
            <ul className="list-disc pl-5 type-secondary text-muted-foreground">
              {questions.map((q, i) => (
                <li key={i}>{q}</li>
              ))}
            </ul>
          </div>
        )}
        {missing.length > 0 && goal.trim() && (
          <p className="type-secondary text-muted-foreground">You can add {missing.join(" and ")} later.</p>
        )}
        {error && <p className="type-secondary text-destructive">{error}<ErrorAlchemyMenu error={error} /></p>}

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
