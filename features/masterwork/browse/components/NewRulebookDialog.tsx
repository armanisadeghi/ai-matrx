"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
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
import { Label } from "@/components/ui/label";
import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createDraftRulebook } from "../../service";

/**
 * The guided start of Masterwork Distillation — intake, not a form for a
 * form's sake. Four questions (goal · who runs it · where the knowledge
 * lives · stakes), answered with one free-text line and clickable bands, then
 * the system routes the Expert into the right Distillation Approach: knowledge
 * in their head → the Scout opens immediately; written down / someone else's
 * material → the document Approach. The answers land on metadata.intake,
 * where the Scout reads them so it never re-asks.
 */

const WHO_OPTIONS = [
  "Just me",
  "My team",
  "A department",
  "The whole company",
  "Customers",
] as const;

const KNOWLEDGE_OPTIONS = [
  "In my head",
  "Split across people",
  "Written down (docs, SOPs, past work)",
  "Someone else's material (a book, a course)",
  "Not sure",
] as const;

const STAKES_OPTIONS = [
  "Embarrassing",
  "Costs money",
  "Costs a client",
  "Serious harm",
] as const;

// The benchmark question (intake doc 20): fills the baseline row of the
// cost/quality scoreboard on day one, in the Expert's own words — the floor
// we're beating, not the target. The BRANCH matters more than the score.
const BENCHMARK_OPTIONS = [
  "It can't do it",
  "It does it badly",
  "It takes several chats",
  "It doesn't have my context",
  "Haven't tried",
] as const;

/**
 * Derive a Rulebook name from the goal: at most `max` characters, truncated on
 * a word boundary so the name never ends mid-word ("An assistant that does
 * keyw" was the defect this fixes).
 */
function nameFromGoal(goal: string, max = 60): string {
  const clean = goal.trim().replace(/[.!?]+$/, "");
  if (clean.length <= max) return clean;
  const cut = clean.slice(0, max);
  const lastSpace = cut.lastIndexOf(" ");
  return (lastSpace > 0 ? cut.slice(0, lastSpace) : cut).replace(/[.!?,;:]+$/, "");
}

function BandPicker({
  label,
  options,
  value,
  onChange,
}: {
  label: string;
  options: readonly string[];
  value: string | null;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label>{label}</Label>
      <div className="flex flex-wrap gap-1.5">
        {options.map((opt) => (
          <button
            key={opt}
            type="button"
            onClick={() => onChange(opt)}
            className={cn(
              "rounded-full border px-2.5 py-1 text-xs transition-colors",
              value === opt
                ? "border-primary bg-primary/10 text-primary"
                : "border-border bg-card text-muted-foreground hover:text-foreground",
            )}
          >
            {opt}
          </button>
        ))}
      </div>
    </div>
  );
}

export function NewRulebookDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const router = useRouter();
  const organizationId = useAppSelector(selectEffectiveOrganizationId);
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [who, setWho] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<string | null>(null);
  const [stakes, setStakes] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  const create = async () => {
    if (!goal.trim()) {
      toast.error("Tell us what you're trying to build first.");
      return;
    }
    if (!organizationId) {
      toast.error("Your workspace is still loading — try again in a moment.");
      return;
    }
    setSaving(true);
    try {
      const rulebookName =
        name.trim() || nameFromGoal(goal) || "My expertise";
      const rulebook = await createDraftRulebook({
        name: rulebookName,
        description: goal.trim(),
        source: {},
        organizationId,
        intake: {
          goal: goal.trim(),
          who_runs_it: who ?? undefined,
          knowledge_lives: knowledge ?? undefined,
          stakes: stakes ?? undefined,
          benchmark: benchmark ?? undefined,
        },
      });
      onOpenChange(false);
      // Route into the right Distillation Approach. Head / split / unsure →
      // the Scout interview opens on arrival; document-shaped sources go to
      // the Rulebook page where "From a source" is front and center.
      const interviewApproach =
        knowledge === null ||
        knowledge === "In my head" ||
        knowledge === "Split across people" ||
        knowledge === "Not sure";
      toast.success(`"${rulebook.name}" started`, {
        description: interviewApproach
          ? "Let's talk — the interview writes your rules down as you speak."
          : "Add your source material and we'll distill the rules from it.",
      });
      startTransition(() =>
        router.push(
          interviewApproach
            ? `/masterwork/${rulebook.id}?interview=1`
            : `/masterwork/${rulebook.id}`,
        ),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the Rulebook",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>Distill your expertise</DialogTitle>
          <DialogDescription>
            Four quick questions, then we take you through it — you talk, we
            write the rules down, you approve them.
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4">
          <div className="space-y-1.5">
            <Label htmlFor="intake-goal">What are you trying to build?</Label>
            <ProTextarea
              id="intake-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. An assistant that does keyword research exactly the way I do it"
              autoGrow
              minHeight={64}
              maxHeight={160}
              enableTextStats={false}
              auxiliaryControlsLabel="what you are trying to build"
              autoFocus
            />
          </div>
          <BandPicker
            label="Who will actually run this?"
            options={WHO_OPTIONS}
            value={who}
            onChange={setWho}
          />
          <BandPicker
            label="Where does the knowledge live today?"
            options={KNOWLEDGE_OPTIONS}
            value={knowledge}
            onChange={setKnowledge}
          />
          <BandPicker
            label="If it gets something wrong, that's…"
            options={STAKES_OPTIONS}
            value={stakes}
            onChange={setStakes}
          />
          <BandPicker
            label="If you handed this to ChatGPT today, how would it do?"
            options={BENCHMARK_OPTIONS}
            value={benchmark}
            onChange={setBenchmark}
          />
          <div className="space-y-1.5">
            <Label htmlFor="rulebook-name">
              Name it <span className="text-muted-foreground">(optional)</span>
            </Label>
            <ProInput
              id="rulebook-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Our SEO Keyword Method"
              auxiliaryControlsLabel="Rulebook name"
            />
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={saving}
          >
            Cancel
          </Button>
          <Button onClick={() => void create()} disabled={saving}>
            {saving ? "Starting…" : "Start"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
