"use client";

import { useEffect, useRef, useState } from "react";
import { Hammer, PenLine } from "lucide-react";
import { toast } from "@/lib/toast";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { ProTextarea } from "@/components/official/ProTextarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import type { paths } from "@/types/python-generated/api-types";
import { useMasterworkRun } from "../../durable-run/useMasterworkRun";
import type { Rulebook } from "../../types";

/**
 * "Build a Masterwork" — the ONE button that turns a Rulebook into a working
 * checker. Streams Build progress from aidream POST /masterworks/build and
 * lands on the new Masterwork. Plain language throughout.
 *
 * The Build is a DURABLE run (`useMasterworkRun` → `platform.masterwork_run`):
 * reload the page mid-Build and this dialog picks the run back up and reports
 * the true outcome — a finished Masterwork is still here after a refresh. THE
 * FLOATING LAW: a run that dies on page refresh is the same defect as a spinner.
 */

const BUILD_PATH = "/masterworks/build" satisfies keyof paths;

type MasterworkKind = "edit" | "generate";

interface CompleteInfo {
  workflow_id: string;
  name: string;
}

/** The Build's terminal event, narrowed. A Masterwork with no workflow id is
 *  not one the user can open, so it is rejected rather than shown as success. */
function parseBuilt(raw: unknown): CompleteInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const data = raw as Record<string, unknown>;
  const workflowId = typeof data.workflow_id === "string" ? data.workflow_id : "";
  if (!workflowId) return null;
  return {
    workflow_id: workflowId,
    name: typeof data.name === "string" ? data.name : "Your Masterwork",
  };
}

export function BuildMasterworkDialog({
  open,
  onOpenChange,
  rulebook,
  onBuilt,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  rulebook: Rulebook;
  onBuilt?: () => void;
}) {
  const [kind, setKind] = useState<MasterworkKind>("edit");
  const [name, setName] = useState("");
  const [deliverable, setDeliverable] = useState("");

  const run = useMasterworkRun<CompleteInfo>({
    surface: "build",
    rulebookId: rulebook.id,
    path: BUILD_PATH,
    parseResult: parseBuilt,
  });
  const { running, stages: progress, result: done, error, reset } = run;
  const rejoining = run.status === "rejoining";

  // The list behind this dialog must reflect a Masterwork that finished while
  // the user was away, not only one they watched finish.
  useEffect(() => {
    if (done) onBuilt?.();
  }, [done, onBuilt]);

  // A run picked back up after a reload has to be VISIBLE. Rejoining it behind
  // a closed dialog would leave the user staring at a page that says nothing is
  // happening — the same defect as losing the run.
  const reopenedRef = useRef(false);
  useEffect(() => {
    if (reopenedRef.current || open || !running) return;
    reopenedRef.current = true;
    onOpenChange(true);
  }, [open, running, onOpenChange]);

  useEffect(() => {
    if (error) toast.error(error);
  }, [error]);

  const build = () => {
    void run.launch(
      {
        rulebook_id: rulebook.id,
        masterwork_kind: kind,
        name: name.trim() || undefined,
        deliverable:
          kind === "generate" ? deliverable.trim() || undefined : undefined,
      },
      name.trim() || `${rulebook.name} Masterwork`,
    );
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return; // don't lose a live Build by accident
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Build a Masterwork from “{rulebook.name}”</DialogTitle>
          <DialogDescription>
            A Masterwork is a working AI checker built from this Rulebook&apos;s{" "}
            {rulebook.rules.filter((r) => !r.retired && !r.draft).length}{" "}
            rules. Every rule is checked, and{" "}
            {rulebook.source.author ?? "the expert"} gives the final ruling.
          </DialogDescription>
        </DialogHeader>

        {done ? (
          <div className="space-y-3">
            <p className="text-sm text-foreground">
              “{done.name}” is ready. Open it to run your first job.
            </p>
            <div className="flex gap-2">
              <Button asChild size="sm">
                <a
                  href={`${WORKFLOWS_APP_URL}/workflows/${done.workflow_id}`}
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  Open the Masterwork
                </a>
              </Button>
              <Button
                size="sm"
                variant="outline"
                onClick={() => {
                  reset();
                  onOpenChange(false);
                }}
              >
                Done
              </Button>
            </div>
          </div>
        ) : running || progress.length > 0 ? (
          <div className="space-y-2">
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {progress.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {running ? (
              <div className="flex items-start gap-2">
                <LoadingSpinner size="sm" />
                <p className="text-xs text-muted-foreground">
                  {rejoining
                    ? "Picking this Build back up — it kept running while you were away."
                    : "This keeps running on our servers even if you close this or reload — come back and it picks up where it left off."}
                </p>
              </div>
            ) : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>What should the Masterwork do?</Label>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setKind("edit")}
                  className={`rounded-md border p-3 text-left ${
                    kind === "edit"
                      ? "border-primary bg-accent"
                      : "border-border bg-card"
                  }`}
                >
                  <PenLine className="mb-1 h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-medium text-foreground">
                    Check &amp; correct
                  </div>
                  <div className="text-xs text-muted-foreground">
                    I paste my work; the Masterwork audits it rule by rule,
                    fixes it, and rules on it.
                  </div>
                </button>
                <button
                  type="button"
                  onClick={() => setKind("generate")}
                  className={`rounded-md border p-3 text-left ${
                    kind === "generate"
                      ? "border-primary bg-accent"
                      : "border-border bg-card"
                  }`}
                >
                  <Hammer className="mb-1 h-4 w-4 text-muted-foreground" />
                  <div className="text-sm font-medium text-foreground">
                    Create &amp; check
                  </div>
                  <div className="text-xs text-muted-foreground">
                    I describe a job; the Masterwork drafts variants, audits
                    each, and picks the winner.
                  </div>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="masterwork-name">
                Masterwork name (optional)
              </Label>
              <Input
                id="masterwork-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${rulebook.name} Masterwork`}
              />
            </div>
            {kind === "generate" ? (
              <div className="space-y-1.5">
                <Label htmlFor="masterwork-deliverable">
                  What does this Masterwork produce?
                </Label>
                <ProTextarea
                  id="masterwork-deliverable"
                  value={deliverable}
                  onChange={(e) => setDeliverable(e.target.value)}
                  placeholder="e.g. advertising copy, a keyword research plan, a patient letter…"
                  rows={2}
                />
              </div>
            ) : null}
          </div>
        )}

        {!done ? (
          <DialogFooter>
            <Button
              variant="outline"
              onClick={() => {
                reset();
                onOpenChange(false);
              }}
              disabled={running}
            >
              Cancel
            </Button>
            <Button onClick={build} disabled={running}>
              {running ? "Building…" : "Build the Masterwork"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
