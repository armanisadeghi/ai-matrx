"use client";

/**
 * AgentResultBlock — THE renderer for the `agent_result` kind.
 *
 * ## What it fixes
 *
 * `agent_result` was an ACTIVE registered kind with no component, so every
 * surface showing one printed the raw run envelope through the generic JSON
 * viewer: the verbatim system prompt, the per-model token counts, the dollar
 * cost, the request and conversation ids — around the two keys the reader came
 * for. A learner opening the "Study notes" box of a finished Study Pack run
 * saw the prompt and the bill instead of their notes.
 *
 * ## The split
 *
 * The RICHEST form of what the agent produced is the §6 `content` channel: the
 * response as an ORDERED LIST OF KIND INSTANCES, each carrying its own
 * `__kind`. When it is present it wins outright, and every entry renders
 * through its own kind component, in the server's order
 * (`AgentContentList`). The server sends `[]` for a schema-bound answer that
 * named no kind, which is NORMAL — the two fields below then carry the answer
 * exactly as they always have.
 *
 * Otherwise CONTENT is what the agent produced: `final_text` through the
 * canonical markdown pipeline (`MarkdownStream`), or `structured_output` when
 * the agent was schema-bound. A payload carrying a `__kind` of its own is fenced as JSON,
 * which means the pipeline routes it to ITS kind component — a schema-bound
 * flashcard set renders as flashcards here, for free, exactly as THE CANONICAL
 * COMPONENT LAW requires.
 *
 * A payload with NO `__kind` has no component to reach, so fencing it only
 * produced a ```json code block — which is what the "Flashcards" step of the
 * Study Pack run still showed a learner on 2026-08-18, after this component
 * shipped. Those land on the platform floor (`StructuredValueView`) instead:
 * a human document, raw data one click away.
 *
 * SECONDARY is one collapsed row of run FACTS — duration, iterations, tool
 * calls, cost, tokens. Never above the content, never expanded by default: it
 * is what the run cost, not what it said.
 *
 * `messages` is NEITHER, and this component cannot leak it because it never
 * receives it — `features/workflow-runtime/agent-run-output.ts` reads the
 * envelope and the transcript is not in its result type. The way to the
 * transcript is the conversation door in the detail row, where the database
 * decides who may open it.
 *
 * ## Bare by construction
 *
 * This block renders inside a host that already draws chrome — a workflow
 * readout step box, a chat message. It adds no card, no border and no
 * background of its own; the only rule it draws is the hairline above the
 * detail row.
 */

import { useEffect, useRef, useState } from "react";
import { ChevronDown, ChevronRight, MessagesSquare } from "lucide-react";

import MarkdownStream from "@/components/MarkdownStream";
import { MatrxUuidCell } from "@/components/official/matrx-data-table/MatrxUuidCell";
import { AgentContentList } from "@/features/workflow-runtime/components/AgentContentList";
import { StructuredValueView } from "@/components/official/structured-value/StructuredValueView";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { cn } from "@/lib/utils";
import type { AgentResultData } from "@/features/content-ir/kinds/agent-result";
import type { AgentRunFacts } from "@/features/workflow-runtime/agent-run-output";

export interface AgentResultBlockProps {
  serverData?: unknown;
  className?: string;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** The bridge builds this shape; anything else is not ours to render. */
function readData(serverData: unknown): AgentResultData | null {
  if (!isRecord(serverData)) return null;
  if (!isRecord(serverData.facts)) return null;
  return serverData as AgentResultData;
}

function fenceJson(text: string): string {
  return `\`\`\`json\n${text}\n\`\`\``;
}

/** Depth past which a nested `__kind` would not route anyway. */
const KIND_SCAN_DEPTH = 4;

/**
 * True when this payload names a kind somewhere the pipeline can reach — the
 * ONLY reason to fence it rather than render it. Without one, the fence is a
 * code block and nothing more.
 */
function carriesKind(value: unknown, depth = 0): boolean {
  if (depth > KIND_SCAN_DEPTH) return false;
  if (Array.isArray(value)) {
    return value.some((item) => carriesKind(item, depth + 1));
  }
  if (!isRecord(value)) return false;
  if (typeof value[KIND_KEY] === "string") return true;
  return Object.values(value).some((item) => carriesKind(item, depth + 1));
}

/** Parse or null — a string that only LOOKS like JSON stays text. */
function safeParse(text: string): unknown {
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return null;
  }
}

/** ms → the shortest honest reading. `0` means "not tracked", not "instant". */
function formatDuration(ms: number): string | null {
  if (ms <= 0) return null;
  if (ms < 1000) return `${ms} ms`;
  const seconds = ms / 1000;
  if (seconds < 60) return `${seconds.toFixed(1)}s`;
  const minutes = Math.floor(seconds / 60);
  return `${minutes}m ${Math.round(seconds % 60)
    .toString()
    .padStart(2, "0")}s`;
}

/** Sub-cent runs are the common case, so they keep four decimals. */
function formatCost(usd: number): string {
  return usd >= 1 ? `$${usd.toFixed(2)}` : `$${usd.toFixed(4)}`;
}

function formatCount(n: number): string {
  return n.toLocaleString();
}

interface Fact {
  label: string;
  value: string;
}

function factList(facts: AgentRunFacts): Fact[] {
  const out: Fact[] = [];
  if (facts.models.length > 0) {
    out.push({ label: "Model", value: facts.models.join(", ") });
  }
  const duration =
    facts.durationMs !== null ? formatDuration(facts.durationMs) : null;
  if (duration) out.push({ label: "Took", value: duration });
  if (facts.iterations !== null) {
    out.push({ label: "Turns", value: formatCount(facts.iterations) });
  }
  if (facts.toolCalls !== null) {
    out.push({ label: "Tool calls", value: formatCount(facts.toolCalls) });
  }
  if (facts.costUsd !== null) {
    out.push({ label: "Cost", value: formatCost(facts.costUsd) });
  }
  if (facts.inputTokens !== null || facts.outputTokens !== null) {
    out.push({
      label: "Tokens",
      value: `${formatCount(facts.inputTokens ?? 0)} in · ${formatCount(
        facts.outputTokens ?? 0,
      )} out`,
    });
  }
  if (facts.finishReason) {
    out.push({ label: "Finished", value: facts.finishReason });
  }
  return out;
}

/**
 * The one-line summary on the closed row: the two facts a reader glances at.
 * Empty when the producer tracked neither — the row then says only "Run
 * detail", which is honest rather than a fabricated "0ms · $0".
 */
function summaryLine(facts: AgentRunFacts): string | null {
  const parts: string[] = [];
  const duration =
    facts.durationMs !== null ? formatDuration(facts.durationMs) : null;
  if (duration) parts.push(duration);
  if (facts.costUsd !== null && facts.costUsd > 0) {
    parts.push(formatCost(facts.costUsd));
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

function RunDetail({ facts }: { facts: AgentRunFacts }) {
  const [open, setOpen] = useState(false);
  const detailRef = useRef<HTMLDivElement>(null);
  // The row sits at the BOTTOM of a bounded, scrollable host (the workflow
  // readout gives each step a 560px scroller), so what expanding reveals lands
  // just past the fold and the click reads as "nothing happened". Pull it into
  // view — `nearest` so a row already visible never jumps.
  useEffect(() => {
    if (open) detailRef.current?.scrollIntoView({ block: "nearest" });
  }, [open]);
  const items = factList(facts);
  // Nothing to tell and nowhere to go — render no row at all rather than a
  // control that opens onto an empty box.
  if (items.length === 0 && !facts.conversationId) return null;
  const summary = summaryLine(facts);

  return (
    <div className="mt-2 border-t border-border/50 pt-1.5">
      <button
        type="button"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
        className="flex w-full items-center gap-1 text-[11px] text-muted-foreground transition-colors hover:text-foreground"
      >
        {open ? (
          <ChevronDown className="h-3 w-3 shrink-0" />
        ) : (
          <ChevronRight className="h-3 w-3 shrink-0" />
        )}
        <span>Run detail</span>
        {summary && !open ? (
          <span className="truncate text-muted-foreground/80">· {summary}</span>
        ) : null}
      </button>
      {open ? (
        <div ref={detailRef} className="mt-1.5 space-y-1.5">
          <dl className="flex flex-wrap gap-x-4 gap-y-1 text-[11px]">
            {items.map((item) => (
              <div key={item.label} className="flex items-baseline gap-1">
                <dt className="text-muted-foreground">{item.label}</dt>
                <dd className="font-medium text-foreground">{item.value}</dd>
              </div>
            ))}
          </dl>
          {/* THE DOOR LAW: the run wrote to a conversation, so the reader can
              go read it — including the prompt, if the database lets them.
              That is the only path to the transcript; this block never
              carries one. */}
          {facts.conversationId ? (
            <div className="flex items-center gap-1.5 text-[11px] text-muted-foreground">
              <MessagesSquare className="h-3 w-3 shrink-0" />
              <span>Conversation</span>
              <MatrxUuidCell
                value={facts.conversationId}
                token="conversation"
                label="Conversation"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

const AgentResultBlock: React.FC<AgentResultBlockProps> = ({
  serverData,
  className,
}) => {
  const data = readData(serverData);
  if (!data) return null;

  const { finalText, finalTextIsJson, structured, facts } = data;
  // A pre-`content` producer (or a hand-built serverData) has no channel at
  // all — the same "absent" as an empty one, never a crash.
  const content = Array.isArray(data.content) ? data.content : [];

  // THE §6 CHANNEL WINS. A typed instance list is strictly richer than the two
  // flat fields it was derived from, so when the server sent one it is what the
  // reader sees — each entry through its own component, in order. The run
  // facts stay where they are: below the content, behind one disclosure.
  if (content.length > 0) {
    return (
      <div className={cn("w-full", className)}>
        <AgentContentList content={content} />
        <RunDetail facts={facts} />
      </div>
    );
  }

  // Schema-bound runs put the answer in `structured_output` and leave
  // `final_text` empty or duplicated; the bound payload wins. It goes through
  // the pipeline FENCED only when it names a kind — that is what lets a
  // schema-bound flashcard set render as flashcards. With no kind to reach,
  // the fence is just a code block, so the payload goes to the floor instead.
  const jsonText = structured
    ? JSON.stringify(structured, null, 2)
    : finalText && finalTextIsJson
      ? finalText
      : null;
  const jsonValue = structured ?? (jsonText === null ? null : safeParse(jsonText));
  // Zero data loss: text that only LOOKED like JSON never parsed, so it keeps
  // the fence rather than becoming an empty document.
  const onTheFloor = jsonValue !== null && !carriesKind(jsonValue);

  return (
    <div className={cn("w-full", className)}>
      {jsonText !== null ? (
        onTheFloor ? (
          <StructuredValueView value={jsonValue} />
        ) : (
          <MarkdownStream content={fenceJson(jsonText)} />
        )
      ) : finalText ? (
        <MarkdownStream content={finalText} />
      ) : (
        <p className="text-xs text-muted-foreground">
          This step ran, and handed its result to the next one.
        </p>
      )}
      <RunDetail facts={facts} />
    </div>
  );
};

export default AgentResultBlock;
