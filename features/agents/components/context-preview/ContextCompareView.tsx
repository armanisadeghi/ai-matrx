"use client";

/**
 * ContextCompareView — the owner's side-by-side of the agent's context, the
 * CURRENT system beside the RECORD STORE (lane SC-3', SCOPES-CONTEXT-TRANSITION
 * P9). Old and new stay side by side until the owner validates; nothing here
 * redirects, writes, or prefers one side.
 *
 * Both columns come from ONE server call (`POST /ai/context/preview`,
 * `path: "both"`), which runs both resolvers through the same post-resolver
 * code the agent-run path runs, so the only difference between the columns is
 * which resolver answered. Every difference arrives CLASSED by the server with
 * its own sentence: copy lag, a declared tier move, an old-path delivery
 * without a check (the new side does not copy that gap — the page labels it),
 * or a defect. The diff is on the VALUE, so one changed value moves it
 * (DD-251).
 *
 * FOUR TABS (lane INSPECTOR-DIFF, Arman 2026-09-25: "The data is definitely not
 * byte-identical so you should just set up a diff view"). "What the model gets
 * today" is the server's `delivered.today` — the bytes of the ONE assembler an
 * agent run calls (`turn_context.assemble_turn_context`), stamped with its
 * provenance (function, module, git sha). "Record store" is the same function
 * with the record store answering. "Diff" (the default) puts the compare's
 * structural findings over a real diff of the two — first what the model is
 * fed, then the values each resolver answered (the `<agent_context>`
 * rendering, which the model is fed only when a turn has no organization).
 * "Selection" is what was sent and the exact arguments both sides received.
 *
 * "Answer on both paths" runs one real agent turn per resolver on the same
 * question (`POST /ai/context/preview/answer-both`): same agent, instructions
 * and model, tools off, nothing persisted. It needs the agent whose answer is
 * being compared. Where the host lets the person choose one (`onAgentChange`,
 * the context inspector), the ONE agent picker (`AgentListDropdown`) sits on
 * the action; where it does not (a chat's panel, whose agent is the chat's),
 * without an agent the sentence says where to open it from.
 */

import { useEffect, useState } from "react";
import { DiffViewer } from "@ai-matrx/diff/react";
import { AlertTriangle, BrainCircuit, ChevronDown, GitCompareArrows, MessageSquareText, RefreshCw } from "lucide-react";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";
import MarkdownStream from "@/components/MarkdownStream";
import { SystemItemsLine } from "./SystemItemsLine";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsList } from "@/features/agents/redux/agent-definition/thunks";
import { callApi } from "@/lib/api/call-api";
import { resolveRunWait } from "@/lib/api/run-wait";
import { peekSelectedOrganizationId } from "@/lib/api/organization-admission";
import { getUserId } from "@/utils/auth/getUserId";
import { extractErrorMessage } from "@/utils/errors";
import type { components } from "@/types/python-generated/api-types";
import { usePageCaptureContribution } from "@/components/agent-copy/page-capture/usePageCapture";
import { useContextPreview, type ContextSelection } from "./useContextPreview";

type ContextCompare = components["schemas"]["ContextCompare"];
type CompareSide = components["schemas"]["ContextCompareSide"];
type Difference = components["schemas"]["ContextCompareDifference"];
type AnswerBoth = components["schemas"]["ContextAnswerBothResponse"];
type Delivered = components["schemas"]["ContextDelivered"];
type DeliveredSide = components["schemas"]["ContextDeliveredSide"];
type Provenance = components["schemas"]["ContextProvenance"];

/** The inspector's four result tabs; `diff` is the default. */
export type CompareTab = "diff" | "today" | "store" | "selection";
type DifferenceClass = Difference["difference_class"];

/** Each class, in plain words and a colour the reader can scan for. */
const CLASS_LOOK: Record<DifferenceClass, { label: string; className: string }> = {
  defect: {
    label: "Defect",
    className: "bg-destructive/10 text-destructive border-destructive/40",
  },
  "old path delivered without a check": {
    label: "Old path delivered without a check",
    className:
      "bg-amber-500/10 text-amber-700 dark:text-amber-300 border-amber-500/40",
  },
  "copy lag": {
    label: "Copy lag",
    className: "bg-muted text-muted-foreground border-border",
  },
  "declared tier move": {
    label: "Declared tier move",
    className: "bg-primary/10 text-primary border-primary/30",
  },
};

const CLASS_ORDER: DifferenceClass[] = [
  "defect",
  "old path delivered without a check",
  "copy lag",
  "declared tier move",
];

function show(value: unknown): string {
  if (value === null || value === undefined) return "";
  if (typeof value === "string") return value;
  if (typeof value === "object" && value && "value" in (value as Record<string, unknown>)) {
    return show((value as Record<string, unknown>).value);
  }
  try {
    return JSON.stringify(value, null, 2);
  } catch {
    return String(value);
  }
}

/** The one context item a compare is narrowed to (the inspector's last step). */
export interface CompareFocus {
  itemId: string;
  key: string;
  label: string;
}

/**
 * The lines of an `<agent_context>` block that carry one item key — its
 * `key: value  [source]` line, or one `key [scope]: value` line per scope.
 */
export function focusLines(block: string, key: string): string[] {
  return block
    .split("\n")
    .filter((line) => {
      const t = line.trim();
      return t.startsWith(`${key}:`) || t.startsWith(`${key} [`);
    });
}

/** Why a focused item is not in a side's block, in words — from the side's own tiers. */
function notInBlockSentence(side: CompareSide, focus: CompareFocus): string {
  if (focus.key in (side.tool_accessible ?? {})) {
    return `${focus.label} is not written into the block: it is tool-accessible, so the agent reads it with get_context_variable("${focus.key}") when it needs it.`;
  }
  if (focus.key in (side.searchable ?? {})) {
    return `${focus.label} is not written into the block: it is searchable, so the agent finds it by searching the context.`;
  }
  return `This side does not hand the agent ${focus.label} for this scope.`;
}

/** Where the values blocks come from — the compare's own resolvers, said on the page. */
const VALUES_PROVENANCE: Record<"old" | "new", string> = {
  old: "From context_compare._old_side: build_agent_context(path=\"old\") answered by the current context system, rendered by AgentContext.build_system_prompt_block. With an organization the model is not fed this block; it gets these values through its bound variables and context tools.",
  new: "From context_compare._new_side: the record store's custom.resolve_context, through the same post-resolver code, rendered by AgentContext.build_system_prompt_block. With an organization the model is not fed this block either.",
};

function Block({
  side,
  title,
  focus,
}: {
  side: CompareSide;
  title: string;
  focus?: CompareFocus;
}) {
  const fullBlock = side.block ?? "";
  const focused = focus ? focusLines(fullBlock, focus.key) : null;
  const block = focused ? focused.join("\n") : fullBlock;
  return (
    <div className="min-w-0 flex-1" data-compare-side={side.path}>
      <div className="flex items-baseline gap-2">
        <h4 className="text-[11px] font-semibold uppercase tracking-wider text-primary">{title}</h4>
        <span className="text-[10px] tabular-nums text-muted-foreground">
          {side.scope_ids?.length ?? 0} scope{(side.scope_ids?.length ?? 0) === 1 ? "" : "s"}
          {typeof side.resolve_ms === "number" ? ` · ${Math.round(side.resolve_ms)} ms` : ""}
        </span>
      </div>
      {!side.available ? (
        <div className="mt-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-foreground">
          {side.unavailable_reason ?? "This side did not answer."}
        </div>
      ) : focus && focused && focused.length === 0 ? (
        <div
          className="mt-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-foreground"
          data-focus-absent
        >
          {notInBlockSentence(side, focus)}
        </div>
      ) : block ? (
        <div className="group/block relative mt-1.5">
          <pre className="whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
            {block}
          </pre>
          <InlineCopyButton
            content={block}
            formatJson={false}
            size="sm"
            className="opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/block:opacity-100"
          />
        </div>
      ) : (
        <div className="mt-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs italic text-muted-foreground">
          No block — this side delivers no context for this selection.
        </div>
      )}
      <p className="mt-1 text-[11px] leading-snug text-muted-foreground" data-provenance-values={side.path}>
        {VALUES_PROVENANCE[side.path]}
      </p>
    </div>
  );
}

/** The provenance line every tab prints — the server's own sentence, then its identity. */
function ProvenanceLine({ stamp }: { stamp?: Provenance | null }) {
  if (!stamp) return null;
  return (
    <p className="text-[11px] leading-snug text-muted-foreground" data-provenance={stamp.resolver}>
      {stamp.says}{" "}
      <span className="font-mono text-foreground/70">
        {stamp.module}.{stamp.function} @ {stamp.git_sha.slice(0, 10)}
      </span>
    </p>
  );
}

/** One copyable monospaced block of what the model is fed. */
function FedBlock({ label, text, slot }: { label: string; text?: string | null; slot: string }) {
  return (
    <div className="min-w-0" data-fed-block={slot}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      {text ? (
        <div className="group/block relative mt-1">
          <pre className="max-h-[28rem] overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
            {text}
          </pre>
          <InlineCopyButton
            content={text}
            formatJson={false}
            size="sm"
            className="opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/block:opacity-100"
          />
        </div>
      ) : (
        <p className="mt-1 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs italic text-muted-foreground">
          Nothing — this turn is fed no {slot === "intro" ? "intro" : "selection block"}.
        </p>
      )}
    </div>
  );
}

function bytesLine(side: DeliveredSide): string {
  if (!side.available) return side.unavailable_reason ?? "This side did not answer.";
  if (!side.injected_block) return "No block — nothing is fed for this selection.";
  return `${(side.block_byte_length ?? 0).toLocaleString()} bytes · sha256 ${(side.block_sha256 ?? "").slice(0, 12)}`;
}

/** One side of what the model is fed, exactly — the "today" and "record store" tabs. */
function FedSide({
  side,
  values,
  valuesTitle,
  says,
  focus,
}: {
  side: DeliveredSide | undefined;
  values: CompareSide;
  valuesTitle: string;
  says?: string;
  focus?: CompareFocus;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-3" data-fed-side={side?.path ?? "missing"}>
      {side ? (
        <>
          <ProvenanceLine stamp={side.provenance} />
          <p className="text-xs tabular-nums text-foreground" data-fed-bytes>
            {bytesLine(side)}
          </p>
          {side.available && (
            <>
              <FedBlock label="System prompt — the first turn only" text={side.intro} slot="intro" />
              <FedBlock label="Every message — the selection" text={side.active} slot="active" />
            </>
          )}
          {says && <p className="text-xs text-muted-foreground">{says}</p>}
        </>
      ) : (
        <NoDelivered />
      )}
      <Block side={values} title={valuesTitle} focus={focus} />
    </div>
  );
}

/** An older server that does not report what the model is fed — said, never blank. */
function NoDelivered() {
  return (
    <p className="rounded-md border border-border bg-muted/30 px-3 py-2 text-xs text-foreground" data-fed-missing>
      The server answering is older than this page: it does not yet report the exact bytes the
      model is fed. They appear here once that version is live; the values below are the
      resolvers&apos; answers.
    </p>
  );
}

/** The Diff tab: the structural findings, then a real diff of what is fed and of the values. */
function DiffTab({
  compare,
  delivered,
  focus,
}: {
  compare: ContextCompare;
  delivered?: Delivered | null;
  focus?: CompareFocus;
}) {
  const today = delivered?.today;
  const store = delivered?.record_store;
  const valuesOld = compare.old.block ?? "";
  const valuesNew = compare.new.block ?? "";
  const shownOld = focus ? focusLines(valuesOld, focus.key).join("\n") : valuesOld;
  const shownNew = focus ? focusLines(valuesNew, focus.key).join("\n") : valuesNew;
  let fedVerdict: string;
  if (!today) fedVerdict = "";
  else if (!store || !store.available)
    fedVerdict = `The record store could not be fed through the same function: ${store?.unavailable_reason ?? "it did not answer"}.`;
  else if (delivered?.identical)
    fedVerdict = `Byte-identical — both systems feed the model the same ${(today.block_byte_length ?? 0).toLocaleString()} bytes (sha256 ${(today.block_sha256 ?? "").slice(0, 12)}).`;
  else
    fedVerdict = `Different — ${(today.block_byte_length ?? 0).toLocaleString()} bytes today, ${(store.block_byte_length ?? 0).toLocaleString()} bytes from the record store.`;
  return (
    <div className="flex flex-col" data-compare-diff>
      <Summary compare={compare} />
      <section className="px-4 pt-4" data-diff-fed>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-primary">What the model is fed</h3>
        {today ? (
          <>
            <p
              className={cn(
                "mt-1 text-sm font-medium",
                delivered?.identical ? "text-foreground" : "text-amber-700 dark:text-amber-300",
              )}
              data-fed-identical={String(Boolean(delivered?.identical))}
            >
              {fedVerdict}
            </p>
            <div className="mt-1 space-y-0.5">
              <ProvenanceLine stamp={today.provenance} />
              {store?.available && <ProvenanceLine stamp={store.provenance} />}
            </div>
            {store?.available && (
              <div className="mt-2 overflow-hidden rounded-md border border-border" data-diff-viewer="fed">
                <DiffViewer
                  original={today.injected_block ?? ""}
                  modified={store.injected_block ?? ""}
                  originalLabel="What the model gets today"
                  modifiedLabel="Record store"
                  engine="light"
                  defaultView="inline"
                  showLineNumbers
                  wrap
                  readOnly
                />
              </div>
            )}
          </>
        ) : (
          <div className="mt-1">
            <NoDelivered />
          </div>
        )}
      </section>
      <section className="px-4 pt-4" data-diff-values>
        <h3 className="text-[11px] font-semibold uppercase tracking-wider text-primary">
          The values each system answered
        </h3>
        <p className="mt-1 text-xs text-muted-foreground">
          {focus ? `${focus.label} only. ` : ""}
          The current system&apos;s resolver beside the record store&apos;s, rendered the same way.
          With an organization this rendering is not in the prompt; it is what the agent can reach
          through its bound variables and context tools.
        </p>
        {compare.old.available && compare.new.available ? (
          shownOld === shownNew ? (
            <div className="mt-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-foreground" data-values-identical>
              {shownOld ? "Identical on both systems:" : "Neither system delivers a value here."}
              {shownOld && (
                <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed">{shownOld}</pre>
              )}
            </div>
          ) : (
            <div className="mt-2 overflow-hidden rounded-md border border-border" data-diff-viewer="values">
              <DiffViewer
                original={shownOld}
                modified={shownNew}
                originalLabel="Current system"
                modifiedLabel="Record store"
                engine="light"
                defaultView="inline"
                showLineNumbers
                wrap
                readOnly
              />
            </div>
          )
        ) : (
          <p className="mt-1.5 rounded-md border border-border bg-muted/30 px-2.5 py-2 text-xs text-foreground">
            {(!compare.old.available ? compare.old.unavailable_reason : compare.new.unavailable_reason) ??
              "One side did not answer."}
          </p>
        )}
      </section>
      <Differences
        differences={
          focus
            ? (compare.differences ?? []).filter((d) => d.item_id === focus.itemId)
            : (compare.differences ?? [])
        }
      />
    </div>
  );
}

/** One labelled JSON value in the Selection tab. */
function JsonBlock({ label, value, slot }: { label: string; value: unknown; slot: string }) {
  const text = JSON.stringify(value ?? null, null, 2);
  return (
    <div className="min-w-0" data-selection-block={slot}>
      <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">{label}</div>
      <div className="group/block relative mt-1">
        <pre className="overflow-auto whitespace-pre-wrap break-all rounded-md border border-border bg-muted/40 px-2.5 py-2 font-mono text-[11px] leading-relaxed text-foreground">
          {text}
        </pre>
        <InlineCopyButton
          content={text}
          formatJson={false}
          size="sm"
          className="opacity-0 transition-opacity pointer-coarse:opacity-100 group-hover/block:opacity-100"
        />
      </div>
    </div>
  );
}

function SelectionTab({
  sent,
  compare,
  delivered,
}: {
  sent?: ContextSelection;
  compare: ContextCompare;
  delivered?: Delivered | null;
}) {
  return (
    <div className="flex flex-col gap-3 px-4 pt-3" data-compare-selection>
      <p className="text-[11px] leading-snug text-muted-foreground" data-provenance="selection">
        Sent to POST /ai/context/preview. The server expanded it once
        (context_selection.resolve_context_selection) and handed BOTH sides the same arguments
        below — the ones an agent run passes to {delivered?.today.provenance?.function ?? "assemble_turn_context"} for
        a new conversation.
      </p>
      {sent && <JsonBlock label="What this page sent" value={sent} slot="sent" />}
      <JsonBlock label="The selection both sides received" value={compare.selection} slot="expanded" />
      {delivered ? (
        <JsonBlock label="The assembler's arguments (both sides)" value={delivered.arguments} slot="arguments" />
      ) : (
        <NoDelivered />
      )}
    </div>
  );
}

function Summary({ compare }: { compare: ContextCompare }) {
  const counts = compare.counts ?? {};
  const total = (compare.differences ?? []).length;
  return (
    <section className="px-4 pt-3">
      <div
        className={cn(
          "rounded-md border px-3 py-2",
          (compare.defects ?? 0) > 0
            ? "border-destructive/40 bg-destructive/5"
            : "border-primary/20 bg-primary/5",
        )}
        data-compare-summary
      >
        <p className="text-sm font-medium text-foreground">
          {(compare.defects ?? 0) > 0
            ? `${compare.defects} defect${compare.defects === 1 ? "" : "s"} — the two systems disagree where they should not.`
            : total === 0
              ? "Identical — both systems hand the agent the same values."
              : "No defects — every difference below has a known reason."}
        </p>
        <p className="mt-0.5 text-xs tabular-nums text-muted-foreground">
          {compare.identical_cells ?? 0} identical value{compare.identical_cells === 1 ? "" : "s"}
          {CLASS_ORDER.filter((c) => counts[c]).map((c) => ` · ${counts[c]} ${CLASS_LOOK[c].label.toLowerCase()}`)}
        </p>
        <p className="mt-1.5 text-xs text-foreground/90">{compare.ruling}</p>
        <p className="mt-1 text-xs text-muted-foreground">{compare.follow.says}</p>
        {(compare.excluded ?? []).map((e) => (
          <p key={e} className="mt-1 text-xs text-muted-foreground">
            {e}
          </p>
        ))}
        <SystemItemsLine items={compare.system_items} />
      </div>
    </section>
  );
}

function Differences({ differences }: { differences: Difference[] }) {
  if (differences.length === 0) return null;
  const sorted = [...differences].sort(
    (a, b) => CLASS_ORDER.indexOf(a.difference_class) - CLASS_ORDER.indexOf(b.difference_class),
  );
  return (
    <section className="px-4 pt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Every difference
      </h3>
      <ul className="mt-1.5 divide-y divide-border/60 rounded-md border border-border">
        {sorted.map((d, i) => {
          const look = CLASS_LOOK[d.difference_class];
          return (
            <li
              key={`${d.item_id}:${d.scope_id ?? ""}:${i}`}
              className="px-2.5 py-2"
              data-difference-class={d.difference_class}
            >
              <div className="flex flex-wrap items-center gap-2">
                <span className="min-w-0 truncate font-mono text-xs font-semibold text-foreground">
                  {d.key}
                </span>
                {d.scope_name && (
                  <span className="text-[11px] text-muted-foreground">on {d.scope_name}</span>
                )}
                <span className="flex-1" />
                <span className={cn("shrink-0 rounded-full border px-1.5 py-0.5 text-[10px] font-medium", look.className)}>
                  {look.label}
                </span>
              </div>
              <p className="mt-1 text-xs leading-relaxed text-foreground/90">{d.why}</p>
              {(d.old_value !== undefined || d.new_value !== undefined) &&
                show(d.old_value) !== show(d.new_value) && (
                  <div className="mt-1.5 grid gap-1.5 sm:grid-cols-2">
                    {(["old", "new"] as const).map((p) => {
                      const v = show(p === "old" ? d.old_value : d.new_value);
                      return (
                        <div key={p} className="min-w-0">
                          <div className="text-[10px] font-medium uppercase tracking-wider text-muted-foreground">
                            {p === "old" ? "Current system" : "Record store"}
                          </div>
                          <div className="whitespace-pre-wrap break-words rounded bg-muted/40 px-2 py-1 font-mono text-[11px] text-foreground/90">
                            {v || <span className="italic text-muted-foreground">(not delivered)</span>}
                          </div>
                        </div>
                      );
                    })}
                  </div>
                )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}

/** What the new side decided, record by record, for this person. */
function Checks({ side }: { side: CompareSide }) {
  const checks = side.checks ?? [];
  const withheld = side.withheld ?? [];
  if (checks.length === 0 && withheld.length === 0) return null;
  return (
    <section className="px-4 pt-4">
      <h3 className="text-[11px] font-semibold uppercase tracking-wider text-primary">
        Checked for you on the new side
      </h3>
      <ul className="mt-1.5 divide-y divide-border/60 rounded-md border border-border">
        {checks.map((c, i) => (
          <li key={`${c.record_id}:${c.via}:${i}`} className="px-2.5 py-2 text-xs" data-check-admitted={c.admitted}>
            <div className="flex items-center gap-2">
              <span className="min-w-0 flex-1 truncate font-medium text-foreground">
                {c.name || "A scope you were given"}
              </span>
              <span className="shrink-0 text-[10px] text-muted-foreground">
                {c.via === "selection"
                  ? "you selected it"
                  : c.via === "entity_tag"
                    ? "tagged to this chat"
                    : c.via === "project_tag"
                      ? "tagged to its project"
                      : c.via}
              </span>
              <span
                className={cn(
                  "shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium",
                  c.admitted ? "bg-primary/10 text-primary" : "bg-muted text-muted-foreground",
                )}
              >
                {c.admitted ? "you may read it" : "not delivered"}
              </span>
            </div>
            {c.says && <p className="mt-1 text-muted-foreground">{c.says}</p>}
          </li>
        ))}
        {withheld.map((w, i) => (
          <li key={`w:${i}`} className="px-2.5 py-2 text-xs">
            <span className="font-mono font-semibold text-foreground">{show(w.key)}</span>
            {w.record_name ? <span className="text-muted-foreground"> on {show(w.record_name)}</span> : null}
            <span className="text-muted-foreground"> — withheld: {show(w.reason)}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * The agent the two answers come from — a thin binding of THE agent picker
 * (`AgentListDropdown`, `@ai-matrx/agents/catalog/react`; `pnpm
 * check:canonical-pickers`), never a second list.
 */
function AnswerAgentPicker({
  agentId,
  onAgentChange,
}: {
  agentId?: string;
  onAgentChange: (agentId: string | null) => void;
}) {
  const dispatch = useAppDispatch();
  const agents = useAppSelector(selectAllAgents);
  useEffect(() => {
    void dispatch(fetchAgentsList());
  }, [dispatch]);
  const chosenName = agentId ? ((agents?.[agentId]?.name as string | undefined) ?? null) : null;
  return (
    <div data-answer-agent={agentId ?? ""}>
      <AgentListDropdown
        consumerId="context-inspector-answer-both"
        activeAgentId={agentId ?? null}
        onSelect={(id: string) => onAgentChange(id || null)}
        label={chosenName ?? "Choose an agent"}
        showPinnedAgent={Boolean(agentId)}
        triggerSlot={
          <Button type="button" variant="outline" size="sm" className="h-7 max-w-full justify-between gap-1.5 text-xs font-normal">
            <span className="flex min-w-0 items-center gap-1.5">
              <BrainCircuit className="h-3 w-3 shrink-0 text-muted-foreground" />
              <span className="truncate">{chosenName ?? (agentId ? "This agent" : "Choose an agent")}</span>
            </span>
            <ChevronDown className="h-3 w-3 shrink-0 text-muted-foreground" />
          </Button>
        }
      />
    </div>
  );
}

function AnswerBoth({
  agentId,
  onAgentChange,
  conversationId,
  selection,
}: {
  agentId?: string;
  /** The host lets the person choose the agent (the inspector); absent in a chat's panel. */
  onAgentChange?: (agentId: string | null) => void;
  conversationId?: string;
  selection?: ContextSelection;
}) {
  const dispatch = useAppDispatch();
  const [question, setQuestion] = useState("");
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<AnswerBoth | null>(null);
  const agents = useAppSelector(selectAllAgents);
  const agentName = agentId ? ((agents?.[agentId]?.name as string | undefined) ?? null) : null;
  // The alchemy capture: the chosen agent, the question, and both answers.
  usePageCaptureContribution(
    "context-compare:answer-both",
    () => [
      {
        id: "answers",
        title: "Answer on both paths",
        role: "data",
        value: {
          agent: { id: agentId ?? null, name: agentName },
          question: question || null,
          running,
          error,
          result,
        },
        brief: result ? result.says : running ? "Answering twice" : "Not asked",
      },
    ],
    `${agentId}|${agentName}|${running}|${error}|${result ? "r" : ""}|${question.length}`,
  );

  const heading = (
    <h3 className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-primary">
      <MessageSquareText className="h-3 w-3" />
      Answer on both paths
    </h3>
  );
  const picker = onAgentChange ? (
    <AnswerAgentPicker agentId={agentId} onAgentChange={onAgentChange} />
  ) : null;

  if (!agentId) {
    return (
      <section className="px-4 pt-4" data-answer-both-needs-agent>
        {heading}
        <p className="mt-1 text-xs text-muted-foreground">
          {picker
            ? "Choose the agent whose answer you want to compare, then ask it one question on both systems."
            : "Answering needs the agent whose answer you want to compare. Open this panel from a chat with that agent, and the question box appears here."}
        </p>
        {picker && <div className="mt-1.5">{picker}</div>}
      </section>
    );
  }

  const run = () => {
    const q = question.trim();
    if (!q) return;
    setRunning(true);
    setError(null);
    // Two real agent turns answer before the server sends a byte, so the 15-second JSON default
    // would cut every answer off. The wait is the organization's run-wait knob for a text reply
    // (agents.run_wait.text_seconds) — the same wait a chat turn gets — never a number chosen here.
    void resolveRunWait(peekSelectedOrganizationId(), getUserId() ?? null, "text")
      .then((wait) =>
        dispatch(
          callApi({
            path: "/ai/context/preview/answer-both",
            method: "POST",
            body: {
              conversation_id: conversationId ?? null,
              agent_id: agentId,
              question: q,
              ...(selection ? { selection } : {}),
            },
            ...(selection ? { scopeOverrides: { organization_id: selection.organization_id } } : {}),
            connectTimeoutMs: wait.firstResponseMs,
            totalTimeoutMs: null,
          }),
        ),
      )
      .then((res) => {
      setRunning(false);
      if (res.error) {
        const detail = res.error.serverDetail ? extractErrorMessage(res.error.serverDetail) : "";
        setError(detail || res.error.message || "The two answers could not be produced.");
        return;
      }
      setResult((res.data ?? null) as AnswerBoth | null);
    });
  };

  return (
    <section className="px-4 pt-4" data-answer-both>
      {heading}
      {picker && <div className="mt-1.5">{picker}</div>}
      <p className="mt-1 text-xs text-muted-foreground">
        One real turn of this agent per system, same instructions and model, tools off, nothing
        saved to the chat.
      </p>
      <Textarea
        value={question}
        onChange={(e) => setQuestion(e.target.value)}
        placeholder="Ask the question you want both systems to answer"
        className="mt-1.5 min-h-[64px] text-base md:text-sm"
      />
      <div className="mt-1.5 flex items-center gap-2">
        <Button size="sm" onClick={run} disabled={running || !question.trim()} className="h-7 gap-1.5 text-xs">
          {running ? <RefreshCw className="h-3 w-3 animate-spin" /> : <GitCompareArrows className="h-3 w-3" />}
          {running ? "Answering twice…" : "Answer on both paths"}
        </Button>
      </div>
      {error && (
        <div className="mt-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
          {error}
        </div>
      )}
      {result && (
        <div className="mt-2">
          <p className="text-xs text-muted-foreground">{result.says}</p>
          <div className="mt-1.5 grid gap-2 sm:grid-cols-2">
            {(["old", "new"] as const).map((p) => {
              const a = result.answers.find((x) => x.path === p);
              return (
                <div key={p} className="min-w-0 rounded-md border border-border px-2.5 py-2" data-answer-path={p}>
                  <div className="flex items-baseline gap-2">
                    <span className="text-[11px] font-semibold uppercase tracking-wider text-primary">
                      {p === "old" ? "Current system" : "Record store"}
                    </span>
                    <span className="text-[10px] tabular-nums text-muted-foreground">
                      {a?.model && !/^[0-9a-f-]{36}$/i.test(a.model) ? a.model : ""}
                      {typeof a?.duration_ms === "number" ? ` ${(a.duration_ms / 1000).toFixed(1)} s` : ""}
                      {typeof a?.input_tokens === "number" ? ` · ${a.input_tokens.toLocaleString()} tokens in` : ""}
                    </span>
                  </div>
                  {a?.error ? (
                    <p className="mt-1 text-xs text-destructive">{a.error}</p>
                  ) : (
                    // The platform's markdown renderer — the one a chat answer goes through — so an
                    // answer reads as it would in chat, never as raw text with asterisks.
                    <div className="mt-1 min-w-0 break-words text-sm text-foreground" data-answer-markdown>
                      <MarkdownStream content={a?.answer ?? ""} hideCopyButton />
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}
    </section>
  );
}

export function ContextCompareView({
  conversationId,
  agentId,
  onAgentChange,
  selection,
  focus,
  tab,
  onTabChange,
}: {
  conversationId?: string;
  agentId?: string;
  /**
   * The host lets the person choose the answering agent (the inspector carries
   * it in the address as `?agent=`); without it the chat's own agent is used.
   */
  onAgentChange?: (agentId: string | null) => void;
  /**
   * The inspector's drill-down — the server's `ContextSelection`, sent as the
   * whole selection (its organization is the request's). Otherwise the active
   * selections.
   */
  selection?: ContextSelection;
  /**
   * Narrow what is SHOWN to one context item (the inspector's last step): each
   * side's block shows only that item's lines and the differences only that
   * item's. The request is unchanged — both sides still resolve the whole scope,
   * exactly as an agent run would.
   */
  focus?: CompareFocus;
  /**
   * The open result tab, when the host keeps it across picks (the inspector
   * remounts this view on every pick). Default: Diff.
   */
  tab?: CompareTab;
  onTabChange?: (tab: CompareTab) => void;
}) {
  const { status, data, error, refresh } = useContextPreview({
    conversationId,
    agentId,
    enabled: true,
    path: "both",
    selection,
  });
  const compare = data?.compare ?? null;
  const delivered = data?.delivered ?? null;
  const [ownTab, setOwnTab] = useState<CompareTab>("diff");
  const activeTab = tab ?? ownTab;
  const chooseTab = (next: string) => {
    const t = next as CompareTab;
    setOwnTab(t);
    onTabChange?.(t);
  };

  // The alchemy capture: the request both sides answered, each side's block as
  // shown, the summary, every difference and the new side's checks.
  usePageCaptureContribution(
    "context-compare",
    () => {
      const shown = (side: CompareSide) => {
        const full = side.block ?? "";
        return {
          ...side,
          block_as_shown: focus ? focusLines(full, focus.key).join("\n") : full,
        };
      };
      const differences = focus
        ? (compare?.differences ?? []).filter((d) => d.item_id === focus.itemId)
        : (compare?.differences ?? []);
      return [
        {
          id: "compare-request",
          title: "Compare request",
          role: "request" as const,
          value: {
            request: {
              method: "POST",
              path: "/ai/context/preview",
              body: {
                conversation_id: conversationId ?? null,
                agent_id: agentId ?? null,
                path: "both",
                ...(selection ? { selection } : {}),
              },
            },
            status,
            error,
            response_carries_compare: Boolean(compare),
          },
          brief: `${status}${error ? `: ${error}` : ""}`,
        },
        ...(compare
          ? [
              {
                id: "compare-summary",
                title: "Compare summary",
                role: "data" as const,
                value: {
                  defects: compare.defects,
                  identical_cells: compare.identical_cells,
                  counts: compare.counts,
                  ruling: compare.ruling,
                  follow: compare.follow,
                  excluded: compare.excluded,
                  focus: focus ?? null,
                },
                brief: `${compare.defects ?? 0} defects, ${(compare.differences ?? []).length} differences`,
              },
              { id: "current-system", title: "Current system", role: "data" as const, value: shown(compare.old) },
              { id: "record-store", title: "Record store", role: "data" as const, value: shown(compare.new) },
              {
                id: "differences",
                title: "Every difference",
                role: "data" as const,
                value: differences,
                brief: `${differences.length} differences`,
              },
            ]
          : []),
      ];
    },
    `${status}|${error}|${compare ? `${compare.defects}:${(compare.differences ?? []).length}:${compare.old.block?.length}:${compare.new.block?.length}` : ""}|${focus?.key ?? ""}`,
  );

  return (
    <div className="flex min-h-0 flex-1 flex-col" data-context-compare>
      <div className="flex shrink-0 items-center gap-2 border-b border-border px-4 py-1.5">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-primary/10 px-2 py-0.5 text-[11px] font-medium text-primary">
          <GitCompareArrows className="h-3 w-3" />
          {status === "loading" ? "Resolving both…" : "Current system · Record store"}
        </span>
        <span className="flex-1" />
        <Button
          variant="ghost"
          size="sm"
          className="h-6 gap-1 px-2 text-[11px] text-primary hover:text-primary"
          onClick={refresh}
          disabled={status === "loading"}
        >
          <RefreshCw className={cn("h-3 w-3", status === "loading" && "animate-spin")} />
          Refresh
        </Button>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto pb-4 scrollbar-thin-auto">
        {status === "loading" && !data && (
          <div className="space-y-2.5 px-4 py-4">
            <Skeleton className="h-10 w-full" />
            <div className="flex gap-3">
              <Skeleton className="h-40 flex-1" />
              <Skeleton className="h-40 flex-1" />
            </div>
          </div>
        )}
        {status === "error" && (
          <div className="mx-4 mt-4 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2.5">
            <div className="flex items-center gap-2 text-sm font-medium text-destructive">
              <AlertTriangle className="h-4 w-4 shrink-0" />
              Comparison unavailable
            </div>
            <div className="mt-1 break-words text-xs text-destructive/90">{error}</div>
          </div>
        )}
        {data && !compare && (
          <div className="mx-4 mt-4 rounded-md border border-border bg-muted/30 px-3 py-2.5 text-xs text-foreground">
            The server answered without a comparison, so it is running a version without compare
            mode. It appears here once that version is live.
          </div>
        )}
        {compare && (
          <>
            <Tabs value={activeTab} onValueChange={chooseTab} className="pt-2" data-compare-tabs={activeTab}>
              <div className="overflow-x-auto px-4 scrollbar-none">
                <TabsList className="h-8 w-max">
                  <TabsTrigger value="diff" className="h-6 px-2.5 text-xs" data-compare-tab="diff">
                    Diff
                  </TabsTrigger>
                  <TabsTrigger value="today" className="h-6 px-2.5 text-xs" data-compare-tab="today">
                    What the model gets today
                  </TabsTrigger>
                  <TabsTrigger value="store" className="h-6 px-2.5 text-xs" data-compare-tab="store">
                    Record store
                  </TabsTrigger>
                  <TabsTrigger value="selection" className="h-6 px-2.5 text-xs" data-compare-tab="selection">
                    Selection
                  </TabsTrigger>
                </TabsList>
              </div>
              {focus && (
                <p className="px-4 pt-2 text-xs text-muted-foreground" data-compare-focus={focus.key}>
                  Showing {focus.label} only where a block names it. The summary counts the whole
                  scope, and what the model is fed is always the whole turn.
                </p>
              )}
              <TabsContent value="diff" className="mt-0">
                <DiffTab compare={compare} delivered={delivered} focus={focus} />
              </TabsContent>
              <TabsContent value="today" className="mt-0">
                <FedSide
                  side={delivered?.today}
                  values={compare.old}
                  valuesTitle="Values the current system answered"
                  says={delivered?.says}
                  focus={focus}
                />
              </TabsContent>
              <TabsContent value="store" className="mt-0">
                <FedSide
                  side={
                    delivered
                      ? (delivered.record_store ?? {
                          path: "record_store",
                          available: false,
                          unavailable_reason: "The server ran no record-store side for this preview.",
                        })
                      : undefined
                  }
                  values={compare.new}
                  valuesTitle="Values the record store answered"
                  says={delivered?.says}
                  focus={focus}
                />
                <Checks side={compare.new} />
              </TabsContent>
              <TabsContent value="selection" className="mt-0">
                <SelectionTab sent={selection} compare={compare} delivered={delivered} />
              </TabsContent>
            </Tabs>
            <AnswerBoth
              key={agentId ?? "no-agent"}
              agentId={agentId}
              onAgentChange={onAgentChange}
              conversationId={conversationId}
              selection={selection}
            />
          </>
        )}
      </div>
    </div>
  );
}
