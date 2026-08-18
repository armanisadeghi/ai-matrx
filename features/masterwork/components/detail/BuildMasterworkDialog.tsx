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

/** How many rules this Masterwork will actually be built from. */
function liveRuleCount(rulebook: Rulebook): number {
  return rulebook.rules.filter((r) => !r.draft && !r.retired).length;
}

/**
 * Which shape to recommend, from the Expert's OWN intake answer. A goal that
 * describes producing something ("a system that finds…", "writes…") wants the
 * system to do the work; a goal about reviewing/checking existing work wants
 * the reviewer. Ties go to reviewing, which is the cheaper thing to try first.
 */
function recommendKind(rulebook: Rulebook): MasterworkKind {
  const goal = String(
    (rulebook.metadata as { intake?: { goal?: unknown } } | null)?.intake?.goal ??
      rulebook.description ??
      "",
  ).toLowerCase();
  if (!goal) return "edit";
  const reviewWords =
    /\b(review|check|audit|proofread|edit|correct|critique|grade|score|evaluate)\b/;
  const produceWords =
    /\b(write|writes|writing|create|creates|draft|drafts|generate|generates|produce|produces|find|finds|build|builds|plan|plans|system that)\b/;
  const wantsReview = reviewWords.test(goal);
  const wantsProduce = produceWords.test(goal);
  if (wantsProduce && !wantsReview) return "generate";
  return "edit";
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
  // THE RECOMMENDATION. The Expert already told us at intake what they wanted
  // this to produce — asking again, cold, in our vocabulary, is what made this
  // moment feel like a quiz (Arman, 2026-08-18). We recommend from their own
  // words and let them change it; we never silently decide for them.
  const recommended = recommendKind(rulebook);
  const [kind, setKind] = useState<MasterworkKind>(recommended);
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
            <div className="space-y-2">
              <div className="rounded-md border border-border bg-muted/40 px-3 py-2">
                <p className="text-xs text-muted-foreground">
                  Building from{" "}
                  <span className="font-medium text-foreground">
                    {liveRuleCount(rulebook)} approved rules
                  </span>{" "}
                  in {rulebook.name}.
                </p>
              </div>
              <Label>What should it do for you?</Label>
              <div className="grid gap-2 sm:grid-cols-2">
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Review work and fix it
                    </span>
                    {recommended === "edit" ? (
                      <span className="rounded border border-primary/40 px-1 py-0 text-[10px] text-primary">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    You give it something already written. It finds everything
                    that breaks your rules, fixes it, and shows you what it
                    changed and why.
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
                  <div className="flex flex-wrap items-center gap-1.5">
                    <span className="text-sm font-medium text-foreground">
                      Do the work for you
                    </span>
                    {recommended === "generate" ? (
                      <span className="rounded border border-primary/40 px-1 py-0 text-[10px] text-primary">
                        Recommended
                      </span>
                    ) : null}
                  </div>
                  <div className="mt-0.5 text-xs text-muted-foreground">
                    You tell it the job. It does the work following your rules,
                    checks its own work against them, and hands you the version
                    that holds up.
                  </div>
                </button>
              </div>
              <p className="text-xs text-muted-foreground">
                Recommended from what you told us at the start. Change it any
                time — you can build the other one too.
              </p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="masterwork-name">
                Give it a name (optional)
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
                  What should it make?
                </Label>
                <ProTextarea
                  id="masterwork-deliverable"
                  value={deliverable}
                  onChange={(e) => setDeliverable(e.target.value)}
                  placeholder="e.g. a keyword plan for one page, advertising copy, a patient letter…"
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
