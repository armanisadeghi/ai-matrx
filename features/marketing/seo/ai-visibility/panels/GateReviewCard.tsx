"use client";

// features/marketing/seo/ai-visibility/panels/GateReviewCard.tsx
//
// The open gate of a panel design run, as a review card (brief: "The four
// gates, and where they live in our UI").
//
// 🚨 YOUR OK NEVER BLOCKS (policies/validation-offers-never-blocks.md). Every
// card offers Approve · Edit · Continue without approving, inline — never a
// modal, never a disabled-looking control. Continuing leaves the panel
// provisional and says so next to the button.
//
// 🚨 GATE 3 IS BLIND. Its card renders ONLY the whitelisted question fields
// below (text, band, set, prompted state, QA call and reason) — never an
// answer, rate, citation or trend for this site. Nothing from the payload is
// rendered generically on that card.

import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CheckCircle2, EyeOff, Forward, Pencil, Plus, X } from "lucide-react";
import { useState } from "react";
import { Input } from "@ai-matrx/design-system";

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { formatDate } from "@/features/marketing/components/shared/MarketingUi";
import { useAppDispatch } from "@/lib/redux/hooks";
import { useCostDisplay } from "@/components/cost/useCostDisplay";
import { cn } from "@/lib/utils";

import {
  aidedStatusName,
  bandName,
  engineName,
  formatUsd,
  laneName,
  partitionName,
  qaDecisionName,
} from "./format";
import { decideGate, panelQueryKeys } from "./panel-api";
import type {
  GateCard,
  GateDecision,
  Gate1Payload,
  Gate2Payload,
  Gate3Payload,
  Gate3Question,
  Gate4Payload,
} from "./types";

function arr<T>(value: unknown): T[] {
  return Array.isArray(value) ? (value as T[]) : [];
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="border-t border-border/60 px-3 py-2">
      <p className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {title}
      </p>
      <div className="mt-1">{children}</div>
    </div>
  );
}

function humanValue(value: unknown): string {
  if (value === null || value === undefined) return "not set";
  if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }
  if (Array.isArray(value)) return value.map(humanValue).join(", ");
  return Object.entries(value as Record<string, unknown>)
    .map(([key, inner]) => `${key.replaceAll("_", " ")}: ${humanValue(inner)}`)
    .join(" · ");
}

/** An editable list of short strings (register terms, limitations). */
function EditableList({
  items,
  onChange,
  placeholder,
}: {
  items: string[];
  onChange: (next: string[]) => void;
  placeholder: string;
}) {
  const [draft, setDraft] = useState("");
  const add = () => {
    const value = draft.trim();
    if (!value) return;
    onChange([...items, value]);
    setDraft("");
  };
  return (
    <div className="flex flex-col gap-1">
      <div className="flex flex-wrap gap-1">
        {items.map((item, index) => (
          <span
            key={`${item}-${index}`}
            className="inline-flex items-center gap-1 rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]"
          >
            {item}
            <button
              type="button"
              aria-label={`Remove ${item}`}
              className="text-muted-foreground hover:text-foreground"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
            >
              <X className="h-3 w-3" />
            </button>
          </span>
        ))}
      </div>
      <div className="flex gap-1">
        <Input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") {
              event.preventDefault();
              add();
            }
          }}
          placeholder={placeholder}
          className="h-7 text-xs"
        />
        <Button type="button" size="sm" variant="outline" className="h-7" onClick={add}>
          <Plus className="h-3.5 w-3.5" /> Add
        </Button>
      </div>
    </div>
  );
}

function LeaveOutToggle({
  left,
  onToggle,
}: {
  left: boolean;
  onToggle: () => void;
}) {
  return (
    <Button
      type="button"
      size="sm"
      variant={left ? "secondary" : "ghost"}
      className="h-6 shrink-0 text-[11px]"
      onClick={onToggle}
    >
      {left ? "Left out — undo" : "Leave out"}
    </Button>
  );
}

// ─── Gate 1 ─────────────────────────────────────────────────────────────────

function Gate1Body({
  payload,
  editing,
  edits,
  setEdits,
}: {
  payload: Gate1Payload;
  editing: boolean;
  edits: Record<string, unknown>;
  setEdits: (next: Record<string, unknown>) => void;
}) {
  const excluded = arr<string>(edits.excluded_icp_ids);
  const terms = arr<string>(edits.register_terms) ;
  const termList = editing
    ? terms
    : arr<Gate1Payload["register_terms"][number]>(payload.register_terms).map((t) => t.term);
  return (
    <>
      <Section title="Facts and their sources">
        <ul className="space-y-1 text-xs">
          {arr<Gate1Payload["sources"][number]>(payload.sources).map((source) => (
            <li key={source.id}>
              {source.url ? (
                <a
                  href={source.url}
                  target="_blank"
                  rel="noreferrer"
                  className="text-primary hover:underline"
                >
                  {source.title || source.url}
                </a>
              ) : (
                <span>{source.title}</span>
              )}
              <span className="text-muted-foreground">
                {" "}
                · {source.source_class.replaceAll("_", " ")} · grade {source.grade}
              </span>
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Customer profiles">
        <ul className="space-y-1.5 text-xs">
          {arr<Gate1Payload["icps"][number]>(payload.icps).map((icp) => (
            <li key={icp.id} className="flex items-start justify-between gap-2">
              <span className={cn(excluded.includes(icp.id) && "line-through opacity-60")}>
                {icp.context}
                <span className="text-muted-foreground">
                  {" "}
                  · confidence {String(icp.confidence)} · {icp.status.replaceAll("_", " ")}
                </span>
              </span>
              {editing ? (
                <LeaveOutToggle
                  left={excluded.includes(icp.id)}
                  onToggle={() =>
                    setEdits({
                      ...edits,
                      excluded_icp_ids: excluded.includes(icp.id)
                        ? excluded.filter((id) => id !== icp.id)
                        : [...excluded, icp.id],
                    })
                  }
                />
              ) : null}
            </li>
          ))}
        </ul>
      </Section>
      <Section title="Brand-name register (words the blind writer must never see)">
        {editing ? (
          <EditableList
            items={termList}
            onChange={(next) => setEdits({ ...edits, register_terms: next })}
            placeholder="Add a name, product or alias"
          />
        ) : (
          <div className="flex flex-wrap gap-1">
            {arr<Gate1Payload["register_terms"][number]>(payload.register_terms).map((term) => (
              <span
                key={`${term.term}-${term.term_class}`}
                className="rounded-md border border-border bg-muted/40 px-1.5 py-0.5 text-[11px]"
                title={term.term_class.replaceAll("_", " ")}
              >
                {term.term}
              </span>
            ))}
          </div>
        )}
      </Section>
      {arr<Gate1Payload["perimeter"][number]>(payload.perimeter).length > 0 ? (
        <Section title="Product areas covered">
          <ul className="space-y-0.5 text-xs">
            {arr<Gate1Payload["perimeter"][number]>(payload.perimeter).map((area) => (
              <li key={area.area}>
                {area.area}
                <span className="text-muted-foreground">
                  {" "}
                  ·{" "}
                  {area.covered_by?.length
                    ? `covered by ${area.covered_by.length} profile(s)`
                    : area.waiver
                      ? `not covered — ${area.waiver}`
                      : "not covered, no reason given"}
                </span>
              </li>
            ))}
          </ul>
        </Section>
      ) : null}
      {arr<string>(payload.open_questions).length > 0 ? (
        <Section title="Open questions">
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {arr<string>(payload.open_questions).map((question) => (
              <li key={question}>{question}</li>
            ))}
          </ul>
        </Section>
      ) : null}
    </>
  );
}

// ─── Gate 2 ─────────────────────────────────────────────────────────────────

function Gate2Body({
  payload,
  editing,
  edits,
  setEdits,
}: {
  payload: Gate2Payload;
  editing: boolean;
  edits: Record<string, unknown>;
  setEdits: (next: Record<string, unknown>) => void;
}) {
  const excluded = arr<string>(edits.excluded_job_ids);
  return (
    <Section title="Buyer jobs">
      <ul className="space-y-2 text-xs">
        {arr<Gate2Payload["jobs"][number]>(payload.jobs).map((job) => (
          <li key={job.id}>
            <div className="flex items-start justify-between gap-2">
              <span className={cn("font-medium", excluded.includes(job.id) && "line-through opacity-60")}>
                {job.statement}
              </span>
              {editing ? (
                <LeaveOutToggle
                  left={excluded.includes(job.id)}
                  onToggle={() =>
                    setEdits({
                      ...edits,
                      excluded_job_ids: excluded.includes(job.id)
                        ? excluded.filter((id) => id !== job.id)
                        : [...excluded, job.id],
                    })
                  }
                />
              ) : null}
            </div>
            <div className="text-[11px] text-muted-foreground">
              evidence grade {job.grade} · confidence {String(job.confidence)}
              {arr<string>(job.roles).length ? ` · ${arr<string>(job.roles).join(", ")}` : ""}
            </div>
            {arr<Gate2Payload["jobs"][number]["language_samples"][number]>(job.language_samples).map(
              (sample, index) => (
                <blockquote
                  key={index}
                  className="mt-1 border-l-2 border-border pl-2 text-[11px] italic text-muted-foreground"
                >
                  &ldquo;{sample.text}&rdquo;
                </blockquote>
              ),
            )}
          </li>
        ))}
      </ul>
    </Section>
  );
}

// ─── Gate 3 (blind) ─────────────────────────────────────────────────────────

const SET_ORDER = ["core", "aided", "rotating", "sentinel", "control"];

function Gate3Body({
  payload,
  keep,
  setKeep,
}: {
  payload: Gate3Payload;
  keep: Record<string, string>;
  setKeep: (next: Record<string, string>) => void;
}) {
  const questions = arr<Gate3Question>(payload.questions);
  const sets = [...new Set(questions.map((q) => q.partition))].sort((a, b) => {
    const ia = a === null ? 98 : SET_ORDER.indexOf(a);
    const ib = b === null ? 98 : SET_ORDER.indexOf(b);
    return (ia === -1 ? 50 : ia) - (ib === -1 ? 50 : ib);
  });
  const counts = payload.counts ?? { pass: 0, revise: 0, quarantine: 0, reject: 0 };
  return (
    <>
      <div className="flex items-start gap-1.5 border-t border-border/60 bg-muted/30 px-3 py-2 text-[11px] text-muted-foreground">
        <EyeOff className="mt-0.5 h-3.5 w-3.5 shrink-0" />
        <span>
          Blind review: this card shows no answers, rates or citations for this
          site, so current results cannot steer which questions are kept.
          {payload.dropped_fragments > 0
            ? ` ${payload.dropped_fragments} buyer-language fragment(s) were dropped before writing because they contained a brand name.`
            : ""}
        </span>
      </div>
      <div className="flex flex-wrap gap-3 border-t border-border/60 px-3 py-2 text-[11px] text-muted-foreground">
        <span>{counts.pass} passed</span>
        <span>{counts.revise} revised</span>
        <span>{counts.quarantine} set aside</span>
        <span>{counts.reject} rejected</span>
      </div>
      {sets.map((set) => (
        <Section key={set ?? "none"} title={partitionName(set) ?? "Not assigned to a set"}>
          <ul className="flex flex-col divide-y divide-border/50">
            {questions
              .filter((q) => q.partition === set)
              .map((question) => {
                const kept = question.candidate_id in keep;
                const quarantined = question.qa_decision === "quarantine";
                return (
                  <li key={question.candidate_id} className="py-1.5 text-xs">
                    <div>{question.text}</div>
                    <div className="mt-0.5 text-[11px] text-muted-foreground">
                      {[bandName(question.band), aidedStatusName(question.aided_status)]
                        .filter(Boolean)
                        .join(" · ")}
                      {" · "}
                      <span
                        className={cn(
                          question.qa_decision === "pass" && "text-emerald-700 dark:text-emerald-400",
                          (question.qa_decision === "quarantine" || question.qa_decision === "revise") &&
                            "text-amber-700 dark:text-amber-400",
                          question.qa_decision === "reject" && "text-destructive",
                        )}
                      >
                        {qaDecisionName(question.qa_decision)}
                      </span>
                      {question.qa_reason ? ` — ${question.qa_reason}` : ""}
                    </div>
                    {quarantined ? (
                      kept ? (
                        <div className="mt-1 flex items-center gap-1">
                          <Input
                            value={keep[question.candidate_id]}
                            onChange={(event) =>
                              setKeep({ ...keep, [question.candidate_id]: event.target.value })
                            }
                            placeholder="Why keep it? (recorded with your decision)"
                            className="h-7 text-xs"
                          />
                          <Button
                            type="button"
                            size="sm"
                            variant="ghost"
                            className="h-7 text-[11px]"
                            onClick={() => {
                              const next = { ...keep };
                              delete next[question.candidate_id];
                              setKeep(next);
                            }}
                          >
                            Undo keep
                          </Button>
                        </div>
                      ) : (
                        <Button
                          type="button"
                          size="sm"
                          variant="outline"
                          className="mt-1 h-6 text-[11px]"
                          onClick={() => setKeep({ ...keep, [question.candidate_id]: "" })}
                        >
                          Keep this set-aside question
                        </Button>
                      )
                    ) : null}
                  </li>
                );
              })}
          </ul>
        </Section>
      ))}
    </>
  );
}

// ─── Gate 4 ─────────────────────────────────────────────────────────────────

function Gate4Body({
  payload,
  editing,
  edits,
  setEdits,
}: {
  payload: Gate4Payload;
  editing: boolean;
  edits: Record<string, unknown>;
  setEdits: (next: Record<string, unknown>) => void;
}) {
  const { unit } = useCostDisplay();
  const cost = formatUsd(payload.wave_cost_usd, unit);
  const limitations = editing
    ? arr<string>(edits.limitations)
    : arr<string>(payload.limitations);
  return (
    <>
      <Section title="Plan">
        <dl className="grid grid-cols-[auto_1fr] gap-x-3 gap-y-1 text-xs">
          <dt className="text-muted-foreground">Version</dt>
          <dd>{payload.version}</dd>
          <dt className="text-muted-foreground">Asked every</dt>
          <dd>
            {editing ? (
              <Input
                type="number"
                min={1}
                value={String(edits.cadence_days ?? payload.cadence_days)}
                onChange={(event) =>
                  setEdits({ ...edits, cadence_days: Number(event.target.value) })
                }
                className="h-7 w-24 text-xs"
              />
            ) : (
              `${payload.cadence_days} day(s)`
            )}
          </dd>
          <dt className="text-muted-foreground">Repeats per question</dt>
          <dd>
            {editing ? (
              <Input
                type="number"
                min={1}
                value={String(edits.repeats ?? payload.repeats)}
                onChange={(event) =>
                  setEdits({ ...edits, repeats: Number(event.target.value) })
                }
                className="h-7 w-24 text-xs"
              />
            ) : (
              payload.repeats
            )}
          </dd>
          <dt className="text-muted-foreground">Engines</dt>
          <dd>{arr<string>(payload.engines).map((e) => engineName(e)).join(", ") || "none"}</dd>
          <dt className="text-muted-foreground">Ways of asking</dt>
          <dd>{arr<string>(payload.lanes).map((l) => laneName(l)).join(", ") || "none"}</dd>
          <dt className="text-muted-foreground">Weights</dt>
          <dd>
            exposure {humanValue(payload.weights?.exposure)} · priority{" "}
            {humanValue(payload.weights?.priority)}
          </dd>
          <dt className="text-muted-foreground">Cost of one wave</dt>
          <dd>
            {cost ?? "Not priced yet"}
            {payload.wave_cost_basis ? (
              <span className="text-muted-foreground"> — {payload.wave_cost_basis}</span>
            ) : null}
          </dd>
        </dl>
      </Section>
      <Section title="Limitations">
        {editing ? (
          <EditableList
            items={limitations}
            onChange={(next) => setEdits({ ...edits, limitations: next })}
            placeholder="Add a limitation"
          />
        ) : (
          <ul className="list-disc space-y-0.5 pl-4 text-xs">
            {limitations.map((limitation) => (
              <li key={limitation}>{limitation}</li>
            ))}
          </ul>
        )}
      </Section>
    </>
  );
}

// ─── The card ───────────────────────────────────────────────────────────────

function initialEdits(card: GateCard): Record<string, unknown> {
  if (card.gate === 1) {
    return {
      excluded_icp_ids: [],
      register_terms: arr<{ term: string }>(card.payload.register_terms).map((t) => t.term),
    };
  }
  if (card.gate === 2) return { excluded_job_ids: [] };
  if (card.gate === 4) {
    return { limitations: arr<string>(card.payload.limitations) };
  }
  return {};
}

export function GateReviewCard({
  card,
  panelId,
  organizationId,
}: {
  card: GateCard;
  panelId: string;
  organizationId: string;
}) {
  const dispatch = useAppDispatch();
  const queryClient = useQueryClient();
  const [editing, setEditing] = useState(false);
  const [edits, setEdits] = useState<Record<string, unknown>>(() => initialEdits(card));
  const [keep, setKeep] = useState<Record<string, string>>({});
  const [note, setNote] = useState("");

  const keptCount = Object.keys(keep).length;
  const hasEdits = editing || keptCount > 0;

  const mutation = useMutation({
    mutationFn: (decision: GateDecision) => {
      let payloadEdits: Record<string, unknown> | null = null;
      if (decision === "edit") {
        payloadEdits =
          card.gate === 3
            ? { keep_candidate_ids: Object.keys(keep), reasons: keep }
            : edits;
      }
      return decideGate(
        dispatch,
        panelId,
        card.gate,
        { decision, edits: payloadEdits, note: note.trim() || null },
        organizationId,
      );
    },
    onSuccess: (view) => {
      queryClient.setQueryData(panelQueryKeys.design(panelId), view);
      void queryClient.invalidateQueries({ queryKey: panelQueryKeys.metrics(panelId) });
    },
  });

  const payload = card.payload;
  return (
    <div
      className="rounded-lg border border-primary/40 bg-card"
      data-surface-value={`panel_gate_${card.gate}`}
    >
      <div className="flex flex-wrap items-start justify-between gap-2 px-3 py-2">
        <div className="min-w-0">
          <p className="text-sm font-semibold">
            Review {card.gate} of 4: {card.title}
          </p>
          {card.summary ? (
            <p className="mt-0.5 text-xs text-muted-foreground">{card.summary}</p>
          ) : null}
        </div>
        <Badge variant="warning" className="whitespace-nowrap">
          Waiting for you
        </Badge>
      </div>

      {card.gate === 1 ? (
        <Gate1Body
          payload={payload as unknown as Gate1Payload}
          editing={editing}
          edits={edits}
          setEdits={setEdits}
        />
      ) : card.gate === 2 ? (
        <Gate2Body
          payload={payload as unknown as Gate2Payload}
          editing={editing}
          edits={edits}
          setEdits={setEdits}
        />
      ) : card.gate === 3 ? (
        <Gate3Body payload={payload as unknown as Gate3Payload} keep={keep} setKeep={setKeep} />
      ) : (
        <Gate4Body
          payload={payload as unknown as Gate4Payload}
          editing={editing}
          edits={edits}
          setEdits={setEdits}
        />
      )}

      <div className="flex flex-col gap-2 border-t border-border/60 px-3 py-2">
        <Textarea
          value={note}
          onChange={(event) => setNote(event.target.value)}
          placeholder="A note for the record (optional) — saved with your decision, your name and the time."
          className="min-h-14 text-xs"
        />
        <div className="flex flex-wrap items-center gap-2">
          {hasEdits ? (
            <Button
              size="sm"
              onClick={() => mutation.mutate("edit")}
              disabled={mutation.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" />
              {card.gate === 3 && keptCount > 0
                ? `Approve, keeping ${keptCount} set-aside question(s)`
                : "Approve with my edits"}
            </Button>
          ) : (
            <Button
              size="sm"
              onClick={() => mutation.mutate("approve")}
              disabled={mutation.isPending}
            >
              <CheckCircle2 className="h-3.5 w-3.5" /> Approve
            </Button>
          )}
          {card.gate !== 3 ? (
            <Button
              size="sm"
              variant="outline"
              onClick={() => {
                if (editing) setEdits(initialEdits(card));
                setEditing(!editing);
              }}
              disabled={mutation.isPending}
            >
              <Pencil className="h-3.5 w-3.5" /> {editing ? "Discard edits" : "Edit"}
            </Button>
          ) : null}
          <Button
            size="sm"
            variant="ghost"
            onClick={() => mutation.mutate("continue")}
            disabled={mutation.isPending}
          >
            <Forward className="h-3.5 w-3.5" /> Continue without approving
          </Button>
        </div>
        <p className="text-[11px] text-muted-foreground">
          Continuing without approving keeps the design moving and records your
          OK as pending; the panel stays <span className="font-medium">provisional</span>{" "}
          (its numbers are directional) until this review is approved.
          {card.wait_until
            ? ` If nobody answers by ${formatDate(card.wait_until)}, the run continues on its own the same way.`
            : ""}
        </p>
        {mutation.error ? (
          <p className="text-[11px] text-destructive">
            Your decision was not recorded: {mutation.error.message} Nothing
            changed — try again. <ErrorAlchemyMenu error={mutation.error} />
          </p>
        ) : null}
      </div>
    </div>
  );
}
