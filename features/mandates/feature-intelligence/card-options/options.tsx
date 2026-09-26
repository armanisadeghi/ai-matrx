"use client";

// features/mandates/feature-intelligence/card-options/options.tsx
//
// TEN LAYOUTS of the same live job card for Arman to choose from
// (/intelligence/card-options). Every option shows: name + status + mandate
// peek + new-tab door + description; the System → Organization → You ladder;
// the agent/workflow that runs it with its own peek + new-tab door; Duplicate &
// modify, Use my own, Reset; inputs ("Can use"), output ("Makes"), and places
// ("Runs in"). Option 1 is the original card (c1e198b948) with three changes.

import { useState } from "react";
import { ArrowRight, ChevronDown, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FeatureIntelligenceRow } from "../types";
import {
  Actions,
  HolderMeta,
  HolderRef,
  InputChips,
  LadderChips,
  MandateTitle,
  PlaceChips,
  RUNGS,
  RUNG_LABEL,
  makesWords,
  useJob,
  type JobContext,
} from "./parts";

export interface OptionProps {
  rows: readonly FeatureIntelligenceRow[];
  ctxFor: (row: FeatureIntelligenceRow) => JobContext;
}

const CARD = "rounded-2xl border border-border bg-card";
const LABEL = "text-xs font-medium text-muted-foreground";

/* 1 ─ The original card, three changes: real new tab, two peeks, actions beside the holder. */
function OriginalCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className={cn(CARD, "p-4 sm:p-5")}>
      <div className="min-w-0 space-y-1">
        <MandateTitle row={row} ctx={ctx} />
        {job.about ? (
          <p className="line-clamp-2 max-w-2xl text-[13px] leading-relaxed text-muted-foreground">{job.about}</p>
        ) : null}
      </div>
      <LadderChips row={row} job={job} className="mt-3 border-t border-border/50 pt-3" />
      <dl className="mt-3 grid gap-x-6 gap-y-2.5 text-[13px] sm:grid-cols-[7.5rem_1fr]">
        <dt className={cn(LABEL, "sm:pt-1.5")}>Runs now</dt>
        <dd className="flex min-w-0 flex-wrap items-center gap-x-2 gap-y-1.5">
          <HolderRef row={row} />
          <HolderMeta row={row} ctx={ctx} />
          <Actions row={row} ctx={ctx} job={job} className="w-full sm:ml-auto sm:w-auto" />
        </dd>
        <dt className={cn(LABEL, "sm:pt-0.5")}>Can use</dt>
        <dd className="min-w-0"><InputChips mandateKey={row.mandateKey} /></dd>
        <dt className={cn(LABEL, "sm:pt-0.5")}>Makes</dt>
        <dd className="text-[13px] text-foreground">{makesWords(row)}</dd>
        <dt className={cn(LABEL, "sm:pt-0.5")}>Runs in</dt>
        <dd className="min-w-0"><PlaceChips places={job.where} /></dd>
      </dl>
    </li>
  );
}

/* 2 ─ Compact: one line per job, expand for the rest. */
function CompactCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  const [open, setOpen] = useState(false);
  const Chevron = open ? ChevronDown : ChevronRight;
  return (
    <li className={cn(CARD, "overflow-hidden")}>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5 px-3 py-2.5">
        <button
          type="button"
          onClick={() => setOpen((value) => !value)}
          aria-expanded={open}
          aria-label={open ? `Collapse ${row.shortName}` : `Expand ${row.shortName}`}
          className="inline-flex h-6 w-6 items-center justify-center rounded text-muted-foreground hover:bg-accent"
        >
          <Chevron className="h-4 w-4" />
        </button>
        <MandateTitle row={row} ctx={ctx} size="sm" className="min-w-[12rem] flex-1" />
        <HolderRef row={row} className="text-[13px]" />
        <span className="hidden text-[11px] text-muted-foreground md:inline">
          {RUNGS.map((rung) => (row.decidedRung === rung ? RUNG_LABEL[rung] : null)).filter(Boolean)[0] ?? "Not assigned"}
        </span>
      </div>
      {open ? (
        <div className="space-y-3 border-t border-border/60 bg-muted/10 px-4 py-3">
          {job.about ? <p className="text-[13px] text-muted-foreground">{job.about}</p> : null}
          <LadderChips row={row} job={job} />
          <div className="flex flex-wrap items-center gap-2">
            <HolderMeta row={row} ctx={ctx} />
            <Actions row={row} ctx={ctx} job={job} className="sm:ml-auto" />
          </div>
          <div className="grid gap-2 text-[13px] sm:grid-cols-3">
            <div className="space-y-1"><div className={LABEL}>Can use</div><InputChips mandateKey={row.mandateKey} /></div>
            <div className="space-y-1"><div className={LABEL}>Makes</div><div>{makesWords(row)}</div></div>
            <div className="space-y-1"><div className={LABEL}>Runs in</div><PlaceChips places={job.where} /></div>
          </div>
        </div>
      ) : null}
    </li>
  );
}

/* 3 ─ Two columns: the mandate on the left, the intelligence on the right. */
function SplitCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className={cn(CARD, "grid overflow-hidden md:grid-cols-[1fr_20rem]")}>
      <div className="space-y-3 p-4 sm:p-5">
        <MandateTitle row={row} ctx={ctx} />
        {job.about ? <p className="text-[13px] leading-relaxed text-muted-foreground">{job.about}</p> : null}
        <div className="space-y-1"><div className={LABEL}>Can use</div><InputChips mandateKey={row.mandateKey} /></div>
        <div className="flex items-baseline gap-2 text-[13px]"><span className={LABEL}>Makes</span>{makesWords(row)}</div>
        <div className="space-y-1"><div className={LABEL}>Runs in</div><PlaceChips places={job.where} /></div>
      </div>
      <div className="space-y-3 border-t border-border bg-muted/20 p-4 md:border-l md:border-t-0">
        <div className={LABEL}>Runs now</div>
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <HolderRef row={row} />
          <HolderMeta row={row} ctx={ctx} />
        </div>
        <ol className="space-y-1 text-[12px]" aria-label="Mandate precedence">
          {RUNGS.map((rung) => (
            <li key={rung} className={cn("flex justify-between rounded-md px-2 py-1", row.decidedRung === rung ? "bg-primary/10 font-medium text-primary" : "text-muted-foreground")}>
              <span>{RUNG_LABEL[rung]}</span>
              <span>{job.rungState(rung)}</span>
            </li>
          ))}
        </ol>
        <Actions row={row} ctx={ctx} job={job} />
      </div>
    </li>
  );
}

/* 4 ─ The ladder IS the holder: each rung shows what it names; the deciding rung carries the actions. */
function StepperCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className={cn(CARD, "p-4 sm:p-5")}>
      <MandateTitle row={row} ctx={ctx} />
      {job.about ? <p className="mt-1 text-[13px] text-muted-foreground">{job.about}</p> : null}
      <ol className="mt-3 space-y-0 border-t border-border/50 pt-3" aria-label="Mandate precedence">
        {RUNGS.map((rung, index) => {
          const winner = row.decidedRung === rung;
          return (
            <li key={rung} className="relative flex gap-3 pb-3 last:pb-0">
              {index < RUNGS.length - 1 ? <span className="absolute left-[7px] top-4 h-full w-px bg-border" aria-hidden /> : null}
              <span className={cn("relative mt-1 h-3.5 w-3.5 shrink-0 rounded-full border-2", winner ? "border-primary bg-primary" : "border-border bg-card")} aria-hidden />
              <div className="flex min-w-0 flex-1 flex-wrap items-center gap-x-2 gap-y-1.5 text-[13px]">
                <span className={cn("w-24 shrink-0", winner ? "font-medium text-foreground" : "text-muted-foreground")}>{RUNG_LABEL[rung]}</span>
                {winner ? (
                  <>
                    <HolderRef row={row} />
                    <HolderMeta row={row} ctx={ctx} badge={false} />
                    <Actions row={row} ctx={ctx} job={job} className="w-full sm:ml-auto sm:w-auto" />
                  </>
                ) : (
                  <span className="text-muted-foreground">{job.rungState(rung)}</span>
                )}
              </div>
            </li>
          );
        })}
      </ol>
      {!row.decidedRung ? <Actions row={row} ctx={ctx} job={job} className="mt-2" /> : null}
      <div className="mt-3 grid gap-3 border-t border-border/50 pt-3 text-[13px] sm:grid-cols-3">
        <div className="space-y-1"><div className={LABEL}>Can use</div><InputChips mandateKey={row.mandateKey} /></div>
        <div className="space-y-1"><div className={LABEL}>Makes</div><div>{makesWords(row)}</div></div>
        <div className="space-y-1"><div className={LABEL}>Runs in</div><PlaceChips places={job.where} /></div>
      </div>
    </li>
  );
}

/* 5 ─ Table: one row per job (scrolls sideways on a phone). */
function TableRow({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <tr className="border-t border-border align-top">
      <td className="min-w-[14rem] p-3">
        <MandateTitle row={row} ctx={ctx} size="sm" />
        {job.about ? <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{job.about}</p> : null}
      </td>
      <td className="min-w-[14rem] p-3 text-[13px]">
        <HolderRef row={row} />
        <div className="mt-1 flex flex-wrap items-center gap-1.5"><HolderMeta row={row} ctx={ctx} /></div>
      </td>
      <td className="min-w-[10rem] p-3">
        <ol className="space-y-0.5 text-[11px]" aria-label="Mandate precedence">
          {RUNGS.map((rung) => (
            <li key={rung} className={row.decidedRung === rung ? "font-medium text-primary" : "text-muted-foreground"}>
              {RUNG_LABEL[rung]}: {job.rungState(rung)}
            </li>
          ))}
        </ol>
      </td>
      <td className="min-w-[12rem] p-3"><InputChips mandateKey={row.mandateKey} /></td>
      <td className="min-w-[7rem] p-3 text-[13px]">{makesWords(row)}</td>
      <td className="min-w-[10rem] p-3"><PlaceChips places={job.where} /></td>
      <td className="min-w-[12rem] p-3"><Actions row={row} ctx={ctx} job={job} size="xs" compact className="flex-col items-stretch" /></td>
    </tr>
  );
}
function TableOption({ rows, ctxFor }: OptionProps) {
  return (
    <div className={cn(CARD, "overflow-x-auto")}>
      <table className="w-full min-w-[64rem] text-left">
        <thead>
          <tr className="text-[11px] uppercase tracking-wide text-muted-foreground">
            {["Job", "Runs now", "Levels", "Can use", "Makes", "Runs in", ""].map((head) => (
              <th key={head} className="px-3 py-2 font-medium">{head}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => <TableRow key={row.id} row={row} ctx={ctxFor(row)} />)}
        </tbody>
      </table>
    </div>
  );
}

function PropertyRow({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1 border-t border-border/50 px-5 py-3 sm:grid-cols-[9rem_1fr] sm:items-center">
      <div className={LABEL}>{label}</div>
      <div className="min-w-0 text-[13px]">{children}</div>
    </div>
  );
}

/* 6 ─ Properties list: calm key/value rows, the holder row carries the actions. */
function PropertiesCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className={cn(CARD, "overflow-hidden")}>
      <div className="space-y-1 px-5 py-4">
        <MandateTitle row={row} ctx={ctx} size="lg" />
        {job.about ? <p className="text-[13px] text-muted-foreground">{job.about}</p> : null}
      </div>
      <PropertyRow label="Runs now">
        <div className="flex flex-wrap items-center gap-2">
          <HolderRef row={row} />
          <HolderMeta row={row} ctx={ctx} />
          <Actions row={row} ctx={ctx} job={job} className="w-full sm:ml-auto sm:w-auto" />
        </div>
      </PropertyRow>
      <PropertyRow label="Decided at"><LadderChips row={row} job={job} /></PropertyRow>
      <PropertyRow label="Can use"><InputChips mandateKey={row.mandateKey} /></PropertyRow>
      <PropertyRow label="Makes">{makesWords(row)}</PropertyRow>
      <PropertyRow label="Runs in"><PlaceChips places={job.where} /></PropertyRow>
    </li>
  );
}

/* 7 ─ Dense: everything in three tight lines. */
function DenseCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className="rounded-lg border border-border bg-card px-3 py-2">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <MandateTitle row={row} ctx={ctx} size="sm" />
        {job.about ? <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{job.about}</span> : null}
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px]">
        <HolderRef row={row} />
        <HolderMeta row={row} ctx={ctx} badge={false} />
        <span className="text-muted-foreground/50" aria-hidden>|</span>
        <LadderChips row={row} job={job} />
        <Actions row={row} ctx={ctx} job={job} size="xs" compact className="sm:ml-auto" />
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
        <span className={LABEL}>Can use</span><InputChips mandateKey={row.mandateKey} />
        <span className={LABEL}>Makes</span><span>{makesWords(row)}</span>
        <span className={LABEL}>Runs in</span><PlaceChips places={job.where} />
      </div>
    </li>
  );
}

/* 8 ─ Callout: the intelligence is a highlighted block inside the mandate page. */
function CalloutCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className={cn(CARD, "p-5")}>
      <MandateTitle row={row} ctx={ctx} size="lg" />
      {job.about ? <p className="mt-1 text-[13px] text-muted-foreground">{job.about}</p> : null}
      <dl className="mt-3 grid grid-cols-[6rem_1fr] gap-x-3 gap-y-2 text-[13px]">
        <dt className={LABEL}>Can use</dt><dd><InputChips mandateKey={row.mandateKey} /></dd>
        <dt className={LABEL}>Makes</dt><dd>{makesWords(row)}</dd>
        <dt className={LABEL}>Runs in</dt><dd><PlaceChips places={job.where} /></dd>
      </dl>
      <div className="mt-4 rounded-xl border border-primary/25 bg-primary/5 p-3">
        <div className="flex flex-wrap items-center gap-2 text-[13px]">
          <HolderRef row={row} />
          <HolderMeta row={row} ctx={ctx} />
          <Actions row={row} ctx={ctx} job={job} className="w-full sm:ml-auto sm:w-auto" />
        </div>
        <LadderChips row={row} job={job} className="mt-2" />
      </div>
    </li>
  );
}

/* 9 ─ Flow: Can use → Runs now → Makes, left to right; places underneath. */
function FlowCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className={cn(CARD, "p-4 sm:p-5")}>
      <MandateTitle row={row} ctx={ctx} />
      {job.about ? <p className="mt-1 text-[13px] text-muted-foreground">{job.about}</p> : null}
      <div className="mt-3 grid items-stretch gap-2 border-t border-border/50 pt-3 md:grid-cols-[1fr_auto_1.4fr_auto_0.8fr]">
        <div className="rounded-lg border border-border p-2.5"><div className={cn(LABEL, "mb-1.5")}>Can use</div><InputChips mandateKey={row.mandateKey} /></div>
        <ArrowRight className="hidden h-4 w-4 self-center text-muted-foreground md:block" aria-hidden />
        <div className="rounded-lg border border-primary/30 bg-primary/5 p-2.5">
          <div className={cn(LABEL, "mb-1.5")}>Runs now</div>
          <div className="flex flex-wrap items-center gap-1.5 text-[13px]"><HolderRef row={row} /><HolderMeta row={row} ctx={ctx} /></div>
          <LadderChips row={row} job={job} className="mt-2" />
          <Actions row={row} ctx={ctx} job={job} size="xs" className="mt-2" />
        </div>
        <ArrowRight className="hidden h-4 w-4 self-center text-muted-foreground md:block" aria-hidden />
        <div className="rounded-lg border border-border p-2.5"><div className={cn(LABEL, "mb-1.5")}>Makes</div><div className="text-[13px]">{makesWords(row)}</div></div>
      </div>
      <div className="mt-3 flex flex-wrap items-center gap-2"><span className={LABEL}>Runs in</span><PlaceChips places={job.where} /></div>
    </li>
  );
}

/* 10 ─ Tiles: the jobs side by side, each a tall compact tile. */
function TileCard({ row, ctx }: { row: FeatureIntelligenceRow; ctx: JobContext }) {
  const job = useJob(row, ctx);
  return (
    <li className={cn(CARD, "flex flex-col gap-3 p-4")}>
      <div>
        <MandateTitle row={row} ctx={ctx} size="sm" />
        {job.about ? <p className="mt-1 line-clamp-3 text-xs text-muted-foreground">{job.about}</p> : null}
      </div>
      <div className="rounded-lg bg-muted/30 p-2.5 text-[13px]">
        <HolderRef row={row} />
        <div className="mt-1 flex flex-wrap items-center gap-1.5"><HolderMeta row={row} ctx={ctx} /></div>
        <LadderChips row={row} job={job} className="mt-2" />
      </div>
      <div className="space-y-1"><div className={LABEL}>Can use</div><InputChips mandateKey={row.mandateKey} /></div>
      <div className="flex items-baseline gap-2 text-[13px]"><span className={LABEL}>Makes</span>{makesWords(row)}</div>
      <div className="space-y-1"><div className={LABEL}>Runs in</div><PlaceChips places={job.where} /></div>
      <Actions row={row} ctx={ctx} job={job} size="xs" className="mt-auto" />
    </li>
  );
}

function list(Card: (props: { row: FeatureIntelligenceRow; ctx: JobContext }) => React.ReactNode, className = "space-y-3") {
  return function Option({ rows, ctxFor }: OptionProps) {
    return <ul className={className}>{rows.map((row) => <Card key={row.id} row={row} ctx={ctxFor(row)} />)}</ul>;
  };
}

export const CARD_OPTIONS: readonly { n: number; name: string; Option: (props: OptionProps) => React.ReactNode }[] = [
  { n: 1, name: "Original card — real new tab, two peeks, actions beside the holder (recommended)", Option: list(OriginalCard) },
  { n: 2, name: "Compact rows — one line each, expand for the rest", Option: list(CompactCard, "space-y-2") },
  { n: 3, name: "Split — the mandate left, the intelligence right", Option: list(SplitCard) },
  { n: 4, name: "Stepper — the ladder is the holder row", Option: list(StepperCard) },
  { n: 5, name: "Table — one row per job", Option: TableOption },
  { n: 6, name: "Properties — calm key/value rows", Option: list(PropertiesCard) },
  { n: 7, name: "Dense — three tight lines per job", Option: list(DenseCard, "space-y-1.5") },
  { n: 8, name: "Callout — the intelligence as a highlighted block", Option: list(CalloutCard) },
  { n: 9, name: "Flow — can use → runs now → makes", Option: list(FlowCard) },
  { n: 10, name: "Tiles — the jobs side by side", Option: list(TileCard, "grid gap-3 md:grid-cols-2 xl:grid-cols-3") },
];
