"use client";

// "New cycle": name, the review period and the three due dates. The default template is ensured
// by the service; HR picks who is reviewed on the cycle page after it exists.

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Button, Field, Select } from "@ai-matrx/design-system/controls";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@ai-matrx/design-system";

import { hrPerformanceCycleHref, type HrOrgRef } from "@/features/hr/routes";
import { useHrKnobs } from "@/features/hr/settings/hooks/useHrKnobs";
import { ProInput } from "@/components/official/ProInput";
import { toast } from "@/lib/toast";

import { createCycle, listTemplates } from "./service";
import type { TemplateRow } from "./types";

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

/** Due dates from the organization's knob days (blank is also fine: the door takes the same days). */
export function datesFromKnobDays(today: Date, selfDays: number, managerDays: number) {
  const manager = plusDays(today, managerDays);
  return { selfDueOn: iso(plusDays(today, selfDays)), managerDueOn: iso(manager), shareDueOn: iso(plusDays(manager, 7)) };
}

const DEFAULT_TEMPLATE = "__default";

export function NewCycleDialog(props: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgRef: HrOrgRef;
}) {
  return (
    <Dialog open={props.open} onOpenChange={props.onOpenChange}>
      <DialogContent>
        <NewCycleForm {...props} />
      </DialogContent>
    </Dialog>
  );
}

function NewCycleForm({
  onOpenChange,
  organizationId,
  orgRef,
}: {
  onOpenChange: (open: boolean) => void;
  organizationId: string;
  orgRef: HrOrgRef;
}) {
  const router = useRouter();
  const [form, setForm] = useState(() => defaultCycleDates(new Date()));
  const [templates, setTemplates] = useState<TemplateRow[]>([]);
  const [templateId, setTemplateId] = useState(DEFAULT_TEMPLATE);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { knobs } = useHrKnobs({ organizationId });
  const prefilled = useRef(false);
  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value }));

  useEffect(() => {
    let live = true;
    void listTemplates(organizationId).then((r) => live && r.ok && setTemplates(r.data));
    return () => {
      live = false;
    };
  }, [organizationId]);

  // The due dates start from this employer's knob days, once, unless the person already typed.
  useEffect(() => {
    if (prefilled.current) return;
    const days = (key: string) => {
      const v = knobs.find((k) => k.key === key)?.effective_value;
      return typeof v === "number" && Number.isFinite(v) ? v : null;
    };
    const self = days("standard_review_self_days");
    const manager = days("standard_review_manager_days");
    if (self === null || manager === null) return;
    prefilled.current = true;
    setForm((f) => ({ ...f, ...datesFromKnobDays(new Date(), self, manager) }));
  }, [knobs]);

  const submit = async () => {
    if (busy) return;
    setBusy(true);
    setError(null);
    const made = await createCycle({ organizationId, ...form, templateId: templateId === DEFAULT_TEMPLATE ? null : templateId });
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
    <>
        <DialogHeader>
          <DialogTitle>New review cycle</DialogTitle>
          <DialogDescription>You choose who is reviewed on the next screen.</DialogDescription>
        </DialogHeader>
        <div className="grid gap-3">
          <ProInput aria-label="Cycle name" placeholder="H2 2026 performance review" value={form.name} onChange={set("name")} />
          {templates.length > 0 ? (
            <Select
              aria-label="Template"
              value={templateId}
              onValueChange={setTemplateId}
              options={[{ value: DEFAULT_TEMPLATE, label: "Default template" }, ...templates.map((t) => ({ value: t.templateId, label: t.name }))]}
            />
          ) : null}
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
    </>
  );
}
