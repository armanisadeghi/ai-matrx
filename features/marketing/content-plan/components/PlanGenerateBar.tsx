"use client";

/**
 * The workspace's AI-generation strip (tree/table/map views): "Generate
 * plan" launches aidream's 3-waves + merge generator for the open site and
 * live-narrates its phases while nodes stream into the tree. Re-running on a
 * non-empty plan is safe — the server applies idempotently (existing routes
 * are kept, new ones added).
 */
import { useState } from "react";
import { Loader2, Sparkles, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover";
import { Textarea } from "@/components/ui/textarea";

import type { PlanAiRunState } from "../hooks/useContentPlanAi";
import { ResearchTopicSelect } from "./ResearchTopicSelect";

export function PlanGenerateBar({
  nodeCount,
  run,
  onStart,
  onDismiss,
  researchTopicId,
  onResearchTopicChange,
}: {
  nodeCount: number;
  run: PlanAiRunState;
  onStart: (options: { maxNodes: number; guidance?: string }) => void;
  onDismiss: () => void;
  /** The research topic grounding the generator (the site's recorded link). */
  researchTopicId: string | null;
  onResearchTopicChange: (topicId: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [maxNodes, setMaxNodes] = useState(40);
  const [guidance, setGuidance] = useState("");

  if (run.status === "running") {
    return (
      <div className="flex items-center gap-2 border-b border-border bg-muted/40 px-3 py-1.5 text-xs text-foreground">
        <Loader2 className="h-3.5 w-3.5 shrink-0 animate-spin text-primary" />
        <span className="truncate">
          {run.stage ?? "Generating the plan…"} — nodes appear in the tree as
          they land.
        </span>
      </div>
    );
  }

  if (run.status === "error") {
    return (
      <div className="flex items-center gap-2 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
        <span className="min-w-0 flex-1 truncate">
          Plan generation failed: {run.error}
        </span>
        <Button
          variant="ghost"
          size="sm"
          className="h-6 w-6 shrink-0 p-0"
          aria-label="Dismiss"
          onClick={onDismiss}
        >
          <X className="h-3.5 w-3.5" />
        </Button>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 border-b border-border bg-muted/20 px-3 py-1.5">
      <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">
        {nodeCount === 0
          ? "No plan yet — let three research agents draft one, then correct it."
          : "Agents can extend this plan — existing pages are never overwritten."}
      </span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant={nodeCount === 0 ? "default" : "outline"}
            size="sm"
            className="h-7 shrink-0 gap-1.5 px-2.5 text-xs"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Generate plan
          </Button>
        </PopoverTrigger>
        <PopoverContent align="end" className="w-80 space-y-3">
          <div>
            <Label className="mb-1 block text-xs font-medium">
              Research grounding
            </Label>
            <ResearchTopicSelect
              value={researchTopicId}
              onChange={onResearchTopicChange}
              triggerClassName="h-8 w-full text-sm"
              ariaLabel="Research topic grounding the generator"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              The topic&apos;s final research report is handed to the three
              research agents — real services, locations, and topics instead
              of guesses.
            </p>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">
              Page budget
            </Label>
            <Input
              type="number"
              min={10}
              max={150}
              value={maxNodes}
              onChange={(event) => {
                const value = Number(event.target.value);
                if (Number.isFinite(value)) setMaxNodes(value);
              }}
              className="h-8 text-sm"
            />
            <p className="mt-1 text-xs text-muted-foreground">
              10–150. The generator stops at this many planned pages.
            </p>
          </div>
          <div>
            <Label className="mb-1 block text-xs font-medium">
              Guidance (optional)
            </Label>
            <Textarea
              value={guidance}
              onChange={(event) => setGuidance(event.target.value)}
              placeholder="Anything the research agents should know — focus areas, services to emphasize, pages to avoid…"
              className="min-h-20 text-sm"
            />
          </div>
          <Button
            size="sm"
            className="w-full gap-1.5"
            onClick={() => {
              setOpen(false);
              onStart({
                maxNodes: Math.min(150, Math.max(10, maxNodes)),
                guidance: guidance.trim() || undefined,
              });
            }}
          >
            <Sparkles className="h-3.5 w-3.5" />
            Run the generator
          </Button>
        </PopoverContent>
      </Popover>
    </div>
  );
}
