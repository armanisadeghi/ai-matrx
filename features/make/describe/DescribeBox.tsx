"use client";

// features/make/describe/DescribeBox.tsx — lane CHAIR-DESCRIBE (v7): the describe box on /make.
//
// ONE SENTENCE → A COMPLETE, WORKING SETUP IN UNDER 60 s. Champions: Softr's AI app generator, Glide's
// "describe your app", Airtable Omni. Brief: common-docs projects/data-doctrine-adoption/v6/
// MANDATE-BRIEF-SENTENCE-TO-TEMPLATE.md (Arman approved 2026-10-03, "Yes. Definitely." 2026-10-05).
//
// THE PIPE (no second path):
//   1. the mandate `make.describe_template` (launched by mandate key, never an agent id — whoever holds
//      it owns its quality; this file writes no instruction) answers ONE template spec;
//   2. the package's describeCheck (automatic fixes, then validateTemplate "describe" profile) checks it — a failure is one line and a retry, never a
//      half-build;
//   3. custom.template_declare('org') files it as the organization's own template, and the gallery's
//      runTemplateDoor installs it with the gallery's own live progress and landing.
// Remove and "Save as my template" live on the template's own page (the same family), linked from the
// result.

import { useEffect, useState } from "react";
import Link from "next/link";
import { supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, type TemplateDoorAnswer } from "@ai-matrx/records/templates";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { HeadlessAgentRunError, useHeadlessAgentJson } from "@ai-matrx/chat/agents/hooks/useHeadlessAgentJson";
import { useDeclaredSurfaceMandates } from "@ai-matrx/chat/surfaces/runtime/surface-mandates";

import { Button } from "@/components/ui/button";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import * as doors from "@/features/unified-data/hub/doors";
import { createClient } from "@/utils/supabase/client";
import { enterSendsHere } from "@ai-matrx/kit/composer-keys";
import { Landing, Progress } from "../gallery/TemplateGallery";
import type { MadeObject } from "../gallery/catalogue";
import { templatePreviewHref } from "../gallery/galleryHref";

import { secondsWords } from "./made";
import { AnswerRefused } from "./describeTemplate";
import {
  applySafeReuses,
  bindReuses,
  checkDescribeTemplate,
  coerceDescribeAnswer,
  declareDescribeSpec,
  describeVariables,
  readExistingTables,
  readOrganizationFacts,
  type DescribeAnswer,
} from "./describeTemplate";

import { ProTextarea } from "@/components/official/ProTextarea";
// What the person reads when it fails — plain, no internal words; the reason is in the console and on the run.
const WRITTEN_WRONG = "That did not come out right. Try again, or say it a little differently.";
const STOPPED = "That stopped before it finished. Nothing was changed. Try again.";

const DESCRIBE = MANDATE_KEYS.make__describe_template;
const DESCRIBE_DISCLOSURE = [{ mandateKey: DESCRIBE, does: "turns your sentence into tables, forms and a booking page" }] as const;

type Run =
  | { phase: "idle" }
  | { phase: "writing"; startedAt: number }
  | { phase: "installing"; startedAt: number; templateId: string; answer: TemplateDoorAnswer | null; notes: string[] }
  | { phase: "installed"; ms: number; split: Split; templateId: string; answer: TemplateDoorAnswer; notes: string[] }
  | { phase: "failed"; why: string; templateId: string | null; answer: TemplateDoorAnswer | null };

/** Where the wait went, in ms per stage — on the result as data-make-describe-split, for timing runs. */
type Split = { provision: number; model: number; check: number; declare: number; install: number; install_calls: number };

export function DescribeBox() {
  // org-filter: write-target what the sentence makes is installed in the organization new things go to; its tables are read only to reuse them
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const writer = useHeadlessAgentJson();
  useDeclaredSurfaceMandates(DESCRIBE_DISCLOSURE);
  const [sentence, setSentence] = useState("");
  const [run, setRun] = useState<Run>({ phase: "idle" });
  // A press before the organization has loaded is KEPT, not dropped: it runs the moment the organization is ready.
  const [askOrganization, setAskOrganization] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const busy = run.phase === "writing" || run.phase === "installing";
  useEffect(() => {
    if (!busy) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [busy]);

  useEffect(() => {
    if (askOrganization && organizationId) {
      setAskOrganization(false);
      void start();
    }
    // start reads the latest sentence; it must run exactly once per kept press
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [askOrganization, organizationId]);

  const start = async () => {
    const said = sentence.trim();
    if (!said) return;
    if (!organizationId) {
      setAskOrganization(true);
      return;
    }
    setAskOrganization(false);
    const startedAt = Date.now();
    setNow(startedAt);
    setRun({ phase: "writing", startedAt });
    const client = createClient();
    const split: Split = { provision: 0, model: 0, check: 0, declare: 0, install: 0, install_calls: 0 };
    let mark = startedAt;
    const lap = (k: Exclude<keyof Split, "install_calls">) => {
      const t = Date.now();
      split[k] = t - mark;
      mark = t;
    };
    try {
      // The provision: the organization's facts and its own tables (reuse beats duplicate).
      const source = supabaseDataSource(client);
      const [facts, listed] = await Promise.all([readOrganizationFacts(client, organizationId), doors.dataHomeTables(source, organizationId)]);
      const own = listed.ok
        // org-filter: server-call the app is built in this organization, so only its own tables are reused
        ? listed.data.filter((t) => t.organization_id === organizationId && t.kind === "table" && !t.platform_owned).map((t) => ({ id: t.table_id, name: t.table_name }))
        : [];
      const tables = await readExistingTables(client, organizationId, own);
      lap("provision");

      const answer = await writer.run<DescribeAnswer>({
        mandateKey: DESCRIBE,
        surfaceKey: "make:describe",
        sourceFeature: "udt",
        expect: "json",
        initiation: "user",
        organizationId,
        variables: describeVariables(said, facts, tables),
        coerce: (v) => {
          try {
            return coerceDescribeAnswer(v);
          } catch (e) {
            throw new AnswerRefused(e instanceof Error ? e.message : String(e));
          }
        },
      });
      lap("model");

      // The check before anything is built: one line, and a retry.
      // The package's automatic fixes run first; the person sees an error only for what REMAINS.
      const safe = applySafeReuses(answer, tables);
      const checked = checkDescribeTemplate(safe.template, tables);
      lap("check");
      if (!checked.ok) {
        console.warn("[make:describe] the store's check refused the spec", checked.line, checked.problems, checked.autoFixes);
        setRun({ phase: "failed", why: WRITTEN_WRONG, templateId: null, answer: null });
        return;
      }
      const notes = [...answer.notes, ...safe.notes, ...checked.autoFixes];
      const stamp = `${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      const templateId = await declareDescribeSpec(client, organizationId, bindReuses(checked.spec, safe.reuses, tables), stamp);
      lap("declare");
      setRun({ phase: "installing", startedAt, templateId, answer: null, notes });
      const done = await runTemplateDoor(source, "template_install", organizationId, templateId, {
        onCall: (a) => setRun((r) => (r.phase === "installing" ? { ...r, answer: a } : r)),
      });
      lap("install");
      split.install_calls = done.calls;
      if (!done.ok || !done.answer) {
        const refusal = done.answer?.refusal as { message?: string } | null | undefined;
        console.error("[make:describe] the install stopped", refusal?.message ?? done.error?.message);
        setRun({ phase: "failed", why: STOPPED, templateId, answer: done.answer });
        return;
      }
      setRun({ phase: "installed", ms: Date.now() - startedAt, split, templateId, answer: done.answer, notes });
    } catch (err: unknown) {
      // The technical reason goes to the console (and, for a refused answer, onto the run itself); the person gets a plain sentence.
      const detail = (err as { detail?: string } | null)?.detail;
      console.error("[make:describe] the setup failed", err, detail);
      setRun({ phase: "failed", why: err instanceof AnswerRefused || err instanceof HeadlessAgentRunError ? WRITTEN_WRONG : STOPPED, templateId: null, answer: null });
    }
  };

  const elapsed = run.phase === "writing" || run.phase === "installing" ? secondsWords(now - run.startedAt) : null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="make-describe" data-make-describe={run.phase}>
      <h2 id="make-describe" className="sr-only">
        Describe it
      </h2>
      <ProTextarea
        value={sentence}
        onChange={(e) => setSentence(e.target.value)}
        onSubmit={() => void start()}
        submitOnEnter={enterSendsHere(true)}
        submitLabel="Make it"
        isSubmitting={busy}
        placeholder="A patient intake form that books the first visit"
        aria-label="Describe what to make"
        rows={3}
        disabled={busy}
        enableTextStats={false}
        data-make-describe-input=""
      />
      <p className="h-5 text-sm text-muted-foreground" role="status" aria-live="polite" data-make-describe-go="" data-busy={busy || undefined}>
        {run.phase === "writing" ? `Designing… ${elapsed}` : run.phase === "installing" ? `Building… ${elapsed}` : ""}
      </p>

      {askOrganization && !organizationId ? (
        <OrganizationContextNotice
          state={active.organizationState === "ready" ? "required" : active.organizationState}
          what="What you describe"
          description="New things are saved in the organization you choose"
          compact
        />
      ) : null}

      {run.phase === "installing" ? <Progress run={{ door: "template_install", answer: run.answer }} /> : null}

      {run.phase === "installed" ? (
        <div className="flex flex-col gap-2" data-make-describe-result="" data-make-describe-ms={run.ms} data-make-describe-split={JSON.stringify(run.split)}>
          <p className="text-sm font-medium text-foreground">Made in {secondsWords(run.ms)}</p>
          <Landing made={(run.answer.made ?? []) as MadeObject[]} />
          <Notes notes={run.notes} />
          <Link href={templatePreviewHref(run.templateId)} className="text-sm text-primary underline-offset-2 hover:underline" data-make-describe-template="">
            Remove or save as a template
          </Link>
        </div>
      ) : null}

      {run.phase === "failed" ? (
        <div className="flex flex-col gap-2" role="alert" data-make-describe-refusal="">
          <div className="flex flex-wrap items-center gap-2">
            <p className="min-w-0 flex-1 text-sm text-destructive">{run.why}</p>
            <Button type="button" variant="outline" onClick={() => void start()} data-make-describe-retry="">
              Try again
            </Button>
          </div>
          {run.templateId ? (
            <Link href={templatePreviewHref(run.templateId)} className="text-sm text-primary underline-offset-2 hover:underline">
              Remove what was made
            </Link>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}

/** The mandate's assumptions, one line each — what it decided for the person. */
function Notes({ notes }: { notes: string[] }) {
  if (!notes.length) return null;
  return (
    <ul className="flex flex-col gap-0.5 text-xs text-muted-foreground" data-make-describe-notes={notes.length}>
      {notes.map((n) => (
        <li key={n}>{n}</li>
      ))}
    </ul>
  );
}
