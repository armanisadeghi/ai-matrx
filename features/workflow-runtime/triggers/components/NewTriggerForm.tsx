"use client";

/**
 * NewTriggerForm — the two ways a workflow runs without you: on a SCHEDULE,
 * or when something ELSE calls it.
 *
 * The webhook secret is handled write-once by contract: the server stores it
 * encrypted and marks it `exclude=True` on every response, so no read path can
 * ever return it. We mint a strong one here (browser crypto), send it once,
 * and the caller shows it exactly once afterwards. Nothing persists it in
 * Redux, storage, or a URL.
 */

import { useMemo, useState } from "react";
import { Globe, Loader2, CalendarClock } from "lucide-react";

import { toast } from "@/lib/toast";
import { validateCron } from "@/lib/scheduler-client/next-due";
import { cn } from "@/utils/cn";

import { deriveRunForm } from "../../surface/run-form";
import type { WorkflowDefinitionLike } from "../../trigger-points";
import { flattenRunFormValues } from "../default-inputs";
import { DEFAULT_RECURRENCE, toCron, type Recurrence } from "../recurrence";
import type { CreateTriggerArgs } from "../useWorkflowTriggers";
import { generateWebhookSecret } from "../useWorkflowTriggers";
import { browserTimezone, RecurrenceEditor } from "./RecurrenceEditor";
import { TriggerDefaultInputs } from "./TriggerDefaultInputs";

type NewKind = "cron" | "webhook";

export function NewTriggerForm({
  definitionId,
  definition,
  workflowName,
  creating,
  onCreate,
  onCancel,
}: {
  definitionId: string;
  definition: WorkflowDefinitionLike;
  workflowName: string;
  creating: boolean;
  /** Resolves with the plaintext secret when one was minted, else null. */
  onCreate: (args: CreateTriggerArgs, plaintextSecret: string | null) => void;
  onCancel: () => void;
}) {
  const [kind, setKind] = useState<NewKind>("cron");
  const [name, setName] = useState(`${workflowName} — automatic`);
  const [recurrence, setRecurrence] = useState<Recurrence>(DEFAULT_RECURRENCE);
  const [timezone, setTimezone] = useState<string>(browserTimezone());
  const [values, setValues] = useState<Record<string, Record<string, unknown>>>(
    {},
  );

  const sections = useMemo(() => deriveRunForm(definition), [definition]);
  const expression = toCron(recurrence);
  const cronError =
    kind === "cron"
      ? expression
        ? validateCron(expression, timezone)
        : "Pick how often it should run"
      : null;

  const submit = () => {
    if (!name.trim()) {
      toast.error("Give it a name so you can recognize it later.");
      return;
    }
    if (kind === "cron" && cronError) {
      toast.error("That schedule isn't valid yet.");
      return;
    }
    const defaultInputs = flattenRunFormValues(sections, values);
    if (kind === "webhook") {
      const secret = generateWebhookSecret();
      onCreate(
        {
          definitionId,
          name: name.trim(),
          kind: "webhook",
          webhookSecret: secret,
          defaultInputs,
        },
        secret,
      );
      return;
    }
    onCreate(
      {
        definitionId,
        name: name.trim(),
        kind: "cron",
        cronExpression: expression,
        timezone,
        defaultInputs,
      },
      null,
    );
  };

  return (
    <div className="space-y-4 rounded-xl border border-border bg-card p-4">
      <div className="grid gap-2 sm:grid-cols-2">
        <KindChoice
          selected={kind === "cron"}
          icon={<CalendarClock className="h-4 w-4" />}
          title="On a schedule"
          detail="It runs by itself, on the days and times you pick."
          onSelect={() => setKind("cron")}
        />
        <KindChoice
          selected={kind === "webhook"}
          icon={<Globe className="h-4 w-4" />}
          title="When something calls it"
          detail="Another tool or website starts it by calling an address."
          onSelect={() => setKind("webhook")}
        />
      </div>

      <label className="block">
        <span className="text-xs font-medium text-muted-foreground">
          What should we call it?
        </span>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={255}
          className="mt-1 block w-full max-w-sm rounded-md border border-border bg-background p-2 text-base"
        />
      </label>

      {kind === "cron" ? (
        <RecurrenceEditor
          recurrence={recurrence}
          timezone={timezone}
          onRecurrenceChange={setRecurrence}
          onTimezoneChange={setTimezone}
        />
      ) : (
        <p className="rounded-lg border border-border bg-muted/40 p-2.5 text-xs text-muted-foreground">
          When you save this, you get a web address and a password to go with
          it. Whoever has both can start this workflow. The password is shown
          once and never again — copy it somewhere safe.
        </p>
      )}

      <div className="border-t border-border pt-3">
        <h3 className="text-sm font-semibold text-foreground">
          What should it work with?
        </h3>
        <p className="mb-2 mt-0.5 text-[11px] text-muted-foreground">
          These are the answers it uses every time it runs on its own.
        </p>
        <TriggerDefaultInputs
          definition={definition}
          values={values}
          onChange={(nodeId, key, value) =>
            setValues((prev) => ({
              ...prev,
              [nodeId]: { ...prev[nodeId], [key]: value },
            }))
          }
        />
      </div>

      <div className="flex items-center gap-2 border-t border-border pt-3">
        <button
          type="button"
          disabled={creating}
          onClick={submit}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground disabled:opacity-50"
        >
          {creating ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : null}
          {creating ? "Saving…" : "Turn it on"}
        </button>
        <button
          type="button"
          onClick={onCancel}
          className="min-h-9 rounded-lg border border-border px-3 text-sm text-foreground"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}

function KindChoice({
  selected,
  icon,
  title,
  detail,
  onSelect,
}: {
  selected: boolean;
  icon: React.ReactNode;
  title: string;
  detail: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onSelect}
      className={cn(
        "rounded-lg border p-3 text-left transition-colors",
        selected
          ? "border-primary bg-primary/5"
          : "border-border hover:bg-accent",
      )}
    >
      <span className="flex items-center gap-1.5 text-sm font-medium text-foreground">
        {icon}
        {title}
      </span>
      <span className="mt-0.5 block text-[11px] text-muted-foreground">
        {detail}
      </span>
    </button>
  );
}
