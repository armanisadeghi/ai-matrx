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
 * "Answer on both paths" runs one real agent turn per resolver on the same
 * question (`POST /ai/context/preview/answer-both`): same agent, instructions
 * and model, tools off, nothing persisted. It needs the agent whose answer is
 * being compared. Where the host lets the person choose one (`onAgentChange`,
 * the context inspector), the ONE agent picker (`AgentListDropdown`) sits on
 * the action; where it does not (a chat's panel, whose agent is the chat's),
 * without an agent the sentence says where to open it from.
 */

import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, BrainCircuit, ChevronDown, GitCompareArrows, MessageSquareText, RefreshCw } from "lucide-react";
import { AgentListDropdown } from "@ai-matrx/agents/catalog/react";
import { cn } from "@/lib/utils";
import { Skeleton } from "@ai-matrx/design-system";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { InlineCopyButton } from "@/components/matrx/buttons/InlineCopyButton";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectAllAgents } from "@/features/agents/redux/agent-definition/selectors";
import { fetchAgentsList } from "@/features/agents/redux/agent-definition/thunks";
import { callApi } from "@/lib/api/call-api";
import { resolveRunWait } from "@/lib/api/run-wait";
import { peekSelectedOrganizationId } from "@/lib/api/organization-admission";
import { getUserId } from "@/utils/auth/getUserId";
import { extractErrorMessage } from "@/utils/errors";
import type { components } from "@/types/python-generated/api-types";
import { useContextPreview, type ContextSelection } from "./useContextPreview";

type ContextCompare = components["schemas"]["ContextCompare"];
type CompareSide = components["schemas"]["ContextCompareSide"];
type Difference = components["schemas"]["ContextCompareDifference"];
type AnswerBoth = components["schemas"]["ContextAnswerBothResponse"];
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

/**
 * Lines one block carries that the other does not — the highlight set. System
 * context (dates, times) is computed a few milliseconds apart on each side and
 * the server leaves it out of the diff and says so, so its lines are never
 * highlighted either.
 */
function lineDiff(a: string, b: string): { onlyA: Set<string>; onlyB: Set<string> } {
  const la = a.split("\n").map((l) => l.trimEnd());
  const lb = b.split("\n").map((l) => l.trimEnd());
  const sa = new Set(la);
  const sb = new Set(lb);
  const counts = (l: string) => l.trim() !== "" && !l.endsWith("[system]");
  return {
    onlyA: new Set(la.filter((l) => counts(l) && !sb.has(l))),
    onlyB: new Set(lb.filter((l) => counts(l) && !sa.has(l))),
  };
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

function Block({
  side,
  title,
  differs,
  focus,
}: {
  side: CompareSide;
  title: string;
  differs: Set<string>;
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
            {block.split("\n").map((line, i) => (
              <span
                key={i}
                className={cn(
                  "block",
                  differs.has(line.trimEnd()) &&
                    "-mx-1 rounded-sm bg-amber-400/25 px-1 dark:bg-amber-400/20",
                )}
              >
                {line || " "}
              </span>
            ))}
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
                    <div className="mt-1 whitespace-pre-wrap break-words text-sm leading-relaxed text-foreground">
                      {a?.answer ?? ""}
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
}) {
  const { status, data, error, refresh } = useContextPreview({
    conversationId,
    agentId,
    enabled: true,
    path: "both",
    selection,
  });
  const compare = data?.compare ?? null;
  const diff = useMemo(
    () => lineDiff(compare?.old.block ?? "", compare?.new.block ?? ""),
    [compare],
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
            <Summary compare={compare} />
            {focus && (
              <p className="px-4 pt-3 text-xs text-muted-foreground" data-compare-focus={focus.key}>
                Showing {focus.label} only. The summary above counts the whole scope.
              </p>
            )}
            <section className="flex flex-col gap-3 px-4 pt-4 md:flex-row">
              <Block side={compare.old} title="Current system" differs={diff.onlyA} focus={focus} />
              <Block side={compare.new} title="Record store" differs={diff.onlyB} focus={focus} />
            </section>
            <Differences
              differences={
                focus
                  ? (compare.differences ?? []).filter((d) => d.item_id === focus.itemId)
                  : (compare.differences ?? [])
              }
            />
            <Checks side={compare.new} />
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
