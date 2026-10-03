"use client";

// features/make/describe/DescribeBox.tsx — LANE MAKE-HOME (v6), wave 3: the describe box on /make.
//
// ONE SENTENCE → A WORKING TABLE, FORM AND BOOKING PAGE. Champions: Softr's AI app generator, Glide's
// "describe your app", Airtable Omni. Bar: under 60 s, every object openable from the result.
//
// WHY THIS IS LEGAL UNDER "AGENTS NEVER AUTHOR AGENTS" (common-docs/policies/agents-never-author-agents.md).
// No agent is created, and no instruction is written here. The person's own sentence is sent, as
// the person's own message, to the EXISTING Data page agent through its EXISTING mandate
// `data.page_guidance` (aidream services/mandates/client_mandates.py: "Turn one plain sentence from a
// non-technical expert into a live form, booking page, portal or dashboard … built through the
// records tool"). That agent already carries the server's `records` tool, whose `form_propose` and
// `booking_propose` each make their table, typed fields and published link in one call, stamped
// `agent` on behalf of the person by the server — never by this browser. Launching by mandate
// (never an agent id) keeps whoever holds that mandate in charge of its quality.
//
// WHAT THIS FILE OWNS is mechanical: the organization (asked first, never defaulted — A3), the
// store switch, the clock, the live list of what has appeared so far (polled from the data home's
// own doors, `made.ts`), and the agent's own words when it made nothing or the run failed (C3: a
// refusal is shown in its plain sentence, never swallowed).

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { ArrowRight, ExternalLink } from "lucide-react";
import { supabaseDataSource } from "@ai-matrx/records/core";
import { MANDATE_KEYS } from "@ai-matrx/agents/mandates";
import { useAgentLauncher } from "@ai-matrx/chat/agents/hooks/useAgentLauncher";
import { selectRequest } from "@ai-matrx/chat/agents/redux/execution-system/active-requests/active-requests.selectors";

import { Button } from "@/components/ui/button";
import { Textarea } from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import { useOrganizationRequired } from "@/features/organizations/useOrganizationRequired";
import { OrganizationContextNotice } from "@/features/organizations/components/OrganizationRequiredNotice";
import { UNIFIED_DATA_CAMPAIGN } from "@/lib/knobs/unifiedDataCampaign";
import * as doors from "@/features/unified-data/hub/doors";
import { KindIcon } from "@/features/unified-data/home/dataHomeColumns";
import { createClient } from "@/utils/supabase/client";

import { madeSince, secondsWords, snapshotOf, type MadeThing, type StoreSnapshot } from "./made";

/** How often the store is read while the agent works: each new thing appears as it lands. */
const POLL_MS = 3_000;

type Run =
  | { phase: "idle" }
  | { phase: "running"; startedAt: number; organizationId: string; before: StoreSnapshot; made: MadeThing[]; requestId: string | null }
  | { phase: "done"; ms: number; made: MadeThing[]; reply: string; requestId: string | null }
  | { phase: "failed"; why: string; made: MadeThing[] };

async function readStore(organizationId: string) {
  const source = supabaseDataSource(createClient());
  const [tables, items] = await Promise.all([
    doors.dataHomeTables(source, organizationId),
    doors.dataHomeItems(source, organizationId),
  ]);
  if (!tables.ok) return { ok: false as const, why: doors.doorFailureLine(tables.error) };
  if (!items.ok) return { ok: false as const, why: doors.doorFailureLine(items.error) };
  return { ok: true as const, tables: tables.data, items: items.data };
}

export function DescribeBox() {
  const userId = useAppSelector(selectUserId);
  // org-filter: write-target what the sentence makes is saved in the organization new things go to; nothing is read through it
  const active = useOrganizationRequired();
  const organizationId = active.organizationState === "ready" ? active.organizationId : null;
  const { launchMandate } = useAgentLauncher();
  const [sentence, setSentence] = useState("");
  const [run, setRun] = useState<Run>({ phase: "idle" });
  const [askOrganization, setAskOrganization] = useState(false);
  const [now, setNow] = useState(() => Date.now());
  const runRef = useRef(run);
  runRef.current = run;

  const requestId = run.phase === "running" || run.phase === "done" ? run.requestId : null;
  const request = useAppSelector((state) => (requestId ? selectRequest(requestId)(state as never) : undefined));

  // The clock and the live list while the agent works.
  useEffect(() => {
    if (run.phase !== "running") return;
    const tick = setInterval(() => setNow(Date.now()), 500);
    const poll = setInterval(() => {
      const current = runRef.current;
      if (current.phase !== "running") return;
      void readStore(current.organizationId).then((read) => {
        const latest = runRef.current;
        if (!read.ok || latest.phase !== "running") return;
        setRun({ ...latest, made: madeSince(latest.before, read, latest.organizationId) });
      });
    }, POLL_MS);
    return () => {
      clearInterval(tick);
      clearInterval(poll);
    };
  }, [run.phase]);

  const start = async () => {
    const said = sentence.trim();
    if (!said) return;
    if (!organizationId) {
      setAskOrganization(true);
      return;
    }
    setAskOrganization(false);
    const gate = await UNIFIED_DATA_CAMPAIGN.check(organizationId);
    if (gate.state !== "on") {
      setRun({ phase: "failed", why: "Data records are not on in this organization.", made: [] });
      return;
    }
    const before = await readStore(organizationId);
    if (!before.ok) {
      setRun({ phase: "failed", why: before.why, made: [] });
      return;
    }
    const startedAt = Date.now();
    const snapshot = snapshotOf(before.tables, before.items);
    setNow(startedAt);
    setRun({ phase: "running", startedAt, organizationId, before: snapshot, made: [], requestId: null });
    try {
      const result = await launchMandate(MANDATE_KEYS.data__page_guidance, {
        surfaceKey: "make:describe",
        organizationId,
        sourceFeature: "udt",
        // Headless: this box draws the progress and the result itself.
        config: { displayMode: "background", autoRun: true, allowChat: false },
        // The person's own sentence IS the ask — never a prompt written here.
        runtime: { userInput: said, ...(userId ? { variables: { asker_user_id: userId } } : {}) },
        onRequestId: (id: string) => {
          const current = runRef.current;
          if (current.phase === "running") setRun({ ...current, requestId: id });
        },
      } as Parameters<typeof launchMandate>[1]);
      const after = await readStore(organizationId);
      const made = after.ok ? madeSince(snapshot, after, organizationId) : [];
      const current = runRef.current;
      setRun({
        phase: "done",
        ms: Date.now() - startedAt,
        made,
        reply: (result.responseText ?? "").trim(),
        requestId: result.requestId ?? (current.phase === "running" ? current.requestId : null),
      });
    } catch (err: unknown) {
      const current = runRef.current;
      setRun({
        phase: "failed",
        why: err instanceof Error ? err.message : String(err),
        made: current.phase === "running" ? current.made : [],
      });
    }
  };

  // The run's own failure, in the words the server sent (C3) — the person-facing one first.
  const requestError =
    request && request.status === "error"
      ? (request.error?.user_message || request.error?.message || "The agent stopped before it finished.")
      : null;

  const running = run.phase === "running";
  return (
    <section className="flex flex-col gap-2" aria-labelledby="make-describe" data-make-describe={run.phase}>
      <h2 id="make-describe" className="sr-only">
        Describe it
      </h2>
      <form
        className="flex flex-col gap-2 sm:flex-row sm:items-start"
        onSubmit={(e) => {
          e.preventDefault();
          void start();
        }}
      >
        <Textarea
          value={sentence}
          onChange={(e) => setSentence(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              void start();
            }
          }}
          placeholder="A patient intake form that books the first visit"
          aria-label="Describe what to make"
          rows={2}
          disabled={running}
          className="min-h-[2.75rem] flex-1 resize-none"
          data-make-describe-input=""
        />
        <Button type="submit" disabled={running || !sentence.trim()} aria-busy={running || undefined} className="gap-1.5" data-make-describe-go="">
          
          {running ? `Making… ${secondsWords(now - run.startedAt)}` : "Make it"}
          {running ? null : <ArrowRight className="h-4 w-4" aria-hidden />}
        </Button>
      </form>

      {askOrganization && !organizationId ? (
        <OrganizationContextNotice
          state={active.organizationState === "ready" ? "required" : active.organizationState}
          what="What you describe"
          description="New things are saved in the organization you choose"
          compact
        />
      ) : null}

      {run.phase === "running" && run.made.length > 0 ? <MadeList made={run.made} /> : null}

      {run.phase === "done" ? (
        <div className="flex flex-col gap-2 rounded-xl border border-border bg-card p-3" data-make-describe-result="">
          {run.made.length > 0 ? (
            <>
              <p className="text-sm font-medium text-foreground" data-make-describe-ms={run.ms}>
                Made in {secondsWords(run.ms)}
              </p>
              <MadeList made={run.made} />
            </>
          ) : (
            <p className="text-sm font-medium text-foreground">Nothing was made</p>
          )}
          {requestError ? (
            <p className="text-sm text-destructive" role="alert" data-make-describe-refusal="">
              {requestError}
            </p>
          ) : run.made.length === 0 ? (
            // The agent's own answer — a question back or its reason — is the honest result.
            <p className="whitespace-pre-wrap text-sm text-muted-foreground" data-make-describe-reply="">
              {run.reply || "The agent answered with nothing."}
            </p>
          ) : null}
        </div>
      ) : null}

      {run.phase === "failed" ? (
        <div className="flex flex-col gap-2" role="alert" data-make-describe-refusal="">
          <p className="text-sm text-destructive">{run.why}</p>
          {run.made.length > 0 ? <MadeList made={run.made} /> : null}
        </div>
      ) : null}
    </section>
  );
}

const KIND_WORD: Record<MadeThing["kind"], string> = {
  table: "Table",
  form: "Form",
  booking: "Booking page",
  portal: "Portal",
  dashboard: "Dashboard",
  digest: "Digest",
  checklist: "Checklist",
};

function MadeList({ made }: { made: MadeThing[] }) {
  return (
    <ul className="divide-y divide-border overflow-hidden rounded-lg border border-border" data-make-describe-made="">
      {made.map((thing) => (
        <li key={`${thing.kind}:${thing.id}`} className="flex min-w-0 items-center gap-3 px-3 py-2" data-make-made={thing.kind}>
          <KindIcon kind={thing.kind} className="h-4 w-4 shrink-0 text-muted-foreground" />
          <span className="flex min-w-0 flex-1 flex-col sm:flex-row sm:items-center sm:gap-2">
            <span className="truncate text-sm text-foreground">{thing.title}</span>
            <span className="shrink-0 text-xs text-muted-foreground">{KIND_WORD[thing.kind]}</span>
          </span>
          <Link href={thing.href} className="shrink-0 text-sm text-primary underline-offset-2 hover:underline" data-make-made-open="">
            Open
          </Link>
          {thing.publicHref ? (
            <Link
              href={thing.publicHref}
              target="_blank"
              className="inline-flex shrink-0 items-center gap-1 text-sm text-primary underline-offset-2 hover:underline"
              data-make-made-public=""
            >
              Link
              <ExternalLink className="h-3 w-3" aria-hidden />
            </Link>
          ) : null}
        </li>
      ))}
    </ul>
  );
}
