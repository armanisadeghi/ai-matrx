"use client";

/**
 * THE ONE BINDING UI — walkable, non-functional preview.
 *
 * Everything here is mock data (./mock.ts). Nothing reads, nothing writes.
 * Reuses the preview chrome Arman already approved for unified-management
 * (`../unified-management/places/preview-chrome`), so `<Inert>` still marks
 * every control that would act in the real thing.
 *
 * What it shows, in the order UI-STANDARD.md numbers them:
 *   1  Two sides and a middle — offered inventory | the match | holder inputs
 *   3  Four named sources per row
 *   4  Auto-bind shown as a decision
 *   5  The real current value, previewed
 *   6  Options priced at the point of choice
 *   7  Live per-row refusal in domain words
 *   9  Absence behaviour on a non-guaranteed source
 *  11  AI map / Map manually, proposing into the same editor
 *  13  Scope as one described control inside the flow
 *  14  The auto-run promise, narrated
 *  17  The same middle transposed into a places × inputs grid
 */

import { useState } from "react";
import {
  AlertTriangle,
  Check,
  Circle,
  MessageCircleQuestion,
  Rocket,
  Sparkles,
  Type,
  Zap,
} from "lucide-react";

import { cn } from "@/lib/utils";
import {
  Inert,
  Panel,
  PreviewBanner,
  RuleNote,
} from "../unified-management/places/preview-chrome";
import {
  BATCH_ROWS,
  HOLDER,
  INPUTS,
  OFFERED,
  PLACE,
  SCOPE_RUNGS,
  type HolderInput,
  type SourceMode,
} from "./mock";

const MODES: { id: SourceMode; label: string; icon: typeof Rocket }[] = [
  { id: "holder_default", label: "Holder Default", icon: Rocket },
  { id: "offered_value", label: "Offered Value", icon: Zap },
  { id: "direct_value", label: "Direct Value", icon: Type },
  { id: "prompt_user", label: "Prompt User", icon: MessageCircleQuestion },
];

export function OneBindingUi() {
  const [mode, setMode] = useState<"map" | "batch">("map");

  return (
    <div className="mx-auto flex max-w-[1600px] flex-col gap-4 p-4">
      <header className="space-y-2">
        <h1 className="text-lg font-semibold text-foreground">
          The one binding UI
        </h1>
        <p className="max-w-4xl text-xs leading-relaxed text-muted-foreground">
          One flow binds a job to a place at any rung — system, organization or
          just me — for an agent holder or a workflow holder. The spine is the
          two-sides-and-a-middle mapping the shortcut and surface UIs already
          use; the AI map, the scope rung, the option depth and the batch mode
          are the other three sources folded into the same screen.
        </p>
        <PreviewBanner>
          Mock data only — nothing here reads or writes. Controls with a dashed
          amber outline are deliberately inert; hover one to see what it would
          do. The standard this is built to is{" "}
          <span className="font-medium">UI-STANDARD.md</span> in common-docs.
        </PreviewBanner>
      </header>

      <ScopeAndHolderBar />

      <div className="flex items-center gap-2">
        <div className="flex items-center rounded-md border border-border p-0.5">
          {(
            [
              ["map", "Map one place"],
              ["batch", "Map many places"],
            ] as const
          ).map(([key, label]) => (
            <button
              key={key}
              type="button"
              onClick={() => setMode(key)}
              className={cn(
                "rounded px-2.5 py-1 text-[11px] transition-colors",
                mode === key
                  ? "bg-primary/10 font-medium text-primary"
                  : "text-muted-foreground hover:text-foreground",
              )}
            >
              {label}
            </button>
          ))}
        </div>
        <p className="text-[11px] text-muted-foreground">
          Same rows, same four sources, same validation — one place at a time, or
          every place at once.
        </p>
      </div>

      {mode === "map" ? <MapOnePlace /> : <MapManyPlaces />}

      <AutoRunBar />
    </div>
  );
}

/* ── Scope + holder ──────────────────────────────────────────────────────── */

function ScopeAndHolderBar() {
  const [rung, setRung] = useState("organization");
  const chosen = SCOPE_RUNGS.find((r) => r.id === rung)!;

  return (
    <Panel
      title="Who this is for, and what runs"
      eyebrow="Scope + holder"
      className="shrink-0"
    >
      <RuleNote>
        Principle 13 — scope is one described control inside this flow, not a
        property of which URL family you happened to open. Every rung says who
        it covers and what overrides it.
      </RuleNote>
      <div className="grid gap-3 p-3 md:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1fr)]">
        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Rung
          </p>
          <div className="flex gap-1.5">
            {SCOPE_RUNGS.map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setRung(r.id)}
                className={cn(
                  "flex-1 rounded-lg border px-2 py-1.5 text-[11px] font-medium transition-colors",
                  rung === r.id
                    ? "border-primary bg-primary/10 text-foreground"
                    : "border-border bg-background text-muted-foreground hover:text-foreground",
                )}
              >
                {r.label}
              </button>
            ))}
          </div>
          <p className="text-[11px] leading-snug text-muted-foreground">
            {chosen.description}
          </p>
          {rung === "organization" && (
            <Inert what="open the organization picker">
              <span className="mt-1 block w-full rounded-md border border-border px-2 py-1.5 text-[11px]">
                Titanium Success — Organization
              </span>
            </Inert>
          )}
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Holder
          </p>
          <Inert what="open the holder picker (agent or workflow)">
            <span className="block w-full rounded-md border border-border px-2 py-1.5 text-[11px]">
              <span className="font-medium text-foreground">{HOLDER.name}</span>
              <span className="ml-1.5 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                agent
              </span>
            </span>
          </Inert>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Latest: your edits to this holder apply here automatically — an edit
            that changes its inputs can break this job. Currently{" "}
            <span className="font-medium text-foreground">{HOLDER.version}</span>
            .
          </p>
        </div>

        <div className="space-y-1.5">
          <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
            Place
          </p>
          <Inert what="open the place picker">
            <span className="block w-full rounded-md border border-border px-2 py-1.5 text-[11px]">
              <span className="font-medium text-foreground">{PLACE.label}</span>
              <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                {PLACE.name}
              </span>
            </span>
          </Inert>
          <p className="text-[11px] leading-snug text-muted-foreground">
            Offers{" "}
            <span className="font-medium text-foreground">
              {PLACE.declaredCount} values
            </span>{" "}
            — enough to feed every input below without asking the user anything.
          </p>
        </div>
      </div>
    </Panel>
  );
}

/* ── The spine: offered | middle | holder ────────────────────────────────── */

function MapOnePlace() {
  const [tab, setTab] = useState<"ai" | "manual">("manual");

  return (
    <div className="grid gap-3 lg:grid-cols-[300px_minmax(0,1fr)_300px]">
      <OfferedSide />

      <Panel
        title="The match"
        eyebrow="Middle"
        count={
          <span className="rounded bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">
            {INPUTS.length} inputs
          </span>
        }
        actions={
          <div className="flex items-center rounded-md border border-border p-0.5">
            {(
              [
                ["ai", "AI map"],
                ["manual", "Map manually"],
              ] as const
            ).map(([key, label]) => (
              <button
                key={key}
                type="button"
                onClick={() => setTab(key)}
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] transition-colors",
                  tab === key
                    ? "bg-primary/10 font-medium text-primary"
                    : "text-muted-foreground hover:text-foreground",
                )}
              >
                {label}
              </button>
            ))}
          </div>
        }
      >
        <RuleNote>
          Principle 1 — the place&apos;s offered inventory and the holder&apos;s
          input inventory both stand open on either side; the match is made
          here. Principle 3 — four sources, named in words, never the storage
          DSL.
        </RuleNote>
        {tab === "ai" ? <AiMapTab onAccept={() => setTab("manual")} /> : null}
        {tab === "manual" ? (
          <div className="space-y-2 p-3">
            {INPUTS.map((input) => (
              <MappingRow key={input.name} input={input} />
            ))}
          </div>
        ) : null}
      </Panel>

      <HolderSide />
    </div>
  );
}

function OfferedSide() {
  return (
    <Panel
      title="This place offers"
      eyebrow="Offered"
      count={
        <span className="rounded bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">
          {PLACE.declaredCount}
        </span>
      }
      className="self-start"
    >
      <RuleNote>
        Principles 5 + 6 — each value carries its human label, whether it is
        always there, how big it is, and a live sample. You choose from prose,
        not from snake_case.
      </RuleNote>
      <ul className="max-h-[560px] divide-y divide-border overflow-y-auto">
        {OFFERED.map((v) => (
          <li key={v.name} className="px-3 py-2">
            <div className="flex items-baseline gap-1.5">
              <span className="text-[12px] font-medium text-foreground">
                {v.label}
              </span>
              <span className="rounded border border-border px-1 font-mono text-[9px] text-muted-foreground">
                {v.kind}
              </span>
              {!v.guaranteed && (
                <span className="text-[10px] text-amber-600 dark:text-amber-400">
                  · sometimes
                </span>
              )}
            </div>
            <p className="mt-0.5 font-mono text-[10px] text-muted-foreground">
              {v.name} · {v.sizeHint}
            </p>
            <p className="mt-1 text-[11px] leading-snug text-muted-foreground">
              {v.description}
            </p>
            {v.sample && (
              <p className="mt-1 truncate rounded bg-muted/60 px-1.5 py-1 font-mono text-[10px] text-foreground">
                {v.sample}
              </p>
            )}
          </li>
        ))}
        <li className="px-3 py-2 text-[11px] italic text-muted-foreground">
          …and {PLACE.declaredCount - OFFERED.length} more.
        </li>
      </ul>
    </Panel>
  );
}

function HolderSide() {
  const vars = INPUTS.filter((i) => i.kind !== "object");
  const policies = INPUTS.filter((i) => i.kind === "object");
  return (
    <Panel title="This holder needs" eyebrow="Holder" className="self-start">
      <RuleNote>
        The consuming side, standing open. Required inputs are marked here and
        again on their row.
      </RuleNote>
      <div className="space-y-3 p-3">
        <InputGroup title="Variables" items={vars} />
        <InputGroup title="Context policies" items={policies} />
      </div>
    </Panel>
  );
}

function InputGroup({ title, items }: { title: string; items: HolderInput[] }) {
  return (
    <div className="space-y-1.5">
      <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
        {title} · {items.length}
      </p>
      {items.map((i) => (
        <div
          key={i.name}
          className="rounded-md border border-border px-2 py-1.5"
        >
          <div className="flex items-baseline gap-1.5">
            <span className="text-[12px] font-medium text-foreground">
              {i.label}
            </span>
            {i.required && (
              <span className="rounded bg-amber-500/10 px-1 text-[9px] font-medium text-amber-600">
                Required
              </span>
            )}
          </div>
          <p className="font-mono text-[10px] text-muted-foreground">
            {i.name} · {i.kind}
          </p>
        </div>
      ))}
    </div>
  );
}

/* ── One mapping row ─────────────────────────────────────────────────────── */

function MappingRow({ input }: { input: HolderInput }) {
  const [mode, setMode] = useState<SourceMode>(input.mode);
  const offered = OFFERED.find((v) => v.name === input.boundTo);

  return (
    <article
      className={cn(
        "overflow-hidden rounded-xl border bg-card shadow-sm",
        input.problem ? "border-destructive/60" : "border-border",
      )}
    >
      <header className="flex items-start gap-2 px-3 pb-2 pt-2.5">
        <div className="min-w-0 flex-1">
          <div className="flex items-baseline gap-1.5">
            <h4 className="truncate text-sm font-semibold text-foreground">
              {input.label}
            </h4>
            {input.required && (
              <span className="shrink-0 rounded bg-amber-500/10 px-1.5 text-[10px] font-medium text-amber-600">
                Required
              </span>
            )}
          </div>
          <code className="block truncate font-mono text-[10px] text-muted-foreground">
            {input.name} · {input.kind}
          </code>
        </div>
      </header>

      <div className="px-3">
        <div className="grid grid-cols-4 gap-1.5">
          {MODES.map(({ id, label, icon: Icon }) => {
            const active = mode === id;
            return (
              <button
                key={id}
                type="button"
                onClick={() => setMode(id)}
                className={cn(
                  "flex min-w-0 flex-col items-center justify-center gap-1 rounded-lg border px-2 py-2 text-center transition-all",
                  active
                    ? "border-primary bg-primary/10 text-foreground shadow-sm"
                    : "border-border bg-background text-muted-foreground hover:bg-accent/50 hover:text-foreground",
                )}
              >
                <Icon
                  className={cn(
                    "h-4 w-4 shrink-0",
                    active ? "text-primary" : "text-muted-foreground",
                  )}
                />
                <span className="w-full truncate text-[11px] font-medium leading-tight">
                  {label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Fixed height — principle 2: flipping modes never shifts the list. */}
      <div className="min-h-[132px] px-3 pb-3 pt-3">
        {mode === "offered_value" && (
          <div className="space-y-2">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Offered value
            </p>
            <Inert what="open the offered-value picker">
              <span className="block w-full rounded-md border border-border px-2 py-1.5 text-[11px]">
                {offered ? (
                  <>
                    <span className="font-medium text-foreground">
                      {offered.label}
                    </span>
                    <span className="ml-1.5 font-mono text-[10px] text-muted-foreground">
                      {offered.name}
                    </span>
                    {!offered.guaranteed && (
                      <span className="ml-1.5 text-[10px] text-amber-600">
                        · sometimes
                      </span>
                    )}
                  </>
                ) : (
                  <span className="text-muted-foreground">
                    Pick an offered value…
                  </span>
                )}
              </span>
            </Inert>
            {offered?.sample && (
              <p className="truncate rounded bg-muted/60 px-1.5 py-1 font-mono text-[10px] text-foreground">
                Right now: {offered.sample}
              </p>
            )}
            {input.autoBound && (
              <p className="flex items-start gap-1 text-[10px] leading-snug text-muted-foreground">
                <Zap className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                Chosen automatically — this place declares a value named like
                this input, so it is what would happen anyway. Pick Holder
                Default to ignore it on purpose.
              </p>
            )}
            {offered && !offered.guaranteed && (
              <Inert what="choose what happens when this value is absent">
                <span className="block rounded-md border border-border px-2 py-1.5 text-[11px]">
                  If absent: skip it
                </span>
              </Inert>
            )}
            {input.problem && (
              <p className="flex items-start gap-1 text-[10px] leading-snug text-destructive">
                <AlertTriangle className="mt-0.5 h-2.5 w-2.5 shrink-0" />
                {input.problem}
              </p>
            )}
          </div>
        )}

        {mode === "holder_default" && (
          <div className="space-y-2 text-[11px] leading-relaxed text-muted-foreground">
            <p>
              The holder will use its own built-in value for this input at run
              time.
            </p>
            <div className="rounded-lg border border-border bg-muted/40 px-2.5 py-2">
              <p className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                Current holder default
              </p>
              {input.defaultValue ? (
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[12px] leading-snug text-foreground">
                  {input.defaultValue}
                </pre>
              ) : (
                <p className="mt-1 text-[12px] italic text-muted-foreground/80">
                  Not set on the holder
                </p>
              )}
            </div>
            {input.boundTo && (
              <p className="text-amber-600 dark:text-amber-400">
                Note: this place offers{" "}
                <span className="font-medium text-foreground">
                  {OFFERED.find((v) => v.name === input.boundTo)?.label}
                </span>
                . Picking <strong>Offered Value</strong> would bind to it;{" "}
                <strong>Holder Default</strong> explicitly ignores it.
              </p>
            )}
          </div>
        )}

        {mode === "direct_value" && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Value
            </p>
            <Inert what="edit the literal sent every run">
              <span className="block w-full rounded-md border border-border px-2 py-1.5 font-mono text-[11px]">
                {input.literal || `Holder default: ${input.defaultValue ?? "—"}`}
              </span>
            </Inert>
            <p className="text-[10px] text-muted-foreground">
              Preview:{" "}
              <code className="font-mono">
                {JSON.stringify(input.literal ?? "")}
              </code>
            </p>
          </div>
        )}

        {mode === "prompt_user" && (
          <div className="space-y-1.5">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Prompt text
            </p>
            <Inert what="edit what the user is asked at launch">
              <span className="block w-full rounded-md border border-border px-2 py-1.5 text-[11px]">
                {input.prompt || "What should we ask the user?"}
              </span>
            </Inert>
            <p className="text-[10px] leading-snug text-muted-foreground">
              Asking for anything means this job cannot run instantly — see the
              bar at the bottom.
            </p>
          </div>
        )}
      </div>
    </article>
  );
}

/* ── AI map ──────────────────────────────────────────────────────────────── */

const AI_ROWS = [
  {
    target: "working_text",
    value: "cleaned_transcript_text",
    confidence: "high",
    reason:
      "The only long-form text this place offers, and the input is required.",
  },
  {
    target: "session_label",
    value: "session_title",
    confidence: "high",
    reason: "Exact meaning match; always available.",
  },
  {
    target: "pane_origin",
    value: "active_pane",
    confidence: "medium",
    reason: "Plausible, but the pane can be empty mid-navigation.",
  },
  {
    target: "word_total",
    value: "raw_word_count",
    confidence: "low",
    reason:
      "The holder may mean cleaned words rather than raw — worth a look before you accept.",
  },
];

const DOT: Record<string, string> = {
  high: "bg-emerald-500",
  medium: "bg-amber-500",
  low: "bg-red-400",
};

function AiMapTab({ onAccept }: { onAccept: () => void }) {
  return (
    <div className="space-y-3 p-3">
      <p className="flex items-start gap-1.5 text-[11px] leading-relaxed text-muted-foreground">
        <Sparkles className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" />
        A mandate read this place&apos;s {PLACE.declaredCount} offered values and
        the holder&apos;s {INPUTS.length} inputs and proposed a map. Nothing is
        applied until you accept it.
      </p>
      <div className="space-y-1.5">
        {AI_ROWS.map((r) => (
          <div
            key={r.target}
            className="rounded-md border border-border px-2.5 py-2"
          >
            <p className="flex items-center gap-1.5 text-[11px]">
              <span
                className={cn("h-1.5 w-1.5 rounded-full", DOT[r.confidence])}
              />
              <span className="font-medium text-foreground">{r.target}</span>
              <span className="text-muted-foreground">←</span>
              <span className="font-mono text-[10px] text-muted-foreground">
                {r.value}
              </span>
            </p>
            <p className="mt-0.5 text-[10px] leading-snug text-muted-foreground">
              {r.reason}
            </p>
          </div>
        ))}
      </div>
      <p className="flex items-start gap-1.5 text-[10px] leading-snug text-amber-600 dark:text-amber-500">
        <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" />
        Skipped 2 suggestions that named things this place or holder does not
        have: transcript_summary; speaker_notes.
      </p>
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={onAccept}
          className="inline-flex items-center gap-1.5 rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground"
        >
          <Check className="h-3.5 w-3.5" />
          Use this configuration
        </button>
        <Inert what="ask the mandate for another proposal">
          <span className="rounded-md px-2.5 py-1.5 text-[11px]">Try again</span>
        </Inert>
      </div>
      <p className="text-[10px] text-muted-foreground">
        Accepting opens the mapping editor with everything filled in — you can
        still change any line before saving.
      </p>
    </div>
  );
}

/* ── Batch mode ──────────────────────────────────────────────────────────── */

const HEALTH: Record<string, string> = {
  green: "text-emerald-500",
  amber: "text-amber-500",
  red: "text-red-500",
};

function MapManyPlaces() {
  return (
    <Panel
      title="Map many places"
      eyebrow="Batch"
      count={
        <span className="rounded bg-muted px-1.5 text-[10px] font-normal text-muted-foreground">
          {BATCH_ROWS.length} places
        </span>
      }
    >
      <RuleNote>
        Principle 17 — the same middle, transposed. Places are rows, the
        holder&apos;s inputs are columns, and every cell is the same four-source
        picker. A mapping copied from one place self-heals against the next
        place&apos;s values, or goes red and asks you.
      </RuleNote>
      <div className="overflow-x-auto">
        <table className="w-full min-w-[900px] text-[11px]">
          <thead>
            <tr className="border-b border-border bg-muted/40">
              <th className="sticky left-0 z-10 bg-muted/40 px-3 py-2 text-left font-medium text-muted-foreground">
                Place
              </th>
              {INPUTS.map((i) => (
                <th
                  key={i.name}
                  className="px-2 py-2 text-left font-medium text-foreground"
                >
                  <span className="block truncate">
                    {i.label}
                    {i.required && (
                      <span className="text-amber-600"> *</span>
                    )}
                  </span>
                  <Inert what="fill this column down to every row">
                    <span className="mt-0.5 block text-[9px] font-normal text-muted-foreground">
                      fill down ↓
                    </span>
                  </Inert>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {BATCH_ROWS.map((row) => (
              <tr key={row.place} className="border-b border-border">
                <td className="sticky left-0 z-10 bg-card px-3 py-2">
                  <div className="flex items-center gap-1.5">
                    <Circle
                      className={cn("h-2.5 w-2.5 fill-current", HEALTH[row.health])}
                    />
                    <span className="rounded bg-muted px-1 text-[9px] font-medium text-muted-foreground">
                      {row.op}
                    </span>
                    <span className="font-medium text-foreground">
                      {row.label}
                    </span>
                  </div>
                  <span className="ml-6 block font-mono text-[9px] text-muted-foreground">
                    {row.place}
                  </span>
                </td>
                {row.cells.map((cell, idx) => (
                  <td key={idx} className="px-2 py-2 align-top">
                    <Inert what="open this cell's four-source picker">
                      <span
                        className={cn(
                          "block truncate rounded border px-1.5 py-1 font-mono text-[10px]",
                          cell === "—"
                            ? "border-dashed border-border text-muted-foreground"
                            : "border-border text-foreground",
                        )}
                      >
                        {cell}
                      </span>
                    </Inert>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center gap-3 border-t border-border px-3 py-2 text-[11px]">
        <span className="text-muted-foreground">2 add · 2 update</span>
        <span className="text-red-500">1 needs attention</span>
        <span className="flex-1" />
        <Inert what="write every row in one batch">
          <span className="rounded-md bg-primary px-2.5 py-1.5 text-[11px] font-medium text-primary-foreground">
            Apply 4
          </span>
        </Inert>
      </div>
      <p className="border-t border-border/70 bg-muted/30 px-3 py-1.5 text-[10px] leading-relaxed text-muted-foreground">
        Apply is refused while any red cell stands:{" "}
        <span className="italic">
          &ldquo;1 required input is still unmapped. Fix the red cells
          first.&rdquo;
        </span>
      </p>
    </Panel>
  );
}

/* ── The narrated promise ────────────────────────────────────────────────── */

function AutoRunBar() {
  const asks = INPUTS.filter((i) => i.mode === "prompt_user").map((i) => i.name);
  const eligible = asks.length === 0;
  return (
    <Panel title="What happens when this fires" eyebrow="Auto-run">
      <RuleNote>
        Principle 14 — the promise is offerable only when the mapping actually
        leaves nothing to ask, and the sentence changes live as you edit above.
      </RuleNote>
      <div
        className={cn(
          "flex items-start gap-3 px-3 py-3",
          !eligible && "opacity-70",
        )}
      >
        <Zap
          className={cn(
            "mt-0.5 h-4 w-4 shrink-0",
            eligible ? "text-primary" : "text-muted-foreground",
          )}
        />
        <div className="min-w-0 flex-1">
          <p className="text-[12px] font-medium text-foreground">Run instantly</p>
          <p className="mt-0.5 text-[11px] leading-snug text-muted-foreground">
            {eligible
              ? "Runs instantly — every input is mapped, nothing to ask."
              : `Waits for you to press Run — this mapping asks for ${asks.join(", ")}.`}
          </p>
        </div>
        <Inert what="turn auto-run on for this binding">
          <span className="rounded-full border border-border px-3 py-1 text-[10px] text-muted-foreground">
            {eligible ? "off" : "unavailable"}
          </span>
        </Inert>
      </div>
    </Panel>
  );
}
