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
//   2. validateTemplate ("describe" profile) checks it — a failure is one line and a retry, never a
//      half-build;
//   3. custom.template_declare('org') files it as the organization's own template, and the gallery's
//      runTemplateDoor installs it with the gallery's own live progress and landing.
// Remove and "Save as my template" live on the template's own page (the same family), linked from the
// result.

import { useEffect, useState } from "react";
import Link from "next/link";
import { ArrowRight } from "lucide-react";
import { supabaseDataSource } from "@ai-matrx/records/core";
import { runTemplateDoor, type TemplateDoorAnswer } from "@ai-matrx/records/templates";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useHeadlessAgentJson } from "@ai-matrx/chat/agents/hooks/useHeadlessAgentJson";
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
import {
  bindReuses,
  checkDescribeSpec,
  coerceDescribeAnswer,
  declareDescribeSpec,
  describeSpec,
  describeVariables,
  readExistingTables,
  readOrganizationFacts,
  type DescribeAnswer,
} from "./describeTemplate";

import { ProTextarea } from "@/components/official/ProTextarea";
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
  const [askOrganization, setAskOrganization] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  const busy = run.phase === "writing" || run.phase === "installing";
  useEffect(() => {
    if (!busy) return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    return () => clearInterval(tick);
  }, [busy]);

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
        ? listed.data.filter((t) => t.organization_id === organizationId && t.kind === "table" && !t.kept_by_the_app).map((t) => ({ id: t.table_id, name: t.table_name }))
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
        coerce: (v) => coerceDescribeAnswer(v),
      });
      lap("model");

      // The check before anything is built: one line, and a retry.
      const spec = describeSpec(answer.template);
      const checked = checkDescribeSpec(spec);
      lap("check");
      if (!checked.ok) {
        console.warn("[make:describe] the store's check refused the spec", checked.problems);
        setRun({ phase: "failed", why: checked.line, templateId: null, answer: null });
        return;
      }
      const stamp = `${startedAt.toString(36)}${Math.random().toString(36).slice(2, 6)}`.toUpperCase();
      const templateId = await declareDescribeSpec(client, organizationId, bindReuses(spec, answer.reuses, tables), stamp);
      lap("declare");
      setRun({ phase: "installing", startedAt, templateId, answer: null, notes: answer.notes });
      const done = await runTemplateDoor(source, "template_install", organizationId, templateId, {
        onCall: (a) => setRun((r) => (r.phase === "installing" ? { ...r, answer: a } : r)),
      });
      lap("install");
      split.install_calls = done.calls;
      if (!done.ok || !done.answer) {
        const refusal = done.answer?.refusal as { message?: string } | null | undefined;
        setRun({ phase: "failed", why: refusal?.message ?? done.error?.message ?? "The install stopped before it finished.", templateId, answer: done.answer });
        return;
      }
      setRun({ phase: "installed", ms: Date.now() - startedAt, split, templateId, answer: done.answer, notes: answer.notes });
    } catch (err: unknown) {
      const detail = (err as { detail?: string } | null)?.detail;
      setRun({ phase: "failed", why: [err instanceof Error ? err.message : String(err), detail].filter(Boolean).join(" — "), templateId: null, answer: null });
    }
  };

  const elapsed = run.phase === "writing" || run.phase === "installing" ? secondsWords(now - run.startedAt) : null;
  return (
    <section className="flex flex-col gap-2" aria-labelledby="make-describe" data-make-describe={run.phase}>
      <h2 id="make-describe" className="sr-only">
        Describe it
      </h2>
      <form
        className="relative"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <ProTextarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && enterSendsHere(true)) {
              e.preventDefault();
              void start();
            }
          }}
          placeholder="A patient intake form that books the first visit"
          aria-label="Describe what to make"
          rows={3}
          disabled={busy}
          className="w-full resize-none pb-12"
          data-make-describe-input=""
        />
        <div className="absolute bottom-2 right-2">
          <Button iconEnd={busy ? null : <ArrowRight aria-hidden />} variant="primary" type="submit" disabled={busy || !sentence.trim()} aria-busy={busy || undefined} data-make-describe-go="">
            {run.phase === "writing" ? `Designing… ${elapsed}` : run.phase === "installing" ? `Building… ${elapsed}` : "Make it"}
          </Button>
        </div>
      </form>

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
            <Button type="submit" variant="outline" onClick={() => void start()} data-make-describe-retry="">
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
