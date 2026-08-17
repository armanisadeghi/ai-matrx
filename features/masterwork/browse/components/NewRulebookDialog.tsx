"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Check } from "lucide-react";
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
import {
  fetchDistillationApproaches,
  type DistillationApproach,
} from "../approaches";

/**
 * The guided start of Masterwork Distillation — intake, not a form for a
 * form's sake. Two steps:
 *
 * 1. Four questions (goal · who runs it · where the knowledge lives · stakes
 *    · benchmark), answered with one free-text line and clickable bands. The
 *    answers land on metadata.intake, where the Scout reads them so it never
 *    re-asks.
 * 2. "How do you want to do this?" — the Approach picker. The cards are the
 *    ENABLED rows of the platform.approach registry (never a hardcoded list —
 *    "intake is a registry of Approaches, never a hardcoded flow"). The
 *    knowledge answer marks one card Suggested; the Expert picks, and the
 *    row's own intake_query routes them into that Approach's surface.
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
 * Which Approach the knowledge answer suggests — a soft hint (badge +
 * preselect), never a route. The Expert always sees every enabled card.
 */
function suggestedApproachKey(knowledge: string | null): string {
  if (
    knowledge === "Written down (docs, SOPs, past work)" ||
    knowledge === "Someone else's material (a book, a course)"
  ) {
    return "source";
  }
  return "interview";
}

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

function ApproachCard({
  approach,
  selected,
  suggested,
  onSelect,
}: {
  approach: DistillationApproach;
  selected: boolean;
  suggested: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={cn(
        "w-full rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5 ring-1 ring-primary"
          : "border-border bg-card hover:border-foreground/25",
      )}
    >
      <div className="flex items-center gap-2">
        <span className="text-sm font-medium text-foreground">
          {approach.label}
        </span>
        {suggested && (
          <span className="rounded-full bg-primary/10 px-2 py-0.5 text-[10px] font-medium text-primary">
            Suggested for you
          </span>
        )}
        {selected && <Check className="ml-auto h-4 w-4 shrink-0 text-primary" />}
      </div>
      <p className="mt-1 text-xs leading-relaxed text-muted-foreground">
        {approach.blurb}
      </p>
      <div className="mt-2 space-y-0.5 text-[11px] text-muted-foreground">
        <p>
          <span className="font-medium text-foreground/80">You bring:</span>{" "}
          {approach.whatItNeeds}
        </p>
        <p>
          <span className="font-medium text-foreground/80">Time:</span>{" "}
          {approach.costTimeShape}
        </p>
      </div>
    </button>
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
  const [step, setStep] = useState<"questions" | "approach">("questions");
  const [name, setName] = useState("");
  const [goal, setGoal] = useState("");
  const [who, setWho] = useState<string | null>(null);
  const [knowledge, setKnowledge] = useState<string | null>(null);
  const [stakes, setStakes] = useState<string | null>(null);
  const [benchmark, setBenchmark] = useState<string | null>(null);
  const [approaches, setApproaches] = useState<DistillationApproach[] | null>(
    null,
  );
  const [approachError, setApproachError] = useState<string | null>(null);
  const [selectedKey, setSelectedKey] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [, startTransition] = useTransition();

  // Load the registry as soon as the dialog opens so the cards are there the
  // moment the Expert reaches step 2.
  useEffect(() => {
    if (!open || approaches !== null) return;
    let cancelled = false;
    setApproachError(null);
    fetchDistillationApproaches()
      .then((rows) => {
        if (cancelled) return;
        if (rows.length === 0) {
          setApproachError(
            "No ways to get started are available right now — please try again shortly.",
          );
          return;
        }
        setApproaches(rows);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setApproachError(
          err instanceof Error
            ? err.message
            : "Could not load the ways to get started.",
        );
      });
    return () => {
      cancelled = true;
    };
  }, [open, approaches]);

  const suggested = suggestedApproachKey(knowledge);
  const effectiveKey =
    selectedKey ??
    (approaches?.some((a) => a.key === suggested)
      ? suggested
      : approaches?.[0]?.key ?? null);

  const toApproachStep = () => {
    if (!goal.trim()) {
      toast.error("Tell us what you're trying to build first.");
      return;
    }
    setStep("approach");
  };

  const create = async () => {
    const approach = approaches?.find((a) => a.key === effectiveKey);
    if (!approach) {
      toast.error("Pick how you'd like to do this first.");
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
          approach: approach.key,
        },
      });
      onOpenChange(false);
      // Route into the chosen Approach: the registry row's own intake_query
      // is appended to the Rulebook URL (e.g. the interview Approach carries
      // {"interview":"1"} so the Scout opens on arrival).
      const params = new URLSearchParams(approach.intakeQuery);
      const href = `/masterwork/${rulebook.id}${params.size > 0 ? `?${params.toString()}` : ""}`;
      toast.success(`"${rulebook.name}" started`, {
        description: approach.costTimeShape,
      });
      startTransition(() => router.push(href));
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
            {step === "questions"
              ? "Four quick questions, then you choose how we take you through it."
              : "How do you want to do this? Every path ends the same way — rules you approve, in your own words."}
          </DialogDescription>
        </DialogHeader>
        {step === "questions" ? (
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
        ) : (
          <div className="space-y-2">
            {approachError ? (
              <div className="rounded-lg border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
                {approachError}
                <Button
                  variant="outline"
                  size="sm"
                  className="ml-2"
                  onClick={() => {
                    setApproaches(null);
                    setApproachError(null);
                  }}
                >
                  Try again
                </Button>
              </div>
            ) : approaches === null ? (
              <div className="space-y-2" aria-busy="true">
                {[0, 1, 2].map((i) => (
                  <div
                    key={i}
                    className="h-20 animate-pulse rounded-lg border border-border bg-muted/40"
                  />
                ))}
              </div>
            ) : (
              approaches.map((approach) => (
                <ApproachCard
                  key={approach.key}
                  approach={approach}
                  selected={approach.key === effectiveKey}
                  suggested={approach.key === suggested}
                  onSelect={() => setSelectedKey(approach.key)}
                />
              ))
            )}
          </div>
        )}
        <DialogFooter>
          {step === "questions" ? (
            <>
              <Button
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={saving}
              >
                Cancel
              </Button>
              <Button onClick={toApproachStep} disabled={saving}>
                Next
              </Button>
            </>
          ) : (
            <>
              <Button
                variant="outline"
                onClick={() => setStep("questions")}
                disabled={saving}
              >
                Back
              </Button>
              <Button
                onClick={() => void create()}
                disabled={saving || !effectiveKey}
              >
                {saving ? "Starting…" : "Start"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
