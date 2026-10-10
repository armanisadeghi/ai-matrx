"use client";

// "New cycle": name, the review period and the three due dates. The default template is ensured
// by the service; HR picks who is reviewed on the cycle page after it exists.

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field } from "@ai-matrx/design-system/controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ai-matrx/design-system";

import { hrPerformanceCycleHref, type HrOrgRef } from "@/features/hr/routes";
import { toast } from "@/lib/toast";

import { createCycle } from "./service";

const iso = (d: Date) => d.toISOString().slice(0, 10);
const plusDays = (d: Date, n: number) => new Date(d.getTime() + n * 86_400_000);

/** The half-year containing `today`, and due dates two, three and four weeks out. */
export function defaultCycleDates(today: Date) {
  const year = today.getUTCFullYear();
  const first = today.getUTCMonth() < 6;
  return {
    name: `${first ? "H1" : "H2"} ${year} performance review`,
    periodStart: `${year}-${first ? "01-01" : "07-01"}`,
    periodEnd: `${year}-${first ? "06-30" : "12-31"}`,
    selfDueOn: iso(plusDays(today, 14)),
    managerDueOn: iso(plusDays(today, 21)),
    shareDueOn: iso(plusDays(today, 28)),
  };
}

export function NewCycleDialog({
  open,
  onOpenChange,
  organizationId,
  orgRef,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgRef: HrOrgRef;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => defaultCycleDates(new Date()));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const made = await createCycle({ organizationId, ...form });
    setBusy(false);
    if (!made.ok) {
      setError(made.message);
      return;
    }
    toast.success("Cycle created");
    onOpenChange(false);
    router.push(hrPerformanceCycleHref(made.data, orgRef));
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>New review cycle</DialogTitle>
          <DialogDescription>You choose who is reviewed on the next screen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <Field aria-label="Cycle name" placeholder="H2 2026 performance review" value={form.name} onChange={set("name")} />
          <div className="grid grid-cols-2 gap-3">
            <label className="grid gap-1 text-xs text-muted-foreground">
              Period starts
              <Field type="date" aria-label="Period starts" value={form.periodStart} onChange={set("periodStart")} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Period ends
              <Field type="date" aria-label="Period ends" value={form.periodEnd} onChange={set("periodEnd")} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Self reviews due
              <Field type="date" aria-label="Self reviews due" value={form.selfDueOn} onChange={set("selfDueOn")} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Manager reviews due
              <Field type="date" aria-label="Manager reviews due" value={form.managerDueOn} onChange={set("managerDueOn")} />
            </label>
            <label className="grid gap-1 text-xs text-muted-foreground">
              Share with employees by
              <Field type="date" aria-label="Share with employees by" value={form.shareDueOn} onChange={set("shareDueOn")} />
            </label>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
        </div>
        <DialogFooter>
          <Button variant="quiet" onClick={() => onOpenChange(false)} disabled={busy}>
            Cancel
          </Button>
          <Button variant="primary" onClick={() => void submit()} disabled={busy || form.name.trim() === ""}>
            Create cycle
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
