"use client";

/**
 * TurnDiagnosis — the presentation layer of the Diagnose window.
 *
 * One turn = what the user sent (message, attachments), the context the
 * system added (consolidated, collapsed, counted — NEVER presented as if the
 * human typed it), the call setup (system prompt, offered tools), and the
 * agent's response broken into its real parts (thinking, tool calls with
 * their results, text) in the order they happened.
 *
 * Rendering rules:
 *  - Known data renders HUMAN-READABLY (tool chips, key-value tables,
 *    markdown through the canonical `MarkdownStream` pipeline). JSON only
 *    appears in the explicit "Raw" mode or for genuinely unknown payloads.
 *  - Everything folds. Defaults: the user's message and the final assistant
 *    text are open; all else closed. Expand/collapse-all overrides.
 *  - Marking something wrong is a deliberate two-step (open → confirm with
 *    optional note), never a single stray click.
 */

import { useMemo, useState } from "react";
import {
  AlertTriangle,
  Brain,
  ChevronDown,
  ChevronRight,
  FileText,
  Layers,
  Link2,
  MessageSquare,
  Package,
  Paperclip,
  Settings2,
  Wand2,
  Wrench,
} from "lucide-react";
import MarkdownStream from "@/components/MarkdownStream";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { DescendInput, DescendOut } from "../types";
import type { AssistantPart, ConversationTurn } from "../turns";

// ── expand state ────────────────────────────────────────────────────────────

/** "default" honors each item's own default; the other two force everything. */
export type ExpandBaseline = "default" | "expanded" | "collapsed";

export interface ExpandState {
  baseline: ExpandBaseline;
  overrides: Record<string, boolean>;
}

export function isExpanded(
  state: ExpandState,
  id: string,
  defaultExpanded: boolean,
): boolean {
  if (id in state.overrides) return state.overrides[id];
  if (state.baseline === "expanded") return true;
  if (state.baseline === "collapsed") return false;
  return defaultExpanded;
}

// ── small shared pieces ─────────────────────────────────────────────────────

export function ConfidenceBadge({
  confidence,
}: {
  confidence: "linked" | "inferred";
}) {
  const linked = confidence === "linked";
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
        linked
          ? "border-emerald-500/40 text-emerald-700 dark:text-emerald-300"
          : "border-amber-500/40 text-amber-700 dark:text-amber-300",
      )}
      title={
        linked
          ? "Recorded provenance — this edge comes from stored ids, not a guess"
          : "Derived here — located by position or adjacency, not a recorded link"
      }
    >
      {linked ? (
        <Link2 className="h-3 w-3" aria-hidden />
      ) : (
        <Wand2 className="h-3 w-3" aria-hidden />
      )}
      {linked ? "linked" : "inferred"}
    </span>
  );
}

const CLIP_CHARS = 30_000;

function stringifyClipped(value: unknown): { text: string; clipped: boolean } {
  let text: string;
  if (typeof value === "string") text = value;
  else {
    try {
      text = JSON.stringify(value ?? null, null, 2);
    } catch {
      text = String(value);
    }
  }
  if (text.length > CLIP_CHARS) {
    return { text: text.slice(0, CLIP_CHARS), clipped: true };
  }
  return { text, clipped: false };
}

/** Raw view — an explicit choice, labeled as such. */
function RawValue({ value }: { value: unknown }) {
  const { text, clipped } = stringifyClipped(value);
  return (
    <div>
      <MarkdownStream
        content={"```json\n" + text + "\n```"}
        isStreamActive={false}
        hideCopyButton
      />
      {clipped && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Clipped for display — the stored payload is larger.
        </div>
      )}
    </div>
  );
}

function Md({ content }: { content: string }) {
  const { text, clipped } = stringifyClipped(content);
  return (
    <div>
      <MarkdownStream content={text} isStreamActive={false} hideCopyButton />
      {clipped && (
        <div className="mt-1 text-[10px] text-muted-foreground">
          Clipped for display — the stored payload is larger.
        </div>
      )}
    </div>
  );
}

/** Compact human-readable key → value rows for a known small record. */
function KeyValueTable({ record }: { record: Record<string, unknown> }) {
  const entries = Object.entries(record).filter(([, v]) => v !== undefined);
  if (entries.length === 0) {
    return <div className="text-xs text-muted-foreground">Empty.</div>;
  }
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-xs">
        <tbody>
          {entries.map(([k, v]) => {
            const inline =
              v === null
                ? "—"
                : typeof v === "object"
                  ? JSON.stringify(v)
                  : String(v);
            return (
              <tr key={k} className="border-b border-border/40 last:border-0">
                <td className="w-40 min-w-32 py-1 pr-3 align-top font-medium text-muted-foreground">
                  {k}
                </td>
                <td className="py-1 align-top">
                  <span
                    className="block max-w-full break-words font-mono text-[11px] text-foreground"
                    title={inline.length > 200 ? undefined : inline}
                  >
                    {inline.length > 400 ? `${inline.slice(0, 400)}…` : inline}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

/** The offered toolset as readable chips — never a JSON dump. */
function ToolsetChips({ tools }: { tools: unknown[] }) {
  const names = tools.map((t, i) => {
    if (typeof t === "string") return t;
    if (t && typeof t === "object") {
      const rec = t as Record<string, unknown>;
      const n = rec.name ?? rec.tool_name ?? rec.key ?? rec.id;
      if (typeof n === "string" && n) return n;
    }
    return `tool ${i + 1}`;
  });
  return (
    <div className="flex flex-wrap gap-1.5">
      {names.map((name, i) => (
        <span
          key={`${name}-${i}`}
          className="inline-flex items-center gap-1 rounded-full border border-border bg-muted/40 px-2 py-0.5 text-[11px] text-foreground"
        >
          <Wrench className="h-3 w-3 text-muted-foreground" aria-hidden />
          {name}
        </span>
      ))}
    </div>
  );
}

// ── "this is wrong" — deliberate two-step action ────────────────────────────

function WrongAction({
  input,
  disabled,
  onInputWrong,
}: {
  input: DescendInput;
  disabled?: boolean;
  onInputWrong: (input: DescendInput, note: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [note, setNote] = useState("");
  const canDescend = Boolean(input.producer.descend_ref);

  if (!open) {
    return (
      <Button
        type="button"
        variant="outline"
        size="sm"
        className="h-7 gap-1 rounded-full border-amber-500/50 px-2.5 text-[11px] text-amber-700 hover:bg-amber-500/10 dark:text-amber-300"
        disabled={disabled}
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
      >
        <AlertTriangle className="h-3 w-3" aria-hidden />
        This is wrong
      </Button>
    );
  }

  return (
    <div
      className="flex w-full flex-wrap items-center gap-2 rounded-md border border-amber-500/30 bg-amber-500/5 p-2"
      onClick={(e) => e.stopPropagation()}
    >
      <input
        value={note}
        onChange={(e) => setNote(e.target.value)}
        placeholder="What's wrong with it? (optional)"
        className="min-w-0 flex-1 rounded-md border border-border bg-background px-2 py-1.5 text-base text-foreground placeholder:text-muted-foreground"
        style={{ fontSize: "16px" }}
      />
      <Button
        type="button"
        size="sm"
        className="h-8 rounded-full px-3 text-xs"
        disabled={disabled}
        onClick={() => onInputWrong(input, note.trim() ? note.trim() : null)}
      >
        {canDescend ? "Trace where it came from" : "Pin the fault here"}
      </Button>
      <Button
        type="button"
        variant="ghost"
        size="sm"
        className="h-8 rounded-full px-2.5 text-xs"
        onClick={() => setOpen(false)}
      >
        Cancel
      </Button>
    </div>
  );
}

// ── the collapsible card every item renders through ─────────────────────────

export interface DiagCardProps {
  id: string;
  icon: React.ReactNode;
  title: string;
  chips?: React.ReactNode;
  defaultExpanded?: boolean;
  expand: ExpandState;
  onToggle: (id: string, expanded: boolean) => void;
  /** Raw payload for the global Raw mode; pretty children otherwise. */
  raw: boolean;
  rawValue?: unknown;
  /** Wired when this item maps to a provenance-tagged descend input. */
  wrongInput?: DescendInput | null;
  disabled?: boolean;
  onInputWrong?: (input: DescendInput, note: string | null) => void;
  children: React.ReactNode;
}

export function DiagCard({
  id,
  icon,
  title,
  chips,
  defaultExpanded = false,
  expand,
  onToggle,
  raw,
  rawValue,
  wrongInput,
  disabled,
  onInputWrong,
  children,
}: DiagCardProps) {
  const expanded = isExpanded(expand, id, defaultExpanded);
  return (
    <div className="rounded-lg border border-border bg-card">
      <button
        type="button"
        onClick={() => onToggle(id, !expanded)}
        className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted/40"
        aria-expanded={expanded}
      >
        {expanded ? (
          <ChevronDown className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        ) : (
          <ChevronRight className="h-3.5 w-3.5 shrink-0 text-muted-foreground" aria-hidden />
        )}
        <span className="shrink-0 text-muted-foreground">{icon}</span>
        <span className="min-w-0 truncate text-xs font-semibold text-foreground">
          {title}
        </span>
        <span className="ml-auto flex shrink-0 flex-wrap items-center gap-1.5">
          {chips}
        </span>
      </button>
      {expanded && (
        <div className="space-y-2 border-t border-border/60 px-3 py-2">
          {raw && rawValue !== undefined ? <RawValue value={rawValue} /> : children}
          {wrongInput && onInputWrong && (
            <WrongAction
              input={wrongInput}
              disabled={disabled}
              onInputWrong={onInputWrong}
            />
          )}
        </div>
      )}
    </div>
  );
}

function SectionHeading({
  icon,
  title,
  meta,
}: {
  icon: React.ReactNode;
  title: string;
  meta?: string;
}) {
  return (
    <div className="flex items-center gap-2 pt-1">
      <span className="text-muted-foreground">{icon}</span>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-muted-foreground">
        {title}
      </span>
      {meta && <span className="text-[11px] text-muted-foreground">{meta}</span>}
    </div>
  );
}

function charsChip(chars: number | null | undefined) {
  if (!chars) return null;
  return (
    <span className="text-[10px] tabular-nums text-muted-foreground">
      {chars.toLocaleString()} chars
    </span>
  );
}

// ── descend-input lookup ────────────────────────────────────────────────────

export interface DescendIndex {
  byKey: Map<string, DescendInput>;
  /** tool_result inputs keyed by their chat.tool_call row id. */
  toolByRowId: Map<string, DescendInput>;
}

export function indexDescendInputs(out: DescendOut | null): DescendIndex {
  const byKey = new Map<string, DescendInput>();
  const toolByRowId = new Map<string, DescendInput>();
  for (const input of out?.inputs ?? []) {
    if (!byKey.has(input.key)) byKey.set(input.key, input);
    if (input.key.startsWith("tool_result:") && input.producer.id) {
      toolByRowId.set(input.producer.id, input);
    }
  }
  return { byKey, toolByRowId };
}

// ── assistant part cards ────────────────────────────────────────────────────

function AssistantPartCard({
  part,
  isFinalText,
  turnKey,
  expand,
  onToggle,
  raw,
  index,
  descendIndex,
  disabled,
  onInputWrong,
}: {
  part: AssistantPart;
  isFinalText: boolean;
  turnKey: string;
  expand: ExpandState;
  onToggle: (id: string, expanded: boolean) => void;
  raw: boolean;
  index: number;
  descendIndex: DescendIndex;
  disabled?: boolean;
  onInputWrong: (input: DescendInput, note: string | null) => void;
}) {
  const id = `${turnKey}:part:${part.seq}`;
  const common = { expand, onToggle, raw, disabled, onInputWrong };

  switch (part.kind) {
    case "thinking":
      return (
        <DiagCard
          {...common}
          id={id}
          icon={<Brain className="h-3.5 w-3.5" aria-hidden />}
          title={`Thinking · step ${index + 1}`}
          chips={charsChip(part.text.length)}
          rawValue={part.text}
        >
          <div className="text-sm italic text-muted-foreground">
            <Md content={part.text} />
          </div>
        </DiagCard>
      );
    case "text":
      return (
        <DiagCard
          {...common}
          id={id}
          icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
          title={isFinalText ? "Agent answer" : `Agent text · step ${index + 1}`}
          chips={charsChip(part.text.length)}
          defaultExpanded={isFinalText}
          rawValue={part.text}
        >
          <Md content={part.text} />
        </DiagCard>
      );
    case "tool": {
      const row = part.row;
      const failed = row ? row.is_error === true || row.success === false : false;
      const wrongInput = row ? (descendIndex.toolByRowId.get(row.id) ?? null) : null;
      const output = row ? (row.output ?? row.output_preview) : null;
      return (
        <DiagCard
          {...common}
          id={id}
          icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
          title={`Tool — ${part.name}`}
          chips={
            <>
              {row && (
                <span
                  className={cn(
                    "rounded-full border px-1.5 py-0.5 text-[10px] font-medium",
                    failed
                      ? "border-red-500/40 text-red-700 dark:text-red-300"
                      : "border-emerald-500/40 text-emerald-700 dark:text-emerald-300",
                  )}
                >
                  {failed ? "failed" : "succeeded"}
                </span>
              )}
              {row && row.duration_ms > 0 && (
                <span className="text-[10px] tabular-nums text-muted-foreground">
                  {(row.duration_ms / 1000).toFixed(1)}s
                </span>
              )}
            </>
          }
          rawValue={{
            call_id: part.callId,
            arguments: part.args ?? row?.arguments ?? null,
            output: output,
            status: row?.status ?? null,
            error_message: row?.error_message ?? null,
          }}
          wrongInput={wrongInput}
        >
          <div className="space-y-2">
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                What the agent asked for
              </div>
              {part.args || (row && row.arguments) ? (
                <KeyValueTable
                  record={
                    (part.args ??
                      (row?.arguments as Record<string, unknown> | null)) ||
                    {}
                  }
                />
              ) : (
                <div className="text-xs text-muted-foreground">No arguments.</div>
              )}
            </div>
            <div>
              <div className="mb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                What came back
              </div>
              {row?.error_message && (
                <div className="mb-1 rounded border border-red-500/30 bg-red-500/5 px-2 py-1 text-[11px] text-red-700 dark:text-red-300">
                  {row.error_message}
                </div>
              )}
              {output == null ? (
                <div className="text-xs text-muted-foreground">
                  No recorded result.
                </div>
              ) : typeof output === "string" ? (
                <Md content={output} />
              ) : (
                <RawValue value={output} />
              )}
            </div>
          </div>
        </DiagCard>
      );
    }
    case "media":
      return (
        <DiagCard
          {...common}
          id={id}
          icon={<Package className="h-3.5 w-3.5" aria-hidden />}
          title={`Media output — ${part.mediaKind}`}
          rawValue={part.raw}
        >
          <KeyValueTable record={(part.raw as Record<string, unknown>) ?? {}} />
        </DiagCard>
      );
    case "opaque":
      return (
        <DiagCard
          {...common}
          id={id}
          icon={<Package className="h-3.5 w-3.5" aria-hidden />}
          title={part.label}
          rawValue={part.raw}
        >
          <RawValue value={part.raw} />
        </DiagCard>
      );
  }
}

// ── the full turn view ──────────────────────────────────────────────────────

export interface TurnDiagnosisViewProps {
  turn: ConversationTurn;
  out: DescendOut | null;
  raw: boolean;
  expand: ExpandState;
  onToggle: (id: string, expanded: boolean) => void;
  disabled?: boolean;
  onInputWrong: (input: DescendInput, note: string | null) => void;
}

export function TurnDiagnosisView({
  turn,
  out,
  raw,
  expand,
  onToggle,
  disabled,
  onInputWrong,
}: TurnDiagnosisViewProps) {
  const descendIndex = useMemo(() => indexDescendInputs(out), [out]);
  const turnKey = `turn:${turn.index}`;
  const common = { expand, onToggle, raw, disabled, onInputWrong };

  const finalTextSeq = useMemo(() => {
    for (let i = turn.parts.length - 1; i >= 0; i--) {
      if (turn.parts[i].kind === "text") return turn.parts[i].seq;
    }
    return -1;
  }, [turn.parts]);

  const systemPrompt = descendIndex.byKey.get("system_prompt") ?? null;
  const toolsetInput = descendIndex.byKey.get("toolset") ?? null;
  const userTextInput = descendIndex.byKey.get("user_text") ?? null;

  // Descend inputs that no turn-native card already represents — stored
  // values, mid-turn injections, and anything a future server adds.
  const leftovers = useMemo(() => {
    const known = new Set<string>([
      "user_text",
      "system_prompt",
      "toolset",
      ...turn.contextItems.map((c) => c.key),
      ...turn.attachments.map((a) => a.key),
    ]);
    return (out?.inputs ?? []).filter(
      (i) =>
        !known.has(i.key) &&
        !(i.key.startsWith("tool_result:") && i.producer.id
          ? turn.parts.some((p) => p.kind === "tool" && p.row?.id === i.producer.id)
          : false),
    );
  }, [out, turn]);

  return (
    <div className="space-y-2">
      {/* ── what the user sent ─────────────────────────────────────────── */}
      <SectionHeading
        icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
        title="You sent"
      />
      <DiagCard
        {...common}
        id={`${turnKey}:user`}
        icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
        title="Your message"
        chips={
          <>
            {userTextInput && (
              <ConfidenceBadge confidence={userTextInput.producer.confidence} />
            )}
            {charsChip(turn.userText.length)}
          </>
        }
        defaultExpanded
        rawValue={turn.userRaw?.content ?? turn.userText}
        wrongInput={userTextInput}
      >
        {turn.userText ? (
          <Md content={turn.userText} />
        ) : (
          <div className="text-xs text-muted-foreground">
            No typed text on this turn.
          </div>
        )}
      </DiagCard>

      {turn.attachments.map((att, i) => (
        <DiagCard
          {...common}
          key={`${att.key}-${i}`}
          id={`${turnKey}:att:${i}`}
          icon={<Paperclip className="h-3.5 w-3.5" aria-hidden />}
          title={`Attachment — ${att.label}`}
          chips={
            att.type ? (
              <span className="text-[10px] uppercase tracking-wide text-muted-foreground">
                {att.type}
              </span>
            ) : undefined
          }
          rawValue={att.raw}
          wrongInput={descendIndex.byKey.get(att.key) ?? null}
        >
          <KeyValueTable record={(att.raw as Record<string, unknown>) ?? {}} />
        </DiagCard>
      ))}

      {turn.collabNotes.map((note) => (
        <DiagCard
          {...common}
          key={note.id}
          id={`${turnKey}:collab:${note.id}`}
          icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
          title="Collaboration note from another agent"
          rawValue={note.text}
        >
          <Md content={note.text} />
        </DiagCard>
      ))}

      {/* ── context — consolidated, counted, collapsed ─────────────────── */}
      {turn.contextItems.length > 0 && (
        <>
          <SectionHeading
            icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
            title="Context the system added"
            meta={`${turn.contextItems.length} item${turn.contextItems.length === 1 ? "" : "s"} — not part of your message`}
          />
          <DiagCard
            {...common}
            id={`${turnKey}:context`}
            icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
            title={`Context (${turn.contextItems.length})`}
            rawValue={turn.contextItems.map((c) => c.raw)}
          >
            <div className="space-y-2">
              {turn.contextItems.map((item, i) => {
                const input = descendIndex.byKey.get(item.key) ?? null;
                return (
                  <DiagCard
                    {...common}
                    key={`${item.key}-${i}`}
                    id={`${turnKey}:ctx:${i}`}
                    icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
                    title={item.label}
                    chips={
                      <>
                        {item.sourceKind && (
                          <span className="text-[10px] text-muted-foreground">
                            {item.sourceKind}
                          </span>
                        )}
                        {input && (
                          <ConfidenceBadge confidence={input.producer.confidence} />
                        )}
                        {item.sizeHint != null && (
                          <span className="text-[10px] tabular-nums text-muted-foreground">
                            {String(item.sizeHint)}
                          </span>
                        )}
                      </>
                    }
                    rawValue={item.raw}
                    wrongInput={input}
                  >
                    {item.value == null ? (
                      <div className="text-xs text-muted-foreground">
                        The payload wasn't carried inline on the message — the
                        manifest below is what was recorded.
                        <div className="mt-2">
                          <KeyValueTable
                            record={(item.raw as Record<string, unknown>) ?? {}}
                          />
                        </div>
                      </div>
                    ) : typeof item.value === "string" ? (
                      <Md content={item.value} />
                    ) : (
                      <RawValue value={item.value} />
                    )}
                  </DiagCard>
                );
              })}
            </div>
          </DiagCard>
        </>
      )}

      {/* ── the call setup ─────────────────────────────────────────────── */}
      {(systemPrompt || turn.toolsOnCall.length > 0) && (
        <SectionHeading
          icon={<Settings2 className="h-3.5 w-3.5" aria-hidden />}
          title="Call setup"
        />
      )}
      {systemPrompt && (
        <DiagCard
          {...common}
          id={`${turnKey}:system`}
          icon={<Settings2 className="h-3.5 w-3.5" aria-hidden />}
          title="System prompt (as sent to the provider)"
          chips={
            <>
              <ConfidenceBadge confidence={systemPrompt.producer.confidence} />
              {charsChip(systemPrompt.chars)}
            </>
          }
          rawValue={systemPrompt.value}
          wrongInput={systemPrompt}
        >
          {typeof systemPrompt.value === "string" ? (
            <Md content={systemPrompt.value} />
          ) : (
            <RawValue value={systemPrompt.value} />
          )}
        </DiagCard>
      )}
      {turn.toolsOnCall.length > 0 && (
        <DiagCard
          {...common}
          id={`${turnKey}:toolset`}
          icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
          title={`Tools offered on this call (${turn.toolsOnCall.length})`}
          rawValue={turn.toolsOnCall}
          wrongInput={toolsetInput}
        >
          <ToolsetChips tools={turn.toolsOnCall} />
        </DiagCard>
      )}

      {/* ── the agent's response, in order ─────────────────────────────── */}
      <SectionHeading
        icon={<Brain className="h-3.5 w-3.5" aria-hidden />}
        title="What the agent did"
        meta={
          turn.parts.length > 0
            ? `${turn.parts.length} step${turn.parts.length === 1 ? "" : "s"}`
            : undefined
        }
      />
      {turn.parts.length === 0 ? (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          No recorded response parts on this turn.
        </div>
      ) : (
        turn.parts.map((part, i) => (
          <AssistantPartCard
            key={part.seq}
            part={part}
            index={i}
            isFinalText={part.kind === "text" && part.seq === finalTextSeq}
            turnKey={turnKey}
            expand={expand}
            onToggle={onToggle}
            raw={raw}
            descendIndex={descendIndex}
            disabled={disabled}
            onInputWrong={onInputWrong}
          />
        ))
      )}

      {/* ── anything else the call received ────────────────────────────── */}
      <LeftoverSections
        leftovers={leftovers}
        keyPrefix={`${turnKey}:extra`}
        expand={expand}
        onToggle={onToggle}
        raw={raw}
        disabled={disabled}
        onInputWrong={onInputWrong}
      />
    </div>
  );
}

/** Stored values get their OWN honestly-labeled section — they are the
 * conversation value store (pass-by-reference: the agent holds descriptors
 * and reads content on demand), not something the user sent this turn. */
function LeftoverSections({
  leftovers,
  keyPrefix,
  expand,
  onToggle,
  raw,
  disabled,
  onInputWrong,
}: {
  leftovers: DescendInput[];
  keyPrefix: string;
  expand: ExpandState;
  onToggle: (id: string, expanded: boolean) => void;
  raw: boolean;
  disabled?: boolean;
  onInputWrong: (input: DescendInput, note: string | null) => void;
}) {
  const values = leftovers.filter((i) => i.key.startsWith("value:"));
  const rest = leftovers.filter((i) => !i.key.startsWith("value:"));
  const card = (input: DescendInput) => (
    <DescendInputCard
      key={input.key}
      input={input}
      id={`${keyPrefix}:${input.key}`}
      expand={expand}
      onToggle={onToggle}
      raw={raw}
      disabled={disabled}
      onInputWrong={onInputWrong}
    />
  );
  return (
    <>
      {values.length > 0 && (
        <>
          <SectionHeading
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            title="Stored values available to the agent"
            meta={`${values.length} — the conversation's value store; the agent sees a descriptor and reads content on demand`}
          />
          {values.map(card)}
        </>
      )}
      {rest.length > 0 && (
        <>
          <SectionHeading
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            title="Also on this call"
            meta={`${rest.length} item${rest.length === 1 ? "" : "s"}`}
          />
          {rest.map(card)}
        </>
      )}
    </>
  );
}

// ── generic descend-input card (deep layers + leftovers) ────────────────────

const PRODUCER_LABELS: Record<string, string> = {
  cx_request: "provider call",
  message: "message",
  request_snapshot: "request snapshot",
  tool_call: "tool call",
  agent: "agent definition",
  pending_injection: "injected context",
  context_policy: "context policy",
  user: "the user",
  workflow_node: "authored on the step",
  wf_node_outcome: "an earlier step",
  workflow_run: "the workflow run",
};

export function DescendInputCard({
  input,
  id,
  expand,
  onToggle,
  raw,
  disabled,
  defaultExpanded = false,
  onInputWrong,
}: {
  input: DescendInput;
  id: string;
  expand: ExpandState;
  onToggle: (id: string, expanded: boolean) => void;
  raw: boolean;
  disabled?: boolean;
  defaultExpanded?: boolean;
  onInputWrong: (input: DescendInput, note: string | null) => void;
}) {
  const producerLabel =
    PRODUCER_LABELS[input.producer.kind] ?? input.producer.kind;
  return (
    <DiagCard
      id={id}
      icon={<FileText className="h-3.5 w-3.5" aria-hidden />}
      title={input.label}
      chips={
        <>
          <span className="text-[10px] text-muted-foreground">
            from {producerLabel}
          </span>
          <ConfidenceBadge confidence={input.producer.confidence} />
          {charsChip(input.chars)}
          {input.truncated && (
            <span className="text-[10px] text-muted-foreground">truncated</span>
          )}
        </>
      }
      defaultExpanded={defaultExpanded}
      expand={expand}
      onToggle={onToggle}
      raw={raw}
      rawValue={input.value}
      wrongInput={input}
      disabled={disabled}
      onInputWrong={onInputWrong}
    >
      {input.value == null ? (
        <div className="text-xs text-muted-foreground">No inline payload.</div>
      ) : input.kind === "markdown" && typeof input.value === "string" ? (
        <Md content={input.value} />
      ) : input.kind === "text" && typeof input.value === "string" ? (
        <div className="whitespace-pre-wrap break-words text-sm text-foreground">
          {input.value}
        </div>
      ) : (
        <RawValue value={input.value} />
      )}
      {input.truncated && input.value_ref && (
        <div className="text-[10px] text-muted-foreground">
          Shown truncated — the full payload lives at {input.value_ref}.
        </div>
      )}
    </DiagCard>
  );
}

/** Deep-layer view: descend inputs grouped so context never masquerades as a
 * message — the same separation the root turn view draws. */
export function GroupedInputsView({
  out,
  raw,
  expand,
  onToggle,
  disabled,
  onInputWrong,
}: {
  out: DescendOut;
  raw: boolean;
  expand: ExpandState;
  onToggle: (id: string, expanded: boolean) => void;
  disabled?: boolean;
  onInputWrong: (input: DescendInput, note: string | null) => void;
}) {
  const groups = useMemo(() => {
    const user: DescendInput[] = [];
    const context: DescendInput[] = [];
    const setup: DescendInput[] = [];
    const tools: DescendInput[] = [];
    const other: DescendInput[] = [];
    for (const input of out.inputs ?? []) {
      if (input.key === "user_text" || input.key.startsWith("attachment:")) {
        user.push(input);
      } else if (input.key.startsWith("context:")) context.push(input);
      else if (input.key === "system_prompt" || input.key === "toolset") {
        setup.push(input);
      } else if (input.key.startsWith("tool_result:")) tools.push(input);
      else other.push(input);
    }
    return { user, context, setup, tools, other };
  }, [out]);

  const card = (input: DescendInput, prefix: string, expandedDefault = false) => (
    <DescendInputCard
      key={input.key}
      input={input}
      id={`${prefix}:${input.key}`}
      expand={expand}
      onToggle={onToggle}
      raw={raw}
      disabled={disabled}
      defaultExpanded={expandedDefault}
      onInputWrong={onInputWrong}
    />
  );

  const unitKey = `layer:${out.unit.kind}:${out.unit.id}`;
  return (
    <div className="space-y-2">
      {groups.user.length > 0 && (
        <>
          <SectionHeading
            icon={<MessageSquare className="h-3.5 w-3.5" aria-hidden />}
            title="The message"
          />
          {groups.user.map((i) => card(i, unitKey, i.key === "user_text"))}
        </>
      )}
      {groups.context.length > 0 && (
        <>
          <SectionHeading
            icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
            title="Context the system added"
            meta={`${groups.context.length} item${groups.context.length === 1 ? "" : "s"}`}
          />
          <DiagCard
            id={`${unitKey}:context`}
            icon={<Layers className="h-3.5 w-3.5" aria-hidden />}
            title={`Context (${groups.context.length})`}
            expand={expand}
            onToggle={onToggle}
            raw={raw}
            rawValue={groups.context.map((c) => c.value)}
          >
            <div className="space-y-2">
              {groups.context.map((i) => card(i, `${unitKey}:ctx`))}
            </div>
          </DiagCard>
        </>
      )}
      {groups.setup.length > 0 && (
        <>
          <SectionHeading
            icon={<Settings2 className="h-3.5 w-3.5" aria-hidden />}
            title="Call setup"
          />
          {groups.setup.map((i) => card(i, unitKey))}
        </>
      )}
      {groups.tools.length > 0 && (
        <>
          <SectionHeading
            icon={<Wrench className="h-3.5 w-3.5" aria-hidden />}
            title="Tool results the agent worked from"
            meta={`${groups.tools.length}`}
          />
          {groups.tools.map((i) => card(i, unitKey))}
        </>
      )}
      {groups.other.length > 0 && (
        <>
          <SectionHeading
            icon={<Package className="h-3.5 w-3.5" aria-hidden />}
            title="Other inputs"
            meta={`${groups.other.length}`}
          />
          {groups.other.map((i) => card(i, unitKey))}
        </>
      )}
      {(out.inputs ?? []).length === 0 && (
        <div className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          No recorded inputs for this unit. If the output is wrong, the fault
          is here.
        </div>
      )}
    </div>
  );
}
