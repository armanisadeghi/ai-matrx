"use client";

import { useState } from "react";
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
import { Textarea } from "@/components/ui/textarea";
import LoadingSpinner from "@/components/ui/loading-spinner";
import { WORKFLOWS_APP_URL } from "@/features/shell/constants/nav-data";
import { useAppDispatch } from "@/lib/redux/hooks";
import { callApi } from "@/lib/api/call-api";
import type { paths } from "@/types/python-generated/api-types";
import type { ExpertisePack } from "../../types";

/**
 * "Create a desk" — the ONE button that turns a pack into a working checker.
 * Streams compile progress from aidream POST /expertise-desks/compile and
 * lands on the new desk. Plain language throughout.
 */

// TODO(expertise): drop this cast once aidream's OpenAPI regen lands the path
// in types/python-generated/api-types.ts (pnpm sync-types after the aidream
// release that ships /expertise-desks/compile).
const COMPILE_PATH = "/expertise-desks/compile" as unknown as keyof paths;

type DeskKind = "edit" | "generate";

interface CompleteInfo {
  workflow_id: string;
  name: string;
}

export function CompileDeskDialog({
  open,
  onOpenChange,
  pack,
  onCompiled,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  pack: ExpertisePack;
  onCompiled?: () => void;
}) {
  const dispatch = useAppDispatch();
  const [kind, setKind] = useState<DeskKind>("edit");
  const [name, setName] = useState("");
  const [deliverable, setDeliverable] = useState("");
  const [running, setRunning] = useState(false);
  const [progress, setProgress] = useState<string[]>([]);
  const [done, setDone] = useState<CompleteInfo | null>(null);

  const reset = () => {
    setProgress([]);
    setDone(null);
    setRunning(false);
  };

  const compile = async () => {
    setRunning(true);
    setProgress(["Starting the compiler…"]);
    setDone(null);
    try {
      const result = await dispatch(
        callApi({
          path: COMPILE_PATH,
          method: "POST",
          body: {
            pack_id: pack.id,
            desk_kind: kind,
            name: name.trim() || undefined,
            deliverable:
              kind === "generate"
                ? deliverable.trim() || undefined
                : undefined,
          } as never,
          stream: true,
          onStreamEvent: (event) => {
            if (event.event !== "data") return;
            const data = event.data as Record<string, unknown>;
            if (data.type === "desk_compile_progress") {
              setProgress((prev) => [...prev, String(data.message ?? "")]);
            } else if (data.type === "desk_compile_complete") {
              setDone({
                workflow_id: String(data.workflow_id ?? ""),
                name: String(data.name ?? ""),
              });
            }
          },
        }),
      );
      if (result.error) {
        throw new Error(
          typeof result.error === "string"
            ? result.error
            : "The compiler reported a problem.",
        );
      }
      onCompiled?.();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Could not compile the desk";
      setProgress((prev) => [...prev, `Problem: ${message}`]);
      toast.error(message);
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running) return; // don't lose a live compile by accident
        if (!next) reset();
        onOpenChange(next);
      }}
    >
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Create a desk from “{pack.name}”</DialogTitle>
          <DialogDescription>
            A desk is a working AI checker built from this pack&apos;s{" "}
            {pack.principles.filter((p) => !p.retired && !p.draft).length}{" "}
            rules. Every rule is checked, and{" "}
            {pack.source.author ?? "the expert"} gives the final ruling.
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
                  Open the desk
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
        ) : running || progress.length > 1 ? (
          <div className="space-y-2">
            <div className="max-h-48 space-y-1 overflow-y-auto rounded-md border border-border bg-muted/40 p-3">
              {progress.map((line, i) => (
                <p key={i} className="text-xs text-muted-foreground">
                  {line}
                </p>
              ))}
            </div>
            {running ? <LoadingSpinner size="sm" /> : null}
          </div>
        ) : (
          <div className="space-y-3">
            <div className="space-y-1.5">
              <Label>What should the desk do?</Label>
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
                    I paste my work; the desk audits it rule by rule, fixes it,
                    and rules on it.
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
                    I describe a job; the desk drafts variants, audits each,
                    and picks the winner.
                  </div>
                </button>
              </div>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="desk-name">Desk name (optional)</Label>
              <Input
                id="desk-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder={`${pack.name} Desk`}
              />
            </div>
            {kind === "generate" ? (
              <div className="space-y-1.5">
                <Label htmlFor="desk-deliverable">
                  What does this desk produce?
                </Label>
                <Textarea
                  id="desk-deliverable"
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
            <Button onClick={() => void compile()} disabled={running}>
              {running ? "Compiling…" : "Create the desk"}
            </Button>
          </DialogFooter>
        ) : null}
      </DialogContent>
    </Dialog>
  );
}
