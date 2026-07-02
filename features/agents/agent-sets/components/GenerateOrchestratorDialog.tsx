// features/agents/agent-sets/components/GenerateOrchestratorDialog.tsx
//
// "Generate an orchestrator" — a QUICK name prompt, not an agent picker. We create
// the orchestrator from the template immediately and drop the user into the builder,
// where they choose the agents it coordinates on the canonical rail (search / filter
// / tabs / peek / drag-drop) and click "Sync agent listings" to fill its prompt.
// (Deliberately NOT a modal full of agents — that's what the builder is for.)

"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Network } from "lucide-react";
import { cn } from "@/lib/utils";
import { toast } from "@/lib/toast-service";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useCreateOrchestrator } from "../orchestrator/useCreateOrchestrator";
import { accentClasses } from "./accents";
import { DEFAULT_SET_ACCENT, SET_ACCENTS, type SetAccent } from "../constants";

export interface GenerateOrchestratorDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function GenerateOrchestratorDialog({ open, onOpenChange }: GenerateOrchestratorDialogProps) {
  const router = useRouter();
  const { create, creating, error } = useCreateOrchestrator();
  const [name, setName] = useState("");
  const [tagline, setTagline] = useState("");
  const [accent, setAccent] = useState<SetAccent>(DEFAULT_SET_ACCENT);
  const runningRef = useRef(false);

  const handleOpenChange = (next: boolean) => {
    if (creating) return;
    if (!next) {
      setName("");
      setTagline("");
      setAccent(DEFAULT_SET_ACCENT);
    }
    onOpenChange(next);
  };

  const handleCreate = async () => {
    if (runningRef.current) return;
    runningRef.current = true;
    try {
      const id = await create({ name, accent, tagline });
      if (id) {
        toast.success("Orchestrator created — add the agents it coordinates, then Sync its prompt.");
        handleOpenChange(false);
        router.push(`/agents/sets/${id}`);
      }
    } finally {
      runningRef.current = false;
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Network className="h-4 w-4 text-primary" />
            Generate an orchestrator
          </DialogTitle>
          <DialogDescription>
            Just name it. We&apos;ll create an orchestrator agent from the template and
            open the builder — you pick the agents it coordinates there, then click
            <span className="font-medium text-foreground"> Sync agent listings</span> to
            teach it about them.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Name</label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Defaults to “Agent Orchestrator”"
              autoFocus
              onKeyDown={(e) => {
                if (e.key === "Enter" && !creating) handleCreate();
              }}
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">
              Tagline <span className="text-muted-foreground/60">(optional)</span>
            </label>
            <Input
              value={tagline}
              onChange={(e) => setTagline(e.target.value)}
              placeholder="What does this set accomplish together?"
            />
          </div>
          <div className="space-y-1.5">
            <label className="text-xs font-medium text-muted-foreground">Accent</label>
            <div className="flex flex-wrap gap-1.5">
              {SET_ACCENTS.map((acc) => {
                const ac = accentClasses(acc);
                return (
                  <button
                    key={acc}
                    type="button"
                    aria-label={acc}
                    onClick={() => setAccent(acc)}
                    className={cn(
                      "h-6 w-6 rounded-full ring-2 ring-offset-2 ring-offset-background transition-transform hover:scale-110",
                      ac.dot,
                      accent === acc ? "ring-foreground/40" : "ring-transparent",
                    )}
                  />
                );
              })}
            </div>
          </div>

          {error && <p className="text-xs text-destructive">{error}</p>}
        </div>

        <DialogFooter>
          <Button variant="ghost" onClick={() => handleOpenChange(false)} disabled={creating}>
            Cancel
          </Button>
          <Button onClick={handleCreate} disabled={creating} className="gap-1.5">
            {creating ? <Loader2 className="h-4 w-4 animate-spin" /> : <Network className="h-4 w-4" />}
            Create &amp; open builder
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
