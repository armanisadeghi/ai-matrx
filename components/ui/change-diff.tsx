"use client";

/**
 * ChangeDiff — a reusable before → after change list.
 *
 * The canonical way to show "here's what's changing" anywhere in the app: an
 * agent-edit approval, a project/settings update, a version-history entry, a
 * review-before-save panel. An **add** (no `before`) shows only the new value;
 * scalar updates show `before → after`. Long fields (`block: true`) open on
 * the canonical combined diff, with New and Original source views alongside.
 *
 * Purely presentational + tone-neutral — no Redux, no feature coupling. Feed it
 * `ChangeFieldDiff[]` from wherever the change originates.
 */

import { ArrowRight } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { cn } from "@/lib/utils";
import { InlineTextDiff } from "@ai-matrx/diff/react";

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
function display(value: string | null | undefined): {
  text: string;
  empty: boolean;
} {
  if (value == null || value.trim() === "")
    return { text: "empty", empty: true };
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
    return (
      <div className="flex flex-col gap-1 rounded-lg border border-border/60 bg-background/60 p-2.5">
        <div className="text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          {field.label}
        </div>
        {hasBefore ? (
          <BlockChangeComparison
            original={field.before ?? ""}
            modified={field.after ?? ""}
          />
        ) : (
          <BlockValue value={after} emptyLabel="—" />
        )}
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2 text-[13px]">
      <div className="w-20 shrink-0 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
        {field.label}
      </div>
      <div className="flex min-w-0 flex-1 flex-wrap items-baseline gap-1.5">
        {hasBefore && (
          <>
            <span
              className={cn(
                "min-w-0 break-words [overflow-wrap:anywhere]",
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
            "min-w-0 break-words font-medium [overflow-wrap:anywhere]",
            after.empty ? "italic text-muted-foreground" : "text-foreground",
          )}
        >
          {after.empty ? (hasBefore ? "cleared" : "—") : after.text}
        </span>
      </div>
    </div>
  );
}

function BlockChangeComparison({
  original,
  modified,
}: {
  original: string;
  modified: string;
}) {
  return (
    <Tabs defaultValue="diff" className="min-w-0">
      <TabsList className="h-7 w-full justify-start gap-1 rounded-md bg-muted/50 p-0.5">
        <TabsTrigger value="diff" className="h-6 px-2 text-[10px]">
          Diff
        </TabsTrigger>
        <TabsTrigger value="new" className="h-6 px-2 text-[10px]">
          New
        </TabsTrigger>
        <TabsTrigger value="original" className="h-6 px-2 text-[10px]">
          Original
        </TabsTrigger>
      </TabsList>
      <TabsContent
        value="diff"
        className="mt-1.5 rounded-md border border-border/50"
      >
        <InlineTextDiff original={original} modified={modified} view="inline" />
      </TabsContent>
      <TabsContent value="new" className="mt-1.5">
        <BlockSourceValue value={modified} emptyLabel="cleared" />
      </TabsContent>
      <TabsContent value="original" className="mt-1.5">
        <BlockSourceValue value={original} emptyLabel="empty" />
      </TabsContent>
    </Tabs>
  );
}

function BlockSourceValue({
  value,
  emptyLabel,
}: {
  value: string;
  emptyLabel: string;
}) {
  if (value === "") {
    return <BlockValue value={display(null)} emptyLabel={emptyLabel} />;
  }

  const whitespaceOnly = value.trim() === "";
  return (
    <div className="min-w-0">
      {whitespaceOnly ? (
        <div className="mb-1 text-[10px] font-medium uppercase tracking-wide text-muted-foreground">
          Whitespace only
        </div>
      ) : null}
      <pre className="m-0 whitespace-pre-wrap break-words font-sans text-[13px] leading-relaxed text-foreground [overflow-wrap:anywhere]">
        {value}
      </pre>
    </div>
  );
}

function BlockValue({
  value,
  emptyLabel,
}: {
  value: ReturnType<typeof display>;
  emptyLabel: string;
}) {
  return (
    <div
      className={cn(
        "whitespace-pre-wrap break-words text-[13px] leading-relaxed [overflow-wrap:anywhere]",
        value.empty ? "italic text-muted-foreground" : "text-foreground",
      )}
    >
      {value.empty ? emptyLabel : value.text}
    </div>
  );
}
