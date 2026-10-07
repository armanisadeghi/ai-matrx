"use client";

import { useEffect, useState } from "react";
import {
  Button,
  RegionSkeleton,
  Select,
} from "@ai-matrx/design-system/controls";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { ErrorNotice } from "@/components/errors/ErrorNotice";
import { formatCents } from "../catalog/format";
import type { CatalogPlan } from "../catalog/types";
import { formatMoney } from "@ai-matrx/kit/format";

type Preview = {
  targetPlanKey: string;
  targetPriceId: string;
  targetAmount: number;
  currency: string;
  effectiveAt: number;
  quantity: number;
};
type Scheduled = {
  scheduleId: string;
  effectiveAt: number;
  targetPriceId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function readPreview(value: unknown): Preview | null {
  if (
    !isRecord(value) ||
    typeof value.targetPlanKey !== "string" ||
    typeof value.targetPriceId !== "string" ||
    typeof value.targetAmount !== "number" ||
    typeof value.currency !== "string" ||
    typeof value.effectiveAt !== "number" ||
    typeof value.quantity !== "number"
  )
    return null;
  return {
    targetPlanKey: value.targetPlanKey,
    targetPriceId: value.targetPriceId,
    targetAmount: value.targetAmount,
    currency: value.currency,
    effectiveAt: value.effectiveAt,
    quantity: value.quantity,
  };
}

function readScheduled(value: unknown): Scheduled | null {
  if (
    !isRecord(value) ||
    typeof value.scheduleId !== "string" ||
    typeof value.effectiveAt !== "number" ||
    typeof value.targetPriceId !== "string"
  )
    return null;
  return {
    scheduleId: value.scheduleId,
    effectiveAt: value.effectiveAt,
    targetPriceId: value.targetPriceId,
  };
}

function dateLabel(unix: number): string {
  return new Date(unix * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export function ScheduledPlanChange({
  currentPlanKey,
  currentInterval,
  plans,
}: {
  currentPlanKey: string;
  currentInterval: "month" | "year" | null;
  plans: CatalogPlan[];
}) {
  const current = plans.find((plan) => plan.planKey === currentPlanKey);
  const [choice, setChoice] = useState<string>("");
  const [preview, setPreview] = useState<Preview | null>(null);
  const [scheduled, setScheduled] = useState<Scheduled | null>(null);
  const [managedElsewhere, setManagedElsewhere] = useState(false);
  const [scheduleLoading, setScheduleLoading] = useState(true);
  const [busy, setBusy] = useState<"preview" | "confirm" | "undo" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const candidates = plans.filter(
    (plan) =>
      plan.audience === "personal" &&
      !!current &&
      plan.rank <= current.rank &&
      (plan.monthlyCents ?? 0) > 0,
  );

  useEffect(() => {
    let active = true;
    void fetch("/api/stripe/scheduled-change")
      .then(async (response) => {
        const body: unknown = await response.json();
        if (!response.ok || !body || typeof body !== "object")
          throw new Error("Scheduled billing changes could not be loaded.");
        if (active && "scheduled" in body)
          setScheduled(readScheduled(body.scheduled));
        if (
          active &&
          "managedElsewhere" in body &&
          body.managedElsewhere === true
        )
          setManagedElsewhere(true);
      })
      .catch((reason: unknown) => {
        if (active)
          setError(
            reason instanceof Error
              ? reason.message
              : "Scheduled billing changes could not be loaded.",
          );
      })
      .finally(() => {
        if (active) setScheduleLoading(false);
      });
    return () => {
      active = false;
    };
  }, []);

  const selected =
    candidates.find(
      (plan) =>
        `${plan.planKey}:monthly` === choice ||
        `${plan.planKey}:annual` === choice,
    ) ?? null;
  async function loadPreview() {
    if (!selected) return;
    setBusy("preview");
    setError(null);
    try {
      const cycle = choice.endsWith(":annual") ? "annual" : "monthly";
      const response = await fetch("/api/stripe/scheduled-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "preview",
          planKey: selected.planKey,
          cycle,
        }),
      });
      const body: unknown = await response.json();
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !("preview" in body)
      )
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "That plan change could not be previewed.",
        );
      const nextPreview = readPreview(body.preview);
      if (!nextPreview)
        throw new Error("That plan change preview was incomplete. Try again.");
      setPreview(nextPreview);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That plan change could not be previewed.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function confirm() {
    if (!preview || !selected) return;
    setBusy("confirm");
    setError(null);
    try {
      const cycle = choice.endsWith(":annual") ? "annual" : "monthly";
      const response = await fetch("/api/stripe/scheduled-change", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "confirm",
          planKey: selected.planKey,
          cycle,
        }),
      });
      const body: unknown = await response.json();
      if (
        !response.ok ||
        !body ||
        typeof body !== "object" ||
        !("scheduled" in body)
      )
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "That plan change could not be scheduled.",
        );
      const nextScheduled = readScheduled(body.scheduled);
      if (!nextScheduled)
        throw new Error(
          "That scheduled plan change was incomplete. Try again.",
        );
      setScheduled(nextScheduled);
      setPreview(null);
      setChoice("");
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That plan change could not be scheduled.",
      );
    } finally {
      setBusy(null);
    }
  }
  async function undo() {
    setBusy("undo");
    setError(null);
    try {
      const response = await fetch("/api/stripe/scheduled-change", {
        method: "DELETE",
      });
      const body: unknown = await response.json();
      if (!response.ok)
        throw new Error(
          body &&
            typeof body === "object" &&
            "error" in body &&
            typeof body.error === "string"
            ? body.error
            : "That scheduled change could not be undone.",
        );
      setScheduled(null);
    } catch (reason) {
      setError(
        reason instanceof Error
          ? reason.message
          : "That scheduled change could not be undone.",
      );
    } finally {
      setBusy(null);
    }
  }

  if (!current || !currentInterval) return null;
  if (scheduleLoading)
    return (
      <RegionSkeleton aria-label="Loading scheduled plan changes" count={2} />
    );
  if (managedElsewhere)
    return (
      <p className="mt-3 text-sm text-muted-foreground">
        A future plan change is already managed in billing.
      </p>
    );
  if (scheduled)
    return (
      <div className="mt-4 rounded-md border border-border p-3 text-sm">
        <p className="font-medium text-foreground">
          Your plan change is scheduled for {dateLabel(scheduled.effectiveAt)}.
        </p>
        <p className="mt-1 text-muted-foreground">
          Your current plan and price remain in effect until then.
        </p>
        <Button
          className="mt-3"
          variant="outline"
          disabled={busy === "undo"}
          onClick={() => void undo()}
        >
          {busy === "undo" ? "Undoing…" : "Undo scheduled change"}
        </Button>
        {error ? <ErrorNotice size="inline" message={error} /> : null}
      </div>
    );
  return (
    <div className="mt-4 space-y-3 rounded-md border border-border p-3">
      <div>
        <p className="text-sm font-medium text-foreground">
          Change plan at renewal
        </p>
        <p className="mt-1 text-sm text-muted-foreground">
          Changes apply at renewal; no charge today.
        </p>
      </div>
      <Select
        aria-label="Choose your next plan"
        value={choice}
        onValueChange={setChoice}
        options={[
          { value: "", label: "Choose next plan" },
          ...candidates.flatMap((plan) => [
            {
              value: `${plan.planKey}:monthly`,
              label: `${plan.name} · ${formatCents(plan.monthlyCents!)} monthly`,
            },
            ...(plan.annualCents
              ? [
                  {
                    value: `${plan.planKey}:annual`,
                    label: `${plan.name} · ${formatCents(plan.annualCents!)} per month, billed annually`,
                  },
                ]
              : []),
          ]),
        ]}
      />
      <Button
        variant="outline"
        disabled={!selected || busy === "preview"}
        onClick={() => void loadPreview()}
      >
        {busy === "preview" ? "Checking change…" : "Review change"}
      </Button>
      {error ? <ErrorNotice size="inline" message={error} /> : null}
      <ConfirmDialog
        open={!!preview}
        onOpenChange={(open) => {
          if (!open && busy !== "confirm") setPreview(null);
        }}
        title="Schedule this plan change?"
        description={
          preview && selected
            ? `${selected.name} will begin on ${dateLabel(preview.effectiveAt)} at ${formatMoney(preview.targetAmount, { currency: preview.currency, unit: "minor" })}. Your current plan stays active until then, and no charge is made today.`
            : ""
        }
        confirmLabel="Schedule change"
        cancelLabel="Keep current plan"
        busy={busy === "confirm"}
        onConfirm={() => void confirm()}
      />
    </div>
  );
}
