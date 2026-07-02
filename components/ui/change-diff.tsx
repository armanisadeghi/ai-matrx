/**
 * ChangeDiff — a reusable before → after change list.
 *
 * The canonical way to show "here's what's changing" anywhere in the app: an
 * agent-edit approval, a project/settings update, a version-history entry, a
 * review-before-save panel. An **add** (no `before`) shows only the new value;
 * an **update** shows `before → after` (old struck through, arrow, new). Long
 * fields (`block: true`) render as stacked blocks instead of one line.
 *
 * Purely presentational + tone-neutral — no Redux, no feature coupling. Feed it
 * `ChangeFieldDiff[]` from wherever the change originates.
 */

import { ArrowRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { InlineTextDiff } from "@/components/diff/adapters/InlineTextDiff";

export interface ChangeFieldDiff {
  /** Field name, Sentence case: "Title", "Status", "Due date", "Description". */
  label: string;
  /**
   * Current value. `undefined` ⇒ a brand-new value (an add) — only `after`
   * renders. `null` / "" ⇒ the field is currently empty/unset.
   */
  before?: string | null;
  /** Proposed value. `null` ⇒ the change clears the field. */
  after: string | null;
  /** Render as a multi-line block (description / note body) instead of inline. */
  block?: boolean;
}

/** Humanize a value for display: null/empty → a muted placeholder marker. */
function display(value: string | null | undefined): { text: string; empty: boolean } {
  if (value == null || value.trim() === "") return { text: "empty", empty: true };
  return { text: value, empty: false };
}

export function ChangeDiff({
  fields,
  className,
}: {
  fields: ChangeFieldDiff[];
  className?: string;
}) {
  if (fields.length === 0) return null;
  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {fields.map((f, i) => (
        <ChangeDiffRow key={`${f.label}-${i}`} field={f} />
      ))}
    </div>
  );
}

function ChangeDiffRow({ field }: { field: ChangeFieldDiff }) {
  const hasBefore = field.before !== undefined; // undefined ⇒ this is an add
  const after = display(field.after);
  const before = display(field.before ?? null);

  if (field.block) {
    // A real UPDATE (both sides present) shows a word-level diff via the
    // canonical engine instead of the whole-old-strike + whole-new block.
    // Adds (no before) and clears (empty after) keep the simple block render.
    const isUpdate = hasBefore && !before.empty && !after.empty;
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/60 p-2.5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {field.label}
        </div>
        {isUpdate ? (
          <div className="max-h-48 overflow-auto rounded-md border border-border/50">
            <InlineTextDiff
              original={before.text}
              modified={after.text}
              view="inline"
            />
          </div>
        ) : (
          <div
            className={cn(
              "line-clamp-4 whitespace-pre-wrap text-[13px] leading-relaxed",
              after.empty ? "italic text-muted-foreground" : "text-foreground",
            )}
          >
            {after.empty ? "cleared" : after.text}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="flex items-baseline gap-2 text-[13px]">
      <div className="w-20 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {field.label}
      </div>
      <div className="flex min-w-0 flex-1 items-center gap-1.5">
        {hasBefore && (
          <>
            <span
              className={cn(
                "truncate",
                before.empty
                  ? "italic text-muted-foreground/60"
                  : "text-muted-foreground/70 line-through",
              )}
            >
              {before.text}
            </span>
            <ArrowRight className="size-3 shrink-0 text-muted-foreground/50" />
          </>
        )}
        <span
          className={cn(
            "truncate font-medium",
            after.empty ? "italic text-muted-foreground" : "text-foreground",
          )}
        >
          {after.empty ? (hasBefore ? "cleared" : "—") : after.text}
        </span>
      </div>
    </div>
  );
}
