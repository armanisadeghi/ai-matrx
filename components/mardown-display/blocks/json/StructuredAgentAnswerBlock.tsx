"use client";

import { RichContent } from "@ai-matrx/rich-content/levels/RichContent";
import React from "react";
import { Copy, Table2 } from "lucide-react";
import { shapeOfValue } from "@ai-matrx/records-ui/table-shape";
import { useOpenSaveToTable } from "@/features/overlays/openers/saveToTable";
import { KIND_KEY } from "@ai-matrx/content-ir";
import { useClipboard } from "@ai-matrx/kit/clipboard";
import { toast } from "@/lib/toast";
import { valueCarriesKind } from "@/features/content-ir/surfaces/json-kind-signal";
import { AnswerValueView } from "@/components/official/structured-value/AnswerValueView";
import { Button } from "@ai-matrx/design-system/controls";

import {
  cellText,
  isRenderableStructuredAgentAnswer,
  isSmallObjectArray,
  isStringArray,
  parseStructuredAgentAnswer,
  readableLabel,
  selectNextStep,
  selectProse,
  selectStatus,
  type StructuredValue,
} from "./structured-answer-text";

export { isRenderableStructuredAgentAnswer, parseStructuredAgentAnswer };


export interface StructuredAgentAnswerProps {
  value: StructuredValue;
  rawContent: string;
  renderMarkdown: (content: string) => React.ReactElement;
}


/**
 * Status tone from the VALUE, read against a vocabulary — not against one
 * agent's enum. This block is the floor for EVERY schema-bound agent, so
 * hardcoding `done | blocked | needs_user` (the Sandbox Specialist's three
 * values) would give the next agent's "complete" / "failed" / "pending" a
 * grey pill that says nothing. Anything unrecognised stays neutral rather
 * than guessing a colour that would lie about the run.
 */
export function statusTone(
  value: string,
): "success" | "warning" | "danger" | "neutral" {
  const v = value.trim().toLowerCase();
  if (
    ["done", "complete", "completed", "success", "succeeded", "ok", "passed", "resolved", "healthy"].includes(v)
  ) {
    return "success";
  }
  if (
    ["blocked", "failed", "failure", "error", "fatal", "refused", "broken"].includes(v)
  ) {
    return "danger";
  }
  if (
    ["needs_user", "needs_input", "needs_review", "pending", "partial", "in_progress", "running", "waiting", "warning", "unknown"].includes(v)
  ) {
    return "warning";
  }
  return "neutral";
}

const STATUS_TONE_CLASS: Record<
  ReturnType<typeof statusTone>,
  string
> = {
  success: "bg-success/10 text-success-ink",
  warning: "bg-warning/10 text-warning-ink",
  danger: "bg-destructive/10 text-destructive-ink",
  neutral: "bg-muted text-muted-foreground",
};

/**
 * The raw payload keeps a Copy control. Before this block existed the JSON
 * rendered through `JsonBlock`, whose header carried Copy — replacing it with
 * a bare `<pre>` would have taken a working affordance away while making the
 * answer prettier. `useClipboard` (kit) is the ONE clipboard implementation.
 */
function CopyRawButton({ rawContent }: { rawContent: string }) {
  const { copyText } = useClipboard({
    notify: (message, kind) =>
      kind === "error" ? toast.error(message) : toast.success(message),
  });
  return (
    <Button variant="quiet" icon={<Copy />} aria-label="Copy raw JSON" onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        void copyText(rawContent, "Raw answer copied");
      }}>
      Copy
    </Button>
  );
}

/**
 * THE ONE "Save to a table" (SAVE-AS-TABLE-EVERYWHERE): an agent's structured answer that holds
 * rows (a list of records, a kind value's items) offers them as a new table or rows for one the
 * person has. Absent when the answer holds no rows — never a dead control.
 */
function SaveAnswerToTableButton({ value }: { value: StructuredValue }) {
  const openSaveToTable = useOpenSaveToTable();
  if (!openSaveToTable || !shapeOfValue(value)) return null;
  return (
    <Button variant="quiet" icon={<Table2 />} aria-label="Save to a table" onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        openSaveToTable({ value });
      }}>
      Save to a table
    </Button>
  );
}

export function StructuredAgentAnswerBlock({
  value,
  rawContent,
  renderMarkdown,
}: StructuredAgentAnswerProps) {
  const prose = selectProse(value);
  const status = selectStatus(value);
  const nextStep = selectNextStep(value);

  return (
    <div
      className="my-3 space-y-3"
      data-content-renderer="StructuredAgentAnswerBlock"
    >
      {prose ? renderMarkdown(prose.text) : null}
      {status ? (
        <span
          className={`inline-flex rounded-full px-2.5 py-1 text-xs font-medium ${STATUS_TONE_CLASS[statusTone(status.text)]}`}
        >
          {readableLabel(status.text)}
        </span>
      ) : null}
      {nextStep ? (
        <div className="border-l-2 border-primary/50 pl-3 text-sm">
          <p className="font-medium">Next step</p>
          <div className="text-muted-foreground"><RichContent source={nextStep.text ?? ""} level="standard" /></div>
        </div>
      ) : null}
      {Object.entries(value).map(([key, item]) => {
        if (
          key === KIND_KEY ||
          key === prose?.key ||
          key === status?.key ||
          key === nextStep?.key
        )
          return null;
        if (isStringArray(item)) {
          return (
            <div key={key} className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">
                {readableLabel(key)}
              </p>
              <div className="flex flex-wrap gap-1.5">
                {item.map((entry) => (
                  <span
                    key={entry}
                    className="rounded-full bg-muted px-2 py-0.5 text-xs"
                  >
                    {cellText(entry)}
                  </span>
                ))}
              </div>
            </div>
          );
        }
        if (isSmallObjectArray(item)) {
          const columns = Array.from(
            new Set(item.flatMap((row) => Object.keys(row))),
          ).slice(0, 6);
          return (
            <div key={key} className="overflow-x-auto">
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                {readableLabel(key)}
              </p>
              <table className="w-full text-left text-sm">
                <thead>
                  <tr>
                    {columns.map((column) => (
                      <th key={column} className="border-b p-2 font-medium">
                        {readableLabel(column)}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {item.map((row, rowIndex) => (
                    <tr key={rowIndex}>
                      {columns.map((column) => (
                        <td key={column} className="border-b p-2 align-top">
                          {cellText(row[column])}
                        </td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          );
        }
        return null;
      })}
      <details className="text-sm">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 text-muted-foreground">
          Details
          <CopyRawButton rawContent={rawContent} />
          <SaveAnswerToTableButton value={value} />
        </summary>
        {/* "Details" is not a labelled source view: a payload that carries a
            kind (nested object or string-held, any spelling) is drawn by the
            one value door, never printed raw (kind-never-raw R8-3 d). */}
        {valueCarriesKind(value) ? (
          <div className="mt-2">
            <AnswerValueView value={value} />
          </div>
        ) : (
          <pre /* rich-content-exempt: app-authored string, editable source text, or raw payload */ className="mt-2 overflow-x-auto whitespace-pre-wrap text-xs">
            {rawContent}
          </pre>
        )}
      </details>
    </div>
  );
}
