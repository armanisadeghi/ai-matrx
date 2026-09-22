"use client";

/**
 * TestCaseInputs — THE ONE viewer for the inputs of a saved test case
 * (`agent.exemplar`) or a candidate run.
 *
 * A run is not one thing. It is a SET of named inputs: each declared variable,
 * each context slot a surface filled, every attached resource, and — separately
 * from all of them — whatever the human actually typed. Before this component
 * every one of those was flattened into a single unbounded `label: value` strip
 * (`UserMessageVariables`, correct for a chat bubble, wrong here): a real row in
 * this table carries a `page_summaries` variable of 267,025 characters, so one
 * test case rendered ~30 screens of unbroken text inside a 620px window and
 * there was no way to see the other inputs, let alone compare two cases.
 *
 * So the rules this file exists to hold:
 *
 *   1. ONE ROW PER NAMED INPUT. A variable, a context slot and the user's own
 *      text are different things with different names; they never merge into a
 *      blob. The row prints the input's human label, its machine name when that
 *      differs, and its size.
 *   2. A LONG VALUE IS NEVER PRINTED IN FULL UNTIL ASKED. Long means it would
 *      not fit a line (over `INLINE_VALUE_MAX` characters, or it has newlines).
 *      A long row shows a one-line preview and opens into a height-capped,
 *      independently scrolled pane. A SHORT value has no chevron and no pane —
 *      opening a disclosure to reveal eleven characters is the wasted-space
 *      failure this component is a fix for.
 *   3. NO FRAME INSIDE A FRAME. The host card is the chrome. Rows separate with
 *      dividers, never with their own borders, backgrounds or padding boxes.
 *
 * WHAT IS SHOWN, and how a machine-wired record id becomes a door instead of a
 * UUID, is still decided by `buildVariableDisplayLines` — the one rule shared
 * with every other variable display path. This file adds presentation
 * (grouping, labels from the agent's declarations, collapse), never a second
 * opinion about which values a person may see.
 */

import { useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import { formatCount } from "@ai-matrx/kit/format";
import { cn } from "@/lib/utils";
import { EntityRef } from "@/components/official/entity-ref/EntityRef";
import { CopyButton } from "@/components/matrx/buttons/CopyButton";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { buildVariableDisplayLines } from "@/features/agents/utils/variable-display-lines";
import { displayLabelForKey } from "@/features/agents/utils/variable-utils";
import { MessageAttachmentStrip } from "@/features/agents/components/messages-display/MessageAttachmentStrip";
import { isAttachmentMessagePart } from "@/features/agents/components/context-items/normalize";
import type { AgentVariableDeclaration } from "@/features/agents/samples/service";
import type { MessagePart } from "@/types/python-generated/stream-events";

/**
 * Longer than this (or carrying a newline) and the row collapses.
 *
 * Deliberately short. The alternative failure is a value that is under the
 * limit, gets no chevron, and is then clipped by the row's width anyway — a
 * value the person can see is truncated and has no way to open. This window is
 * 560px and users narrow it, so anything past a short phrase gets a door.
 */
const INLINE_VALUE_MAX = 60;
/** Preview text cut, comfortably past what any row width can show. */
const PREVIEW_MAX = 240;

type PartGroup = "input" | "variable";

interface TestCasePart {
  key: string;
  group: PartGroup;
  /** Human label — the author's, else the name title-cased. */
  label: string;
  /** Machine name, printed only when it differs from the label. */
  name: string | null;
  /** The author's help text for a declared variable, when there is one. */
  description: string | null;
  /** A resolvable record: rendered as a door, never as text. */
  entity: { token: string; id: string } | null;
  /** Full human text for a non-entity value. */
  text: string;
  /** True when the agent does not declare this name — worth saying out loud. */
  undeclared: boolean;
}

function formatSize(text: string): string {
  const lines = text.split("\n").length;
  const chars = text.length;
  const size = formatCount(chars, { style: "compact" });
  return lines > 1 ? `${size} chars · ${lines} lines` : `${size} chars`;
}

/**
 * Pretty-print a value that is JSON in a string. A test case routinely carries
 * a serialized payload in one variable (`json_schema`, `search_results`); shown
 * raw it is one 200,000-character line that no amount of wrapping makes
 * readable. A value that is not JSON is returned untouched.
 */
function prettyValue(text: string): string {
  const trimmed = text.trim();
  if (!trimmed.startsWith("{") && !trimmed.startsWith("[")) return text;
  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2);
  } catch {
    return text;
  }
}

function previewOf(text: string): string {
  const oneLine = text.replace(/\s+/g, " ").trim();
  return oneLine.length > PREVIEW_MAX
    ? `${oneLine.slice(0, PREVIEW_MAX)}…`
    : oneLine;
}

export function buildTestCaseParts(input: {
  variables: Record<string, unknown>;
  userInput: string;
  declarations: readonly AgentVariableDeclaration[];
}): TestCasePart[] {
  const byName = new Map(input.declarations.map((d) => [d.name, d]));
  const parts: TestCasePart[] = [];

  const typed = input.userInput.trim();
  if (typed) {
    parts.push({
      key: "__user_input__",
      group: "input",
      label: "What the person typed",
      name: null,
      description: null,
      entity: null,
      text: typed,
      undeclared: false,
    });
  }

  for (const line of buildVariableDisplayLines(input.variables)) {
    // Attachment-list lines are keyed `name:token:id`; the variable's own name
    // is the head, and only the first of them carries the label.
    const name = line.key.split(":")[0];
    const declaration = byName.get(name) ?? null;
    const label =
      line.label ||
      (declaration ? displayLabelForKey(name, declaration.label) : "");
    parts.push({
      key: line.key,
      group: "variable",
      label: label || name,
      name: label && label !== name ? name : null,
      description: declaration?.helpText ?? null,
      entity: line.entity,
      text: line.text,
      undeclared: input.declarations.length > 0 && !declaration,
    });
  }

  return parts;
}

function PartRow({
  part,
  titleFor,
}: {
  part: TestCasePart;
  titleFor: (ref: { token: string; id: string }) => string | undefined;
}) {
  const [open, setOpen] = useState(false);

  if (part.entity) {
    return (
      <div className="flex items-baseline gap-2 py-1 pl-[22px] pr-2.5">
        <PartLabel part={part} />
        <div className="min-w-0 flex-1 text-[11px]">
          <EntityRef
            token={part.entity.token}
            id={part.entity.id}
            name={titleFor(part.entity)}
            openInNewTab
          />
        </div>
      </div>
    );
  }

  const isLong =
    part.text.length > INLINE_VALUE_MAX || part.text.includes("\n");

  // A short value IS its own preview — no chevron, no pane, no second click to
  // read eleven characters.
  if (!isLong) {
    return (
      <div className="flex items-baseline gap-2 py-1 pl-[22px] pr-2.5">
        <PartLabel part={part} />
        <span
          className="min-w-0 flex-1 truncate text-[11px] text-foreground"
          title={part.text}
        >
          {part.text}
        </span>
      </div>
    );
  }

  return (
    <div>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="flex w-full items-baseline gap-1.5 px-1 py-1 text-left transition-colors hover:bg-accent/40"
      >
        {open ? (
          <ChevronDown className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        ) : (
          <ChevronRight className="mt-0.5 h-3 w-3 shrink-0 text-muted-foreground" />
        )}
        <PartLabel part={part} />
        <span className="min-w-0 flex-1 truncate text-[11px] text-muted-foreground">
          {previewOf(part.text)}
        </span>
        <span className="shrink-0 text-[10px] tabular-nums text-muted-foreground/70">
          {formatSize(part.text)}
        </span>
      </button>
      {open ? (
        <div className="relative px-2.5 pb-2">
          {part.description ? (
            <p className="pb-1 pr-8 text-[10px] leading-snug text-muted-foreground">
              {part.description}
            </p>
          ) : null}
          <div className="absolute right-3 top-0 z-10">
            <CopyButton
              content={part.text}
              size="xs"
              tooltip={`${part.label} value`}
            />
          </div>
          <pre className="max-h-72 overflow-auto whitespace-pre-wrap break-words rounded bg-muted/60 p-2 pr-8 text-[11px] leading-relaxed text-foreground scrollbar-thin">
            {prettyValue(part.text)}
          </pre>
        </div>
      ) : null}
    </div>
  );
}

function PartLabel({ part }: { part: TestCasePart }) {
  return (
    <span
      className="shrink-0 truncate text-[11px] font-medium text-foreground/80"
      style={{ maxWidth: "11rem" }}
      title={part.name ? `${part.label} (${part.name})` : part.label}
    >
      {part.label}
      {part.undeclared ? (
        <span
          className="ml-1 font-normal text-amber-600 dark:text-amber-400"
          title="This agent no longer declares a variable by this name."
        >
          (not declared)
        </span>
      ) : null}
    </span>
  );
}

function GroupLabel({ children }: { children: React.ReactNode }) {
  return (
    <div className="pb-0.5 pl-[22px] pr-2.5 pt-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground/70">
      {children}
    </div>
  );
}

export interface TestCaseInputsProps {
  /** Conversation the attachment chips resolve against. */
  conversationId: string;
  /** The human-typed text of the turn — never machine content. */
  userInput: string;
  /** The turn's canonical content parts; attachments are pulled out of it. */
  inputContent: readonly MessagePart[];
  /** Declared-variable values only (never the merged conversation snapshot). */
  variables: Record<string, unknown>;
  /** The agent's current declarations — supply labels and help text. */
  declarations: readonly AgentVariableDeclaration[];
  className?: string;
}

export function TestCaseInputs({
  conversationId,
  userInput,
  inputContent,
  variables,
  declarations,
  className,
}: TestCaseInputsProps) {
  // React Compiler memoizes these; no manual useMemo (CLAUDE.md § Core invariants).
  const parts = buildTestCaseParts({ variables, userInput, declarations });
  const attachmentParts = inputContent.filter(isAttachmentMessagePart);

  const refs = parts.flatMap((p) => (p.entity ? [p.entity] : []));
  const { titleFor } = useEntityTitles(refs);

  const typed = parts.filter((p) => p.group === "input");
  const variableParts = parts.filter((p) => p.group === "variable");

  if (
    typed.length === 0 &&
    variableParts.length === 0 &&
    attachmentParts.length === 0
  ) {
    return (
      <p className={cn("px-2.5 py-1.5 text-[11px] text-muted-foreground", className)}>
        This test case carries no inputs.
      </p>
    );
  }

  return (
    <div className={cn("divide-y divide-border/40", className)}>
      {variableParts.length > 0 ? (
        <div className="divide-y divide-border/30 pb-1">
          <GroupLabel>Variables ({variableParts.length})</GroupLabel>
          {variableParts.map((part) => (
            <PartRow key={part.key} part={part} titleFor={titleFor} />
          ))}
        </div>
      ) : null}

      {attachmentParts.length > 0 ? (
        <div className="pb-1.5">
          <GroupLabel>Attachments ({attachmentParts.length})</GroupLabel>
          <MessageAttachmentStrip
            conversationId={conversationId}
            parts={attachmentParts as MessagePart[]}
            className="px-2.5 pt-1"
          />
        </div>
      ) : null}

      {typed.length > 0 ? (
        // No group caption here: the row's own label already says what it is,
        // and "USER INPUT" above "What the person typed" is one wasted line in
        // a panel whose whole problem was wasted vertical space.
        <div className="pb-1">
          {typed.map((part) => (
            <PartRow key={part.key} part={part} titleFor={titleFor} />
          ))}
        </div>
      ) : null}
    </div>
  );
}
