"use client";

/**
 * Start an Agent Factory build: pick the job (a Mandate), optionally lock the
 * model, start. The server answers 202 with a build id at once and runs the
 * build detached; the caller navigates to the live build view.
 *
 * A build runs ~5–15 minutes of model calls (Goal Writer, tools, instructions,
 * proof runs, judge) and saves one new agent into the organization the request
 * is made in — the dialog says so before the click (destructive-click law:
 * an expensive click states its consequence first).
 */

import { useEffect, useState } from "react";
import { Play } from "lucide-react";
import { Button } from "@ai-matrx/design-system/controls";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { OptionCombobox } from "@ai-matrx/design-system/controls";
import { ModelListDropdown } from "@ai-matrx/agents/models/react";
import { toast } from "@/lib/toast";
import { listFactoryMandates, startFactoryBuild, type FactoryMandateOption } from "../service";

interface StartBuildDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onStarted: (buildId: string) => void;
}

export function StartBuildDialog({ open, onOpenChange, onStarted }: StartBuildDialogProps) {
  const [mandates, setMandates] = useState<FactoryMandateOption[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mandateKey, setMandateKey] = useState("");
  const [modelId, setModelId] = useState<string | null>(null);
  const [starting, setStarting] = useState(false);

  useEffect(() => {
    if (!open || mandates) return;
    listFactoryMandates()
      .then(setMandates)
      .catch((e: unknown) => setLoadError(e instanceof Error ? e.message : "Could not load the jobs"));
  }, [open, mandates]);

  const byKey = new Map((mandates ?? []).map((m) => [m.key, m]));
  const withAgent = (mandates ?? []).filter((m) => m.hasHolder).map((m) => m.key);
  const withoutAgent = (mandates ?? []).filter((m) => !m.hasHolder).map((m) => m.key);

  const start = async () => {
    if (!mandateKey) return;
    setStarting(true);
    try {
      const buildId = await startFactoryBuild({ mandateKey, modelId });
      onOpenChange(false);
      onStarted(buildId);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "The build did not start");
    } finally {
      setStarting(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Start a build</DialogTitle>
          <DialogDescription>
            Builds and proves one new agent for the job. Takes several minutes of model calls.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <label className="flex flex-col gap-1">
            <span className="type-secondary font-medium text-muted-foreground">Job</span>
            <OptionCombobox
              value={mandateKey}
              onChange={setMandateKey}
              groups={[
                { heading: "Has an agent", options: withAgent },
                { heading: "No agent yet", options: withoutAgent, collapsed: true },
              ]}
              getLabel={(k) => k}
              getHint={(k) => byKey.get(k)?.label ?? null}
              placeholder={mandates ? "Choose a job…" : loadError ? "Could not load jobs" : "Loading jobs…"}
              searchPlaceholder="Search jobs…"
              disabled={!mandates}
              ariaLabel="Job"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="type-secondary font-medium text-muted-foreground">Model lock</span>
            <ModelListDropdown
              modelOnly
              value={modelId}
              onValueChange={setModelId}
              onClear={() => setModelId(null)}
              emptyOptionLabel="Factory chooses"
              placeholder="Factory chooses"
              inputModalities={["text"]}
              selectionPurpose="agent"
              aria-label="Model lock"
            />
          </label>
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button variant="primary" icon={<Play />} disabled={!mandateKey || starting} onClick={() => void start()}>
            {starting ? "Starting…" : "Start build"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
