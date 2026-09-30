"use client";

/**
 * "Crisis: holding statement" — the reputation surface's guided intake.
 *
 * Pre-filled from the brand (the organization's name exactly as held, the
 * spokesperson, the press contact). Runs `seo.reputation_crisis_holding`
 * through aidream's streamed door; the server applies the counsel gate (a
 * trigger AND no counsel yet → the stop block), recomputes word counts and the
 * valid-until from the org's decay knobs. "Draft for counsel anyway" re-runs
 * with `counsel_review_mode` and returns the watermarked full set.
 */

import { useState } from "react";
import { Plus, ShieldAlert, Trash2 } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Input } from "@ai-matrx/design-system";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Textarea } from "@/components/ui/textarea";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useBrand, useBusinessFacts } from "@/features/marketing/data/hooks";
import { useAppDispatch } from "@/lib/redux/hooks";

import {
  draftCrisisHolding,
  type CrisisHoldingResult,
  type Stage,
} from "@/features/marketing/pr/media-desk/api";
import { StageList } from "@/features/marketing/pr/media-desk/StageList";
import { forgetRun, rememberRun, useRejoinRun } from "@/features/marketing/pr/media-desk/rejoin";
import {
  AUDIENCES,
  INCIDENT_TYPES,
  LEGAL_STATUSES,
  MEDIA_TIMINGS,
  brandPrefill,
  emptyIntake,
  missingIntake,
  toWire,
  type IntakeForm,
} from "./crisis-intake";
import { CrisisHoldingView } from "./CrisisHoldingView";

function Field({
  id,
  label,
  hint,
  children,
}: {
  id: string;
  label: string;
  hint?: string;
  children: React.ReactNode;
}) {
  return (
    <div className="grid gap-1">
      <Label htmlFor={id}>{label}</Label>
      {children}
      {hint ? <p className="text-[11px] text-muted-foreground">{hint}</p> : null}
    </div>
  );
}

function Choice({
  id,
  value,
  options,
  onChange,
}: {
  id: string;
  value: string;
  options: ReadonlyArray<readonly [string, string]>;
  onChange: (v: string) => void;
}) {
  return (
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger id={id} className="h-9">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        {options.map(([key, label]) => (
          <SelectItem key={key} value={key}>
            {label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

export function CrisisIntakeForm({
  form,
  setForm,
  disabled,
}: {
  form: IntakeForm;
  setForm: (next: IntakeForm) => void;
  disabled: boolean;
}) {
  const set = <K extends keyof IntakeForm>(key: K, value: IntakeForm[K]) => setForm({ ...form, [key]: value });
  const text = (key: keyof IntakeForm, rows = 3) => (
    <Textarea
      id={`crisis-${key}`}
      value={String(form[key] ?? "")}
      onChange={(e) => set(key, e.target.value as never)}
      rows={rows}
      disabled={disabled}
      className="text-base sm:text-sm"
    />
  );
  return (
    <div className="grid gap-3" data-testid="crisis-intake-form">
      <Field id="crisis-incident_summary" label="What happened" hint="One to three plain sentences.">
        {text("incident_summary", 2)}
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="crisis-type" label="What kind of incident">
          <Choice id="crisis-type" value={form.incident_type} options={INCIDENT_TYPES} onChange={(v) => set("incident_type", v)} />
        </Field>
        <Field id="crisis-first-known" label="When you first knew">
          <Input
            id="crisis-first-known"
            type="datetime-local"
            value={form.first_known_at}
            onChange={(e) => set("first_known_at", e.target.value)}
            disabled={disabled}
            className="text-base sm:text-sm"
          />
        </Field>
        <Field id="crisis-org" label="Organization name, exactly">
          <Input id="crisis-org" value={form.org_name} onChange={(e) => set("org_name", e.target.value)} disabled={disabled} className="text-base sm:text-sm" />
        </Field>
        <Field id="crisis-role" label="Your role">
          <Input
            id="crisis-role"
            value={form.person_role}
            onChange={(e) => set("person_role", e.target.value)}
            placeholder="e.g. Founder"
            disabled={disabled}
            className="text-base sm:text-sm"
          />
        </Field>
      </div>
      <fieldset>
        <legend className="mb-1 text-sm font-medium">Who needs to hear from you</legend>
        <div className="flex flex-wrap gap-3">
          {AUDIENCES.map((a) => (
            <label key={a} className="flex items-center gap-1.5 text-xs capitalize">
              <Checkbox
                checked={form.audiences.includes(a)}
                disabled={disabled}
                onCheckedChange={(on) =>
                  set("audiences", on === true ? [...form.audiences, a] : form.audiences.filter((x) => x !== a))
                }
              />
              {a}
            </label>
          ))}
        </div>
      </fieldset>
      <Field id="crisis-known_facts" label="What is confirmed" hint="Only what you know for certain. Nothing else is ever stated.">
        {text("known_facts")}
      </Field>
      <Field id="crisis-unknowns" label="What is not yet known or verified" hint="These become honest non-answers, never claims.">
        {text("unknowns")}
      </Field>
      <Field id="crisis-actions_taken" label="What has been done">
        {text("actions_taken", 2)}
      </Field>
      <Field id="crisis-actions_committed" label="What you have committed to, with times (optional)" hint="Leave empty and no commitment is made.">
        {text("actions_committed", 2)}
      </Field>
      <fieldset className="grid gap-1.5">
        <legend className="text-sm font-medium">People involved (optional)</legend>
        {form.people_involved.map((p, i) => (
          <div key={i} className="flex flex-wrap items-center gap-2">
            <Input
              aria-label="Name"
              placeholder="Name"
              value={p.name}
              onChange={(e) => set("people_involved", form.people_involved.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))}
              disabled={disabled}
              className="h-8 w-40 text-base sm:text-sm"
            />
            <Input
              aria-label="Role"
              placeholder="Role"
              value={p.role}
              onChange={(e) => set("people_involved", form.people_involved.map((x, j) => (j === i ? { ...x, role: e.target.value } : x)))}
              disabled={disabled}
              className="h-8 w-32 text-base sm:text-sm"
            />
            <label className="flex items-center gap-1 text-xs">
              <Checkbox
                checked={p.consented}
                disabled={disabled}
                onCheckedChange={(on) =>
                  set("people_involved", form.people_involved.map((x, j) => (j === i ? { ...x, consented: on === true } : x)))
                }
              />
              Agreed to be named
            </label>
            <Button
              type="button"
              size="icon"
              variant="ghost"
              className="h-7 w-7"
              aria-label="Remove person"
              onClick={() => set("people_involved", form.people_involved.filter((_, j) => j !== i))}
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          size="sm"
          variant="ghost"
          className="h-7 w-fit text-[11px]"
          disabled={disabled}
          onClick={() => set("people_involved", [...form.people_involved, { name: "", role: "", consented: false }])}
        >
          <Plus className="mr-1 h-3 w-3" /> Add a person
        </Button>
      </fieldset>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="crisis-legal" label="Legal status">
          <Choice id="crisis-legal" value={form.legal_status} options={LEGAL_STATUSES} onChange={(v) => set("legal_status", v)} />
        </Field>
        <Field id="crisis-media" label="Press timing">
          <Choice id="crisis-media" value={form.media_timing} options={MEDIA_TIMINGS} onChange={(v) => set("media_timing", v)} />
        </Field>
      </div>
      <Field id="crisis-regulatory_exposure" label="Regulators or laws in play (optional)" hint="e.g. HIPAA, CCPA, OSHA, a state attorney general.">
        <Input
          id="crisis-regulatory_exposure"
          value={form.regulatory_exposure ?? ""}
          onChange={(e) => set("regulatory_exposure", e.target.value)}
          disabled={disabled}
          className="text-base sm:text-sm"
        />
      </Field>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field id="crisis-spokes" label="Spokesperson" hint="From the brand's facts; change it if someone else will speak.">
          <Input id="crisis-spokes" value={form.spokesperson ?? ""} onChange={(e) => set("spokesperson", e.target.value)} disabled={disabled} className="text-base sm:text-sm" />
        </Field>
        <Field id="crisis-contact" label="Press contact">
          <Input id="crisis-contact" value={form.press_contact ?? ""} onChange={(e) => set("press_contact", e.target.value)} disabled={disabled} className="text-base sm:text-sm" />
        </Field>
      </div>
      <details>
        <summary className="cursor-pointer text-xs text-muted-foreground">Anything already said, tone, an earlier draft (optional)</summary>
        <div className="mt-2 grid gap-3">
          <Field id="crisis-prior_statement" label="Anything already said publicly, word for word">
            {text("prior_statement", 2)}
          </Field>
          <Field id="crisis-tone_constraints" label="Tone the company needs">
            {text("tone_constraints", 1)}
          </Field>
          <Field id="crisis-prior_draft" label="An earlier holding draft, with its valid-until">
            {text("prior_draft", 2)}
          </Field>
        </div>
      </details>
    </div>
  );
}

export function CrisisHoldingDialog({
  siteId,
  brandId,
  organizationId,
}: {
  siteId: string;
  brandId: string;
  organizationId: string;
}) {
  const dispatch = useAppDispatch();
  const brand = useBrand(brandId);
  const facts = useBusinessFacts(brandId);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<IntakeForm | null>(null);
  const [stages, setStages] = useState<Stage[]>([]);
  const [running, setRunning] = useState(false);
  const [ownResult, setResult] = useState<CrisisHoldingResult | null>(null);
  const runKey = `crisis:${siteId}`;
  const rejoin = useRejoinRun<CrisisHoldingResult>(runKey, open && !ownResult);
  const result = ownResult ?? rejoin.result;
  const [error, setError] = useState<string | null>(null);

  const prefillReady = !brand.isLoading && !facts.isLoading;
  const current = form ?? (prefillReady ? emptyIntake(brandPrefill(brand.data?.name, facts.data), new Date()) : null);
  const missing = current ? missingIntake(current) : [];

  const run = async (counselReviewMode: boolean) => {
    if (!current) return;
    setRunning(true);
    setStages([]);
    setError(null);
    rejoin.clear();
    if (!counselReviewMode) setResult(null);
    try {
      const done = await draftCrisisHolding(
        dispatch,
        siteId,
        { intake: toWire(current), counsel_review_mode: counselReviewMode },
        {
          onStage: (stage) => setStages((prev) => [...prev, stage]),
          onRun: (runId) => rememberRun(runKey, runId),
        },
      );
      forgetRun(runKey);
      setResult(done);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setRunning(false);
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (running && !next) return;
        setOpen(next);
      }}
    >
      <DialogTrigger asChild>
        <Button variant="outline" size="sm" className="h-8" data-testid="crisis-holding-open">
          <ShieldAlert className="mr-1.5 h-3.5 w-3.5" /> Crisis: holding statement
        </Button>
      </DialogTrigger>
      <DialogContent className="max-h-[92dvh] max-w-3xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Crisis: holding statement</DialogTitle>
          <DialogDescription>
            The goal is to keep the next four hours from making things worse, not to sound good. Only what you confirm is
            ever stated. If the incident needs a lawyer first, you are told so, and you can still get a draft marked for
            counsel.
          </DialogDescription>
        </DialogHeader>
        {!current ? (
          <StageList stages={[{ kind: "prefill", label: "Reading the brand's name, spokesperson and press contact" }]} running />
        ) : result && !running ? null : (
          <CrisisIntakeForm form={current} setForm={setForm} disabled={running} />
        )}
        {rejoin.following && !running ? (
          <StageList
            stages={[
              {
                kind: "rejoin",
                label: `Picking up the draft you started at ${new Date(rejoin.following.startedAt).toLocaleTimeString()} — it kept running while you were away`,
              },
            ]}
            running
          />
        ) : null}
        <StageList stages={stages} running={running} />
        {error ?? rejoin.error ? (
          <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs text-destructive">
            <span>{error ?? rejoin.error}</span>
            <ErrorAlchemyMenu error={error ?? rejoin.error ?? ""} />
          </div>
        ) : null}
        {result ? (
          <CrisisHoldingView
            result={result}
            organizationId={organizationId}
            onDraftAnyway={() => void run(true)}
            drafting={running}
          />
        ) : null}
        <div className="flex flex-wrap items-center justify-end gap-2 border-t border-border pt-3">
          {result && !running ? (
            <Button variant="ghost" size="sm" onClick={() => {
                setResult(null);
                rejoin.clear();
              }}>
              Edit the intake
            </Button>
          ) : null}
          {!result ? (
            <>
              {missing.length ? (
                <p className="mr-auto text-[11px] text-muted-foreground">Not filled in yet: {missing.join(", ")}. You can still draft; anything missing is marked for you to confirm.</p>
              ) : null}
              <Button onClick={() => void run(false)} disabled={running || !current} data-testid="crisis-draft">
                {running ? "Drafting…" : "Draft holding statement"}
              </Button>
            </>
          ) : null}
        </div>
      </DialogContent>
    </Dialog>
  );
}
