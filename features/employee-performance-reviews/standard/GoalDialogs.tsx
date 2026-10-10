"use client";

// The goal editor and the progress update. Titles, descriptions and notes are written in ProInput /
// ProTextarea; numbers and dates are raw values. Alignment (a goal under the goal it supports) is a
// picker over the goals this page knows, minus the goal itself and everything below it.

import { useState } from "react";
import { Button, Select } from "@ai-matrx/design-system/controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ai-matrx/design-system";

import { ProInput } from "@/components/official/ProInput";
import { ProTextarea } from "@/components/official/ProTextarea";
import { toast } from "@/lib/toast";

import { GOAL_STATUSES, GOAL_STATUS_LABEL, parentChoices, progressLabel, type Goal, type GoalHistoryEntry } from "./goals";
import { saveGoal, updateGoalProgress } from "./service";
import { formatDay } from "./status";

const NONE = "__none";
const scope = () => ({ context: { surface: "hr-goals" } });

export function GoalEditorDialog({
  open,
  onOpenChange,
  employmentId,
  goal,
  alignable,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  employmentId: string;
  goal: Goal | null;
  /** Every goal this page knows, for the "supports" picker. */
  alignable: Goal[];
  onSaved: () => void;
}) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <GoalForm employmentId={employmentId} goal={goal} alignable={alignable} onClose={() => onOpenChange(false)} onSaved={onSaved} />
      </DialogContent>
    </Dialog>
  );
}

function GoalForm({ employmentId, goal, alignable, onClose, onSaved }: { employmentId: string; goal: Goal | null; alignable: Goal[]; onClose: () => void; onSaved: () => void }) {
  const [f, setF] = useState({
    title: goal?.title ?? "",
    description: goal?.description ?? "",
    measure: goal?.measure ?? "",
    targetValue: goal?.targetValue === null || goal === null ? "" : String(goal.targetValue),
    currentValue: goal?.currentValue === null || goal === null ? "" : String(goal.currentValue),
    unit: goal?.unit ?? "",
    startOn: goal?.startOn ?? "",
    dueOn: goal?.dueOn ?? "",
    status: goal?.status ?? "on_track",
    parent: goal?.parentGoalId ?? NONE,
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const choices = parentChoices(alignable, goal?.goalId ?? null);
  const set = (k: keyof typeof f) => (e: { target: { value: string } }) => setF((x) => ({ ...x, [k]: e.target.value }));

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await saveGoal({
      goalId: goal?.goalId ?? null,
      employmentId,
      title: f.title,
      description: f.description,
      measure: f.measure,
      targetValue: f.targetValue,
      currentValue: f.currentValue,
      unit: f.unit,
      startOn: f.startOn,
      dueOn: f.dueOn,
      status: f.status,
      parentGoalId: f.parent === NONE ? null : f.parent,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    toast.success(goal ? "Goal saved" : "Goal added");
    onClose();
    onSaved();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{goal ? "Edit goal" : "New goal"}</DialogTitle>
        <DialogDescription>Say what done looks like so progress can be measured.</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        <ProInput aria-label="Goal title" placeholder="Cut month-end close from six days to four" value={f.title} onChange={set("title")} />
        <ProTextarea
          value={f.description}
          onChange={set("description")}
          placeholder="Why it matters and how you will get there"
          minHeight={64}
          maxHeight={240}
          surfaceName="hr-goals"
          getApplicationScope={scope}
          enableTextStats={false}
          className="min-h-[64px] resize-y text-base sm:text-sm"
        />
        <div className="grid grid-cols-3 gap-3">
          <ProInput aria-label="What is measured" placeholder="Measure" value={f.measure} onChange={set("measure")} />
          {/* ui-exception: a number, not writing */}
          <ProInput type="number" aria-label="Target" placeholder="Target" value={f.targetValue} onChange={set("targetValue")} />
          <ProInput aria-label="Unit" placeholder="Unit" value={f.unit} onChange={set("unit")} />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <label className="grid gap-1 text-xs text-muted-foreground">
            Starts
            <ProInput type="date" aria-label="Start date" value={f.startOn} onChange={set("startOn")} />
          </label>
          <label className="grid gap-1 text-xs text-muted-foreground">
            Due
            <ProInput type="date" aria-label="Due date" value={f.dueOn} onChange={set("dueOn")} />
          </label>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <Select aria-label="Status" value={f.status} onValueChange={(v) => setF((x) => ({ ...x, status: v }))} options={GOAL_STATUSES.map((s) => ({ value: s, label: GOAL_STATUS_LABEL[s] }))} />
          <Select
            aria-label="Supports"
            value={f.parent}
            onValueChange={(v) => setF((x) => ({ ...x, parent: v }))}
            options={[{ value: NONE, label: "Supports no other goal" }, ...choices.map((g) => ({ value: g.goalId, label: g.title }))]}
          />
        </div>
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          Cancel
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={busy || f.title.trim() === ""}>
          Save goal
        </Button>
      </DialogFooter>
    </>
  );
}

export function GoalProgressDialog({ goal, onOpenChange, onSaved }: { goal: Goal | null; onOpenChange: (open: boolean) => void; onSaved: () => void }) {
  return (
    <Dialog open={goal !== null} onOpenChange={onOpenChange}>
      <DialogContent>{goal ? <ProgressForm key={goal.goalId} goal={goal} onClose={() => onOpenChange(false)} onSaved={onSaved} /> : null}</DialogContent>
    </Dialog>
  );
}

function ProgressForm({ goal, onClose, onSaved }: { goal: Goal; onClose: () => void; onSaved: () => void }) {
  const [current, setCurrent] = useState(goal.currentValue === null ? "" : String(goal.currentValue));
  const [progress, setProgress] = useState(String(Math.round(goal.progress)));
  const [status, setStatus] = useState<string>(goal.status);
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<GoalHistoryEntry[]>([]);
  const hasTarget = goal.targetValue !== null;

  const save = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const r = await updateGoalProgress(goal.goalId, {
      currentValue: hasTarget && current.trim() !== "" ? Number(current) : null,
      progress: !hasTarget && progress.trim() !== "" ? Number(progress) : null,
      status,
      note: note.trim() || null,
    });
    setBusy(false);
    if (!r.ok) {
      setError(r.message);
      return;
    }
    setHistory(r.data.history);
    setNote("");
    toast.success("Progress saved");
    onSaved();
  };

  return (
    <>
      <DialogHeader>
        <DialogTitle>{goal.title}</DialogTitle>
        <DialogDescription>{progressLabel(goal)}</DialogDescription>
      </DialogHeader>
      <div className="grid gap-3">
        {hasTarget ? (
          <label className="grid gap-1 text-xs text-muted-foreground">
            Where you are now{goal.unit ? ` (${goal.unit})` : ""}
            <ProInput type="number" aria-label="Current value" value={current} onChange={(e) => setCurrent(e.target.value)} />
          </label>
        ) : (
          <label className="grid gap-1 text-xs text-muted-foreground">
            Percent complete
            <ProInput type="number" min={0} max={100} aria-label="Percent complete" value={progress} onChange={(e) => setProgress(e.target.value)} />
          </label>
        )}
        <Select aria-label="Status" value={status} onValueChange={setStatus} options={GOAL_STATUSES.map((s) => ({ value: s, label: GOAL_STATUS_LABEL[s] }))} />
        <ProTextarea
          value={note}
          onChange={(e) => setNote(e.target.value)}
          placeholder="What changed since the last update"
          minHeight={64}
          maxHeight={240}
          surfaceName="hr-goals"
          getApplicationScope={scope}
          enableTextStats={false}
          className="min-h-[64px] resize-y text-base sm:text-sm"
        />
        {error ? (
          <p role="alert" className="text-sm text-destructive">
            {error}
          </p>
        ) : null}
        {history.length > 0 ? (
          <ol aria-label="Progress history" className="max-h-48 space-y-1 overflow-y-auto text-sm">
            {[...history].reverse().map((h, i) => (
              <li key={i} className="flex flex-wrap gap-x-2">
                <span className="text-muted-foreground">{formatDay(h.at)}</span>
                <span>{h.progress !== null ? `${Math.round(h.progress)}%` : ""}</span>
                <span>{h.status ? GOAL_STATUS_LABEL[h.status as keyof typeof GOAL_STATUS_LABEL] ?? h.status : ""}</span>
                {h.note ? <span className="text-muted-foreground">{h.note}</span> : null}
              </li>
            ))}
          </ol>
        ) : null}
      </div>
      <DialogFooter>
        <Button variant="quiet" onClick={onClose} disabled={busy}>
          Close
        </Button>
        <Button variant="primary" onClick={() => void save()} disabled={busy}>
          Save progress
        </Button>
      </DialogFooter>
    </>
  );
}
