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
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectEffectiveOrganizationId } from "@/lib/redux/slices/appContextSlice";
import { createDraftPack } from "../../service";

/**
 * The guided start of the Expert Distillation System — intake, not a form for
 * a form's sake. Four questions (goal · who runs it · where the knowledge
 * lives · stakes), answered with one free-text line and clickable bands, then
 * the system routes the expert into the right distillation lane: knowledge in
 * their head → the Interviewer opens immediately; written down / someone
 * else's material → the document lane. The answers land on metadata.intake,
 * where the Interviewer agent reads them so it never re-asks.
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

export function NewPackDialog({
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
      const packName =
        name.trim() ||
        goal.trim().slice(0, 60).trim().replace(/[.!?]+$/, "") ||
        "My expertise";
      const pack = await createDraftPack({
        name: packName,
        description: goal.trim(),
        source: {},
        organizationId,
        intake: {
          goal: goal.trim(),
          who_runs_it: who ?? undefined,
          knowledge_lives: knowledge ?? undefined,
          stakes: stakes ?? undefined,
        },
      });
      onOpenChange(false);
      // Route into the right distillation lane. Head / split / unsure → the
      // interview opens on arrival; document-shaped sources go to the pack
      // page where "From a source" is front and center.
      const interviewLane =
        knowledge === null ||
        knowledge === "In my head" ||
        knowledge === "Split across people" ||
        knowledge === "Not sure";
      toast.success(`"${pack.name}" started`, {
        description: interviewLane
          ? "Let's talk — the interview writes your rules down as you speak."
          : "Add your source material and we'll distill the rules from it.",
      });
      startTransition(() =>
        router.push(
          interviewLane
            ? `/expertise/${pack.id}?interview=1`
            : `/expertise/${pack.id}`,
        ),
      );
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Could not start the pack",
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
            <Textarea
              id="intake-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="e.g. An assistant that does keyword research exactly the way I do it"
              rows={2}
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
          <div className="space-y-1.5">
            <Label htmlFor="pack-name">
              Name it <span className="text-muted-foreground">(optional)</span>
            </Label>
            <Input
              id="pack-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Our SEO Keyword Method"
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
