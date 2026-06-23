"use client";

// CleanupChangeCard — one kind of change, in plain words. Header says what it
// does ("Removed spaces at the end of lines") and how many places; the body
// shows real Now -> After examples with the exact changed characters made
// visible and marked. One Apply/Skip switch controls the whole change.

import { Switch } from "@/components/ui/switch";
import { cn } from "@/lib/utils";
import type { ChangeExample, OperationCard } from "@/lib/content-cleanup/review";

/** Render whitespace visibly (spaces -> middots, tabs -> arrow). */
function visible(value: string): string {
  return value.replace(/ /g, "·").replace(/\t/g, "→");
}

const MARK_NOW =
  "rounded-[3px] bg-red-200/80 px-px text-red-900 dark:bg-red-500/30 dark:text-red-100";
const CHIP_AFTER =
  "rounded-[3px] bg-emerald-100 px-1 text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300";

function NowCell({ example }: { example: ChangeExample }) {
  if (example.kind === "block") {
    return (
      <span className={cn(MARK_NOW, "italic")}>{example.nowLabel}</span>
    );
  }
  const { line, markStart, markEnd } = example;
  return (
    <>
      <span>{line.slice(0, markStart)}</span>
      <span className={MARK_NOW}>{visible(line.slice(markStart, markEnd))}</span>
      <span>{line.slice(markEnd)}</span>
    </>
  );
}

function AfterCell({ example }: { example: ChangeExample }) {
  if (example.kind === "block") {
    return <span className={cn(CHIP_AFTER, "italic")}>{example.afterLabel}</span>;
  }
  if (example.after === "") {
    return <span className="italic text-muted-foreground/40">(empty line)</span>;
  }
  return <span>{example.after}</span>;
}

export function CleanupChangeCard({
  card,
  accepted,
  onToggle,
}: {
  card: OperationCard;
  accepted: boolean;
  onToggle: (id: OperationCard["id"], accepted: boolean) => void;
}) {
  const more = card.count - card.examples.length;
  return (
    <div
      className={cn(
        "rounded-lg border bg-card p-3 transition-colors",
        accepted ? "border-border" : "border-dashed border-border/60",
      )}
    >
      <div className="mb-2.5 flex items-center gap-3">
        <span
          className={cn(
            "min-w-0 flex-1 text-sm font-medium",
            accepted ? "text-foreground" : "text-muted-foreground line-through",
          )}
        >
          {card.human}
          <span className="ml-2 text-xs font-normal text-muted-foreground">
            {card.count} place{card.count !== 1 ? "s" : ""}
          </span>
        </span>
        <label className="flex shrink-0 cursor-pointer items-center gap-1.5">
          <Switch
            checked={accepted}
            onCheckedChange={(v) => onToggle(card.id, v)}
          />
          <span
            className={cn(
              "w-8 text-xs font-medium",
              accepted ? "text-foreground" : "text-muted-foreground",
            )}
          >
            {accepted ? "Apply" : "Skip"}
          </span>
        </label>
      </div>

      <div className={cn(!accepted && "opacity-50")}>
        <div className="grid grid-cols-2 gap-x-3 border-b border-border/50 pb-1 text-[0.625rem] font-semibold uppercase tracking-wide">
          <span className="text-red-600 dark:text-red-400">Now</span>
          <span className="text-emerald-600 dark:text-emerald-400">After</span>
        </div>
        <div className="divide-y divide-border/40 font-mono text-xs">
          {card.examples.map((ex, i) => (
            <div key={i} className="grid grid-cols-2 gap-x-3 py-1">
              <div className="whitespace-pre-wrap break-words text-foreground/80">
                <NowCell example={ex} />
              </div>
              <div className="whitespace-pre-wrap break-words text-foreground/80">
                <AfterCell example={ex} />
              </div>
            </div>
          ))}
        </div>
        {more > 0 && (
          <div className="pt-1.5 text-[0.6875rem] text-muted-foreground">
            +{more} more like {more === 1 ? "this" : "these"}
          </div>
        )}
      </div>
    </div>
  );
}
