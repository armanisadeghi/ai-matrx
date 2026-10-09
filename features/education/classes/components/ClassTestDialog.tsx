"use client";

// features/education/classes/components/ClassTestDialog.tsx
//
// New test / edit test: a name, the units it covers (one or many) and an
// optional date. A plain Dialog (a bottom sheet on mobile by itself). The
// words "Test" and "Unit" are the organization's own (renameable scope types).

import { useState } from "react";
import { toast } from "@/lib/toast";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Chip, ChipSet, Input } from "@ai-matrx/design-system/controls";
import type { ClassPart } from "../classParts";
import type { ClassTest } from "../classTests";
import type { TestInput } from "../hooks/useClassTests";

export function ClassTestDialog({
  open,
  onOpenChange,
  initial,
  units,
  nounSingular,
  unitNounPlural,
  onSubmit,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Present → edit mode. */
  initial?: ClassTest;
  units: readonly ClassPart[];
  nounSingular: string;
  unitNounPlural: string;
  onSubmit: (value: TestInput) => Promise<void>;
}) {
  const [name, setName] = useState(initial?.name ?? "");
  const [date, setDate] = useState(initial?.date ?? "");
  const [unitIds, setUnitIds] = useState<ReadonlySet<string>>(
    new Set(initial?.unitIds ?? []),
  );
  const [busy, setBusy] = useState(false);

  const toggle = (id: string) =>
    setUnitIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const blocked = !name.trim()
    ? "Give it a name."
    : unitIds.size === 0
      ? `Pick at least one ${unitNounPlural.toLowerCase().replace(/s$/, "")}.`
      : null;

  async function save() {
    if (blocked) return;
    setBusy(true);
    try {
      await onSubmit({
        name: name.trim(),
        date: date || null,
        unitIds: units.filter((u) => unitIds.has(u.id)).map((u) => u.id),
      });
      onOpenChange(false);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => !busy && onOpenChange(o)}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>
            {initial ? `Edit ${initial.name}` : `New ${nounSingular.toLowerCase()}`}
          </DialogTitle>
          <DialogDescription className="sr-only">
            {`Name the ${nounSingular.toLowerCase()}, pick what it covers and set a date.`}
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-1">
          <div className="space-y-1.5">
            <Label htmlFor="class-test-name">Name</Label>
            <Input
              id="class-test-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Midterm"
              autoFocus
            />
          </div>
          <div className="space-y-1.5">
            <Label>{`Covers`}</Label>
            {units.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                {`Add ${unitNounPlural.toLowerCase()} to the class first.`}
              </p>
            ) : (
              <ChipSet>
                {units.map((u) => (
                  <Chip key={u.id} label={u.name} pressed={unitIds.has(u.id)} asChild>
                    <button type="button" onClick={() => toggle(u.id)} disabled={busy} />
                  </Chip>
                ))}
              </ChipSet>
            )}
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="class-test-date">Date</Label>
            <Input
              id="class-test-date"
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-44"
            />
          </div>
        </div>
        <DialogFooter>
          {blocked ? (
            <span className="mr-auto text-xs text-muted-foreground">{blocked}</span>
          ) : null}
          <Button type="button" variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button type="button" variant="primary" onClick={() => void save()} disabled={busy || !!blocked}>
            {initial ? "Save" : "Add"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
