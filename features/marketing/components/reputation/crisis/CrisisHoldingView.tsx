"use client";

/**
 * The view for a `crisis_holding` answer (aidream `reputation.crisis_holding`
 * result). Two shapes:
 *
 *  - the COUNSEL STOP (a trigger fired and no counsel is engaged): the triggers,
 *    why the gate exists, the one on-record line, the next steps, and the
 *    button "Draft for counsel anyway" — nothing is refused.
 *  - the SET: short / medium / cautious (words counted in code), the reporter
 *    Q&A, what not to say, the decay (valid-until from the table, a reminder),
 *    and in counsel-review mode the watermark above every statement.
 *
 * "Send to press" on a statement shows the shared pitch advisories (the PR
 * floor) and records the go-ahead; it never blocks.
 */

import { useEffect, useState } from "react";
import { AlertOctagon, CalendarClock, Clock, Copy, Loader2, Send } from "lucide-react";

import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PitchAdvisoryPanel } from "@/features/crm/pitch-advisories/PitchAdvisoryPanel";
import { usePitchAdvisories } from "@/features/crm/pitch-advisories/usePitchAdvisories";
import { downloadIcs, googleCalendarUrl } from "@/lib/calendar/eventLinks";
import { toast } from "@/lib/toast";
import { cn } from "@/lib/utils";

import type { CheckedStatement, CrisisHoldingResult } from "@/features/marketing/pr/media-desk/api";
import { validity } from "./crisis-intake";

function rec(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function str(value: unknown): string {
  if (typeof value === "string") return value;
  if (value == null) return "";
  if (typeof value === "object") {
    const r = rec(value);
    return String(r.label ?? r.name ?? r.value ?? r.text ?? JSON.stringify(value));
  }
  return String(value);
}

function useMinuteNow(): number {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  return now;
}

function SendToPress({
  text,
  organizationId,
  name,
}: {
  text: string;
  organizationId: string;
  name: string;
}) {
  const advisories = usePitchAdvisories(organizationId, {
    surface: "crisis_publish",
    body: text,
    attachment_count: 0,
    is_exclusive: false,
  });
  const [busy, setBusy] = useState(false);
  return (
    <div className="mt-2 space-y-2 rounded-md border border-border bg-muted/20 p-2" data-testid="crisis-send-step">
      <PitchAdvisoryPanel
        state={advisories}
        organizationId={organizationId}
        actionLabel="sending this statement"
        surfaceName="marketing-reputation"
      />
      <Button
        size="sm"
        className="h-7 text-[11px]"
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await advisories.recordGoAhead({ entityType: "crisis_holding_statement", choice: "go_ahead" });
          try {
            await navigator.clipboard.writeText(text);
            toast.success(`The ${name} statement is copied. Paste it into your email or post.`);
          } catch {
            toast.warning("Could not copy automatically. Select the statement text and copy it.");
          } finally {
            setBusy(false);
          }
        }}
      >
        {busy ? <Loader2 className="mr-1 h-3 w-3 animate-spin" /> : <Copy className="mr-1 h-3 w-3" />}
        Copy and go ahead
      </Button>
      <p className="text-[10px] text-muted-foreground">
        This surface does not send mail itself; the statement is copied for your own channel, and that you saw the
        warnings above is recorded.
      </p>
    </div>
  );
}

function Statement({
  name,
  label,
  statement,
  banner,
  organizationId,
}: {
  name: string;
  label: string;
  statement: CheckedStatement | null;
  banner: string | null;
  organizationId: string;
}) {
  const [sending, setSending] = useState(false);
  if (!statement) {
    return (
      <section className="rounded-md border border-dashed border-border p-3 text-xs text-muted-foreground">
        {label}: not drafted (see what was declined below).
      </section>
    );
  }
  const full = banner ? `${banner}\n\n${statement.text}` : statement.text;
  return (
    <section className="rounded-md border border-border" data-testid={`crisis-statement-${name}`}>
      <div className="flex items-center justify-between border-b border-border px-3 py-1.5">
        <h3 className="text-xs font-semibold text-foreground">{label}</h3>
        <Badge variant={statement.notes.length ? "warning" : "outline"} className="text-[10px] tabular-nums">
          {statement.words} words
        </Badge>
      </div>
      <div className="px-3 py-2">
        {banner ? (
          <p className="mb-2 rounded bg-destructive/10 px-2 py-1 text-[10px] font-bold tracking-wide text-destructive" data-testid="counsel-watermark">
            {banner}
          </p>
        ) : null}
        <p className="whitespace-pre-wrap text-sm leading-relaxed text-foreground">{statement.text}</p>
        {statement.notes.length ? (
          <ul className="mt-2 list-disc pl-4 text-[11px] text-amber-700 dark:text-amber-400">
            {statement.notes.map((n) => (
              <li key={n}>{n}</li>
            ))}
          </ul>
        ) : null}
        {statement.deltas?.length ? (
          <details className="mt-2 text-[11px] text-muted-foreground">
            <summary className="cursor-pointer">Changes from the medium statement</summary>
            <ul className="mt-1 list-disc pl-4">
              {statement.deltas.map((d, i) => (
                <li key={i}>{str(d)}</li>
              ))}
            </ul>
          </details>
        ) : null}
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-[11px]"
            onClick={() => {
              void navigator.clipboard.writeText(full).then(
                () => toast.success("Copied."),
                () => toast.warning("Could not copy automatically."),
              );
            }}
          >
            <Copy className="mr-1 h-3 w-3" /> Copy
          </Button>
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => setSending((v) => !v)}>
            <Send className="mr-1 h-3 w-3" /> Send to press
          </Button>
        </div>
        {sending ? <SendToPress text={full} organizationId={organizationId} name={name} /> : null}
      </div>
    </section>
  );
}

export function CrisisStopBlock({
  result,
  onDraftAnyway,
  drafting,
}: {
  result: CrisisHoldingResult;
  onDraftAnyway: () => void;
  drafting: boolean;
}) {
  const stop = result.stop_block!;
  return (
    <section className="rounded-lg border-2 border-destructive/50 bg-destructive/5 p-4" data-testid="crisis-stop-block">
      <div className="flex items-start gap-2">
        <AlertOctagon className="mt-0.5 h-5 w-5 shrink-0 text-destructive" aria-hidden />
        <div className="min-w-0 space-y-2 text-sm">
          <p className="font-semibold text-foreground">Stop: page counsel before anything goes out</p>
          <p className="text-xs text-muted-foreground">{stop.why}</p>
          {stop.text ? <p className="whitespace-pre-wrap text-xs text-foreground">{stop.text}</p> : null}
          <div>
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">What set it off</p>
            <ul className="mt-1 list-disc pl-4 text-xs text-foreground">
              {result.gate.triggers.map((t, i) => (
                <li key={`${t.trigger}-${i}`}>
                  {t.trigger}
                  {t.field ? <span className="text-muted-foreground"> (from {t.field.replaceAll("_", " ")})</span> : null}
                </li>
              ))}
            </ul>
          </div>
          <div className="rounded-md border border-border bg-background p-2">
            <p className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">The one line you can say on the record</p>
            <p className="mt-1 text-sm font-medium text-foreground">&ldquo;{stop.on_record_line}&rdquo;</p>
          </div>
          <ol className="list-decimal space-y-0.5 pl-4 text-xs text-foreground">
            {stop.next_steps.map((s) => (
              <li key={s}>{s}</li>
            ))}
          </ol>
          <Button variant="outline" size="sm" onClick={onDraftAnyway} disabled={drafting} data-testid="draft-for-counsel">
            {drafting ? <Loader2 className="mr-1.5 h-3.5 w-3.5 animate-spin" /> : null}
            Draft for counsel anyway
          </Button>
          <p className="text-[11px] text-muted-foreground">
            You get the full set, every statement marked &ldquo;not for publication, for counsel review only&rdquo;.
          </p>
        </div>
      </div>
    </section>
  );
}

export function CrisisHoldingView({
  result,
  organizationId,
  onDraftAnyway,
  drafting,
}: {
  result: CrisisHoldingResult;
  organizationId: string;
  onDraftAnyway: () => void;
  drafting: boolean;
}) {
  const now = useMinuteNow();
  const valid = validity(result.decay.valid_until, now);
  if (result.gate.stopped && result.stop_block) {
    return <CrisisStopBlock result={result} onDraftAnyway={onDraftAnyway} drafting={drafting} />;
  }
  const until = new Date(result.decay.valid_until);
  const reminder = {
    uid: `crisis-holding-${result.decay.issued_at}@aimatrx`,
    title: `Holding statement for ${result.org_name} expires — refresh it`,
    start: result.decay.valid_until,
    end: new Date(until.getTime() + 15 * 60_000).toISOString(),
    description: `The holding statement issued ${new Date(result.decay.issued_at).toLocaleString()} is no longer safe to reuse. Refresh it if: ${result.decay.refresh_triggers.map(str).join("; ") || "anything new is public"}.`,
  };
  return (
    <div className="space-y-3" data-testid="crisis-set">
      <header className="rounded-md border border-border bg-muted/20 p-3 text-xs">
        <p className="font-semibold text-foreground">Holding draft · {result.org_name}</p>
        <p className="mt-0.5 text-muted-foreground">
          Issued {new Date(result.decay.issued_at).toLocaleString()} · valid until{" "}
          <span className="font-medium text-foreground" data-testid="crisis-valid-until">
            {until.toLocaleString()}
          </span>{" "}
          ({result.decay.rule})
        </p>
        <p className={cn("mt-1 flex items-center gap-1", valid.expired ? "font-medium text-destructive" : "text-muted-foreground")}>
          <Clock className="h-3 w-3" aria-hidden /> {valid.text}
        </p>
        <div className="mt-2 flex flex-wrap gap-1.5">
          <Button size="sm" variant="outline" className="h-7 text-[11px]" onClick={() => downloadIcs(reminder)}>
            <CalendarClock className="mr-1 h-3 w-3" /> Remind me at valid-until (.ics)
          </Button>
          <Button asChild size="sm" variant="ghost" className="h-7 text-[11px]">
            <a href={googleCalendarUrl(reminder)} target="_blank" rel="noreferrer">
              Add to Google Calendar
            </a>
          </Button>
        </div>
        {result.gate.fired ? (
          <p className="mt-2 text-[11px] text-destructive">
            Counsel triggers are present ({result.gate.triggers.map((t) => t.trigger).join("; ")}). This set is for counsel review only.
          </p>
        ) : null}
      </header>
      {result.checks.length ? (
        <ul className="list-disc space-y-0.5 rounded-md border border-amber-500/30 bg-amber-500/5 p-2 pl-6 text-[11px] text-muted-foreground">
          {result.checks.map((c) => (
            <li key={c}>{c}</li>
          ))}
        </ul>
      ) : null}
      <Statement name="short" label="Short" statement={result.short} banner={result.banner} organizationId={organizationId} />
      <Statement name="medium" label="Medium" statement={result.medium} banner={result.banner} organizationId={organizationId} />
      <Statement name="cautious" label="Cautious legal pass" statement={result.cautious} banner={result.banner} organizationId={organizationId} />
      {result.qa.length ? (
        <section className="rounded-md border border-border" data-testid="crisis-qa">
          <h3 className="border-b border-border px-3 py-1.5 text-xs font-semibold">Reporter questions ({result.qa.length})</h3>
          <ul className="divide-y divide-border">
            {result.qa.map((row, i) => {
              const r = rec(row);
              return (
                <li key={i} className="px-3 py-2 text-xs">
                  <p className="font-medium text-foreground">{str(r.question)}</p>
                  <p className="mt-0.5 text-muted-foreground">
                    <Badge variant="outline" className="mr-1 text-[10px]">
                      {str(r.posture) || "posture not given"}
                    </Badge>
                    {str(r.category)}
                  </p>
                  {r.line ? <p className="mt-1 text-foreground">&ldquo;{str(r.line)}&rdquo;</p> : null}
                  {r.rationale ? <p className="mt-0.5 text-[11px] text-muted-foreground">{str(r.rationale)}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {result.do_not_say.length ? (
        <section className="rounded-md border border-border" data-testid="crisis-do-not-say">
          <h3 className="border-b border-border px-3 py-1.5 text-xs font-semibold">What not to say</h3>
          <ul className="divide-y divide-border">
            {result.do_not_say.map((row, i) => {
              const r = rec(row);
              return (
                <li key={i} className="px-3 py-2 text-xs">
                  <p className="font-medium text-destructive line-through decoration-destructive/40">{str(r.phrase)}</p>
                  <p className="mt-0.5 text-muted-foreground">{str(r.reason)}</p>
                  {r.rewrite ? <p className="mt-0.5 text-foreground">Instead: {str(r.rewrite)}</p> : null}
                </li>
              );
            })}
          </ul>
        </section>
      ) : null}
      {result.refusals.length ? (
        <section className="rounded-md border border-border p-3 text-xs">
          <h3 className="font-semibold">Declined</h3>
          <ul className="mt-1 list-disc pl-4 text-muted-foreground">
            {result.refusals.map((r, i) => (
              <li key={i}>{str(r)}</li>
            ))}
          </ul>
        </section>
      ) : null}
      <p className="text-[11px] text-muted-foreground">
        Not counsel approval. If anything changes (a new public fact, a regulator call, a named person), draft again.
      </p>
    </div>
  );
}
