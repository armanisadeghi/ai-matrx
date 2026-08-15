"use client";
import { useEffect, useState } from "react";
import { toast } from "sonner";
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
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { BrandPicker } from "@/features/marketing/components/brands/BrandPicker";
import { createInitiative, updateInitiative } from "./service";
import {
  INITIATIVE_OBJECTIVES,
  INITIATIVE_STATUSES,
  type Initiative,
} from "./types";

export function InitiativeEditorDialog({
  open,
  onOpenChange,
  organizationId,
  initiative,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string | null;
  initiative?: Initiative | null;
  onSaved: (row: Initiative) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [brandId, setBrandId] = useState<string | null>(null);
  const [objective, setObjective] = useState("awareness");
  const [goal, setGoal] = useState("");
  const [status, setStatus] = useState("draft");
  const [startsOn, setStartsOn] = useState("");
  const [endsOn, setEndsOn] = useState("");
  const [budget, setBudget] = useState("");
  const [currency, setCurrency] = useState("USD");
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    if (!open) return;
    setName(initiative?.name ?? "");
    setDescription(initiative?.description ?? "");
    setBrandId(initiative?.brand_id ?? null);
    setObjective(initiative?.objective ?? "awareness");
    setGoal(initiative?.goal ?? "");
    setStatus(initiative?.status ?? "draft");
    setStartsOn(initiative?.starts_on ?? "");
    setEndsOn(initiative?.ends_on ?? "");
    setBudget(
      initiative?.budget_amount == null ? "" : String(initiative.budget_amount),
    );
    setCurrency(initiative?.budget_currency ?? "USD");
  }, [open, initiative]);
  const save = async () => {
    if (!name.trim()) {
      toast.error("Give this initiative a name.");
      return;
    }
    if (!organizationId) {
      toast.error("Choose an organization before creating an initiative.");
      return;
    }
    if (startsOn && endsOn && endsOn < startsOn) {
      toast.error("The end date must be on or after the start date.");
      return;
    }
    setBusy(true);
    try {
      const patch = {
        name: name.trim(),
        description: description.trim() || null,
        brand_id: brandId,
        objective,
        status,
        goal: goal.trim() || null,
        starts_on: startsOn || null,
        ends_on: endsOn || null,
        budget_amount: budget ? Number(budget) : null,
        budget_currency: currency.trim().toUpperCase() || "USD",
      };
      const row = initiative
        ? await updateInitiative(initiative, patch)
        : await createInitiative({ ...patch, organization_id: organizationId });
      onSaved(row);
      onOpenChange(false);
      toast.success(initiative ? "Initiative saved" : "Initiative created");
    } catch (error) {
      toast.error("Could not save initiative", {
        description: error instanceof Error ? error.message : "Unknown error",
      });
    } finally {
      setBusy(false);
    }
  };
  return (
    <Dialog open={open} onOpenChange={(v) => !busy && onOpenChange(v)}>
      <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>
            {initiative ? "Edit initiative" : "New initiative"}
          </DialogTitle>
          <DialogDescription>
            One goal, timeline, and budget for work across channels.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <div className="space-y-1">
            <Label htmlFor="initiative-name">Name</Label>
            <Input
              id="initiative-name"
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="initiative-description">Description</Label>
            <Textarea
              id="initiative-description"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              minHeight={72}
              maxHeight={160}
            />
          </div>
          <BrandPicker
            organizationId={organizationId}
            value={brandId}
            onChange={setBrandId}
            allowAll
            label="Brand (optional)"
          />
          <div className="grid gap-3 sm:grid-cols-2">
            <FieldSelect
              label="Objective"
              value={objective}
              onChange={setObjective}
              values={INITIATIVE_OBJECTIVES}
            />
            <FieldSelect
              label="Status"
              value={status}
              onChange={setStatus}
              values={INITIATIVE_STATUSES}
            />
          </div>
          <div className="space-y-1">
            <Label htmlFor="initiative-goal">Goal</Label>
            <Input
              id="initiative-goal"
              value={goal}
              onChange={(e) => setGoal(e.target.value)}
              placeholder="What should change?"
            />
          </div>
          <div className="grid gap-3 sm:grid-cols-2">
            <DateField
              id="initiative-start"
              label="Starts"
              value={startsOn}
              onChange={setStartsOn}
            />
            <DateField
              id="initiative-end"
              label="Ends"
              value={endsOn}
              onChange={setEndsOn}
            />
          </div>
          <div className="grid grid-cols-[1fr_8rem] gap-3">
            <div className="space-y-1">
              <Label htmlFor="initiative-budget">Budget</Label>
              <Input
                id="initiative-budget"
                type="number"
                min="0"
                step="0.01"
                value={budget}
                onChange={(e) => setBudget(e.target.value)}
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="initiative-currency">Currency</Label>
              <Input
                id="initiative-currency"
                maxLength={3}
                value={currency}
                onChange={(e) => setCurrency(e.target.value)}
              />
            </div>
          </div>
        </div>
        <DialogFooter>
          <Button
            variant="outline"
            onClick={() => onOpenChange(false)}
            disabled={busy}
          >
            Cancel
          </Button>
          <Button onClick={() => void save()} disabled={busy}>
            {busy ? "Saving…" : "Save"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
function FieldSelect({
  label,
  value,
  onChange,
  values,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  values: readonly string[];
}) {
  return (
    <div className="space-y-1">
      <Label>{label}</Label>
      <Select value={value} onValueChange={onChange}>
        <SelectTrigger>
          <SelectValue />
        </SelectTrigger>
        <SelectContent>
          {values.map((v) => (
            <SelectItem key={v} value={v} className="capitalize">
              {v}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
}
function DateField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
