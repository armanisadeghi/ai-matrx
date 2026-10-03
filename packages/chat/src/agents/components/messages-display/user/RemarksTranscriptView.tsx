"use client";

/**
 * A persisted `input_remarks` part in the user bubble: each remark the person
 * sent with this turn, one compact row — kind icon, the quote, then their words
 * / choice / diff / answers. Read-only; the chip it was before send is gone.
 * The handle the server gave it (`c3`) shows at the row's end, so the person
 * can name it ("about c3…") the way the agent does.
 */

import { remarkKindDisplay } from "../../context-items/remark-display";
import type { RemarkKind } from "../../../redux/execution-system/instance-resources/remarks";

const KINDS = new Set<RemarkKind>(["comment", "choice", "edit", "answers", "interaction"]);
/** The server's handle grammar (aidream config/remarks.py): `c` + 1–6 digits, no leading zero. */
const HANDLE = /^c[1-9][0-9]{0,5}$/;

interface Row {
  kind: RemarkKind;
  quote: string | null;
  body: string | null;
  diff: string | null;
  title: string | null;
  answers: { question: string; answer: string }[];
  handle: string | null;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function str(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value : null;
}

function readRows(payload: Record<string, unknown> | null): Row[] {
  const items = Array.isArray(payload?.items) ? payload.items : [];
  return items.flatMap((raw) => {
    if (!isRecord(raw) || !KINDS.has(raw.kind as RemarkKind)) return [];
    const answers = Array.isArray(raw.answers)
      ? raw.answers.flatMap((a) =>
          isRecord(a) && typeof a.question === "string"
            ? [{ question: a.question, answer: Array.isArray(a.answer) ? a.answer.join(", ") : String(a.answer ?? "") }]
            : [],
        )
      : [];
    return [
      {
        kind: raw.kind as RemarkKind,
        quote: str(raw.quote),
        body: str(raw.body),
        diff: str(raw.diff),
        title: str(raw.title),
        answers,
        handle: typeof raw.handle === "string" && HANDLE.test(raw.handle) ? raw.handle : null,
      },
    ];
  });
}

export function RemarksTranscriptView({ payload }: { payload: Record<string, unknown> | null }) {
  const rows = readRows(payload);
  if (rows.length === 0) return null;
  return (
    <div className="my-1 grid gap-1">
      {rows.map((row, i) => {
        const { icon: Icon, label } = remarkKindDisplay(row.kind);
        return (
          <div key={i} className="flex min-w-0 items-start gap-1.5 rounded-md border border-border bg-card px-2 py-1 text-xs" data-remark-handle={row.handle ?? undefined}>
            <Icon className="mt-0.5 h-3.5 w-3.5 shrink-0 text-amber-600 dark:text-amber-400" aria-label={label} />
            <div className="grid min-w-0 gap-0.5">
              {row.quote || row.title ? (
                <div className="truncate border-l-2 border-primary/40 pl-1.5 text-muted-foreground">
                  {row.quote ?? row.title}
                </div>
              ) : null}
              {row.body ? <div className="whitespace-pre-wrap text-foreground">{row.body}</div> : null}
              {row.diff ? (
                <pre className="overflow-x-auto whitespace-pre-wrap font-mono text-[11px] text-foreground">{row.diff}</pre>
              ) : null}
              {row.answers.length ? (
                <ul className="grid gap-0.5 text-foreground">
                  {row.answers.map((a, j) => (
                    <li key={j} className="truncate">
                      <span className="text-muted-foreground">{a.question}:</span> {a.answer}
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
            {row.handle ? (
              <span className="ml-auto shrink-0 font-mono text-[10px] text-muted-foreground" title={`Remark ${row.handle}`}>
                {row.handle}
              </span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
