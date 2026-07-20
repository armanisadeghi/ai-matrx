"use client";

// features/education/study/components/ScoreOverrideDialog.tsx
//
// Lets a learner manually correct their own attempt's grade (e.g. the AI
// grader marked something wrong that was actually right). Calls
// `studyService.overrideAttempt` → the `study_override_attempt` RPC, which
// flags `is_manually_edited`, preserves the first-ever grade, and replays
// `item_mastery` for that item. Desktop: centered Dialog. Mobile: bottom-sheet
// Drawer (never a Dialog on mobile — see ios-mobile-first skill).

import { useEffect, useState } from "react";
import { CheckCircle2, AlertTriangle, XCircle, Loader2 } from "lucide-react";
import { toast } from "@/lib/toast";
import { useIsMobile } from "@/hooks/use-mobile";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import {
  Drawer,
  DrawerContent,
  DrawerHeader,
  DrawerTitle,
  DrawerDescription,
  DrawerFooter,
} from "@/components/ui/drawer";
import { cn } from "@/lib/utils";
import { studyService } from "../service/studyService";
import type { StudyAttemptRow, ItemMasteryRow } from "../types";

type ResultOption = "correct" | "partial" | "incorrect";

const RESULT_OPTIONS: {
  id: ResultOption;
  label: string;
  icon: typeof CheckCircle2;
  activeClasses: string;
  defaultScore: number;
}[] = [
  {
    id: "correct",
    label: "Correct",
    icon: CheckCircle2,
    activeClasses:
      "border-green-500 bg-green-50 text-green-700 dark:border-green-500 dark:bg-green-950/50 dark:text-green-300",
    defaultScore: 100,
  },
  {
    id: "partial",
    label: "Partial",
    icon: AlertTriangle,
    activeClasses:
      "border-amber-500 bg-amber-50 text-amber-700 dark:border-amber-500 dark:bg-amber-950/50 dark:text-amber-300",
    defaultScore: 60,
  },
  {
    id: "incorrect",
    label: "Missed",
    icon: XCircle,
    activeClasses:
      "border-red-500 bg-red-50 text-red-700 dark:border-red-500 dark:bg-red-950/50 dark:text-red-300",
    defaultScore: 0,
  },
];

export function ScoreOverrideDialog({
  attempt,
  open,
  onClose,
  onSaved,
}: {
  attempt: StudyAttemptRow;
  open: boolean;
  onClose: () => void;
  onSaved: (result: {
    attempt: StudyAttemptRow;
    mastery: ItemMasteryRow;
  }) => void;
}) {
  const isMobile = useIsMobile();
  const [result, setResult] = useState<ResultOption>(
    (attempt.result as ResultOption) ?? "correct",
  );
  const [scorePct, setScorePct] = useState<number>(
    attempt.score_value != null
      ? Math.round(Number(attempt.score_value) * 100)
      : 100,
  );
  const [saving, setSaving] = useState(false);

  // Re-seed from the attempt every time the dialog opens, so a cancel + reopen
  // doesn't carry over an unsaved edit from a previous open.
  useEffect(() => {
    if (!open) return;
    setResult((attempt.result as ResultOption) ?? "correct");
    setScorePct(
      attempt.score_value != null
        ? Math.round(Number(attempt.score_value) * 100)
        : 100,
    );
  }, [open, attempt.id, attempt.result, attempt.score_value]);

  const handleResultChange = (next: ResultOption) => {
    setResult(next);
    // Nudge the slider to a sensible default for the new bucket, but only when
    // it still matches the PREVIOUS bucket's default — if the learner already
    // fine-tuned the slider, don't stomp on it.
    const prevDefault = RESULT_OPTIONS.find(
      (o) => o.id === result,
    )?.defaultScore;
    if (scorePct === prevDefault) {
      setScorePct(
        RESULT_OPTIONS.find((o) => o.id === next)?.defaultScore ?? scorePct,
      );
    }
  };

  const handleSave = async () => {
    setSaving(true);
    const res = await studyService.overrideAttempt({
      attemptId: attempt.id,
      result,
      scoreValue: scorePct / 100,
    });
    setSaving(false);
    if (res.error || !res.data) {
      toast.error(res.error ?? "Couldn't save your correction");
      return;
    }
    toast.success("Score updated");
    onSaved(res.data);
    onClose();
  };

  const body = (
    <div className="space-y-4 px-1">
      <div className="flex gap-2">
        {RESULT_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            onClick={() => handleResultChange(opt.id)}
            className={cn(
              "flex flex-1 flex-col items-center gap-1 rounded-lg border-2 border-border bg-background px-2 py-2.5 text-xs font-medium text-muted-foreground transition-colors",
              result === opt.id && opt.activeClasses,
            )}
          >
            <opt.icon className="h-4 w-4" />
            {opt.label}
          </button>
        ))}
      </div>

      <div>
        <div className="mb-2 flex items-center justify-between">
          <span className="text-xs font-medium text-muted-foreground">
            Score
          </span>
          <span className="text-sm font-bold tabular-nums text-foreground">
            {scorePct}%
          </span>
        </div>
        <Slider
          value={[scorePct]}
          onValueChange={([v]) => setScorePct(v)}
          min={0}
          max={100}
          step={5}
        />
      </div>

      <p className="text-xs text-muted-foreground">
        This will be marked as manually edited, and the original AI grade is
        kept on record.
      </p>
    </div>
  );

  if (isMobile) {
    return (
      <Drawer open={open} onOpenChange={(next) => !next && onClose()}>
        <DrawerContent className="pb-safe">
          <DrawerHeader>
            <DrawerTitle>Edit your score</DrawerTitle>
            <DrawerDescription>
              Correct the grade for this answer.
            </DrawerDescription>
          </DrawerHeader>
          <div className="px-4">{body}</div>
          <DrawerFooter className="flex-row gap-2">
            <Button
              variant="outline"
              className="flex-1"
              onClick={onClose}
              disabled={saving}
            >
              Cancel
            </Button>
            <Button
              className="flex-1 gap-1.5"
              onClick={handleSave}
              disabled={saving}
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Save
            </Button>
          </DrawerFooter>
        </DrawerContent>
      </Drawer>
    );
  }

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle>Edit your score</DialogTitle>
          <DialogDescription>
            Correct the grade for this answer.
          </DialogDescription>
        </DialogHeader>
        {body}
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button className="gap-1.5" onClick={handleSave} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
