"use client";

/**
 * Column 2 — the WORK ORDER: counts you can tune, the readiness of what is
 * already planned, and the foundation the shape demands measured against the
 * real CMS.
 *
 * Every count row keeps a FIXED footprint (label block + coverage + stepper) so
 * typing a new number never reflows the column — the jitter that makes a
 * numbers UI feel broken.
 *
 * "Name them" is the fastest control on this screen: paste the client's real
 * service list, one per line, and it sets the count AND rewrites the slugs
 * live. Eight stepper clicks plus eight renames collapse into one paste.
 */
import { useState } from "react";
import { ListPlus, Minus, Plus, RotateCcw, X } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn } from "@/lib/utils";

import { humanizeKey, type ExpandedArchetype } from "../archetypes";
import type { ChecklistItem, ItemState, Readiness } from "../readiness";
import { SetupSection, Stat } from "./SetupSection";

const MAX_COUNT = 500;

const STATE_DOT: Record<ItemState, string> = {
  met: "bg-success",
  partial: "bg-primary",
  unmet: "bg-muted-foreground/40",
  unknown: "bg-warning",
};

export function SetupWorkOrderColumn({
  expanded,
  readiness,
  counts,
  names,
  userNamedKeys,
  dirtyKeys,
  onCountChange,
  onNamesChange,
  onReset,
  pageTypeName,
  newCount,
  bridgeSlot,
}: {
  expanded: ExpandedArchetype;
  readiness: Readiness;
  counts: Record<string, number>;
  /** Effective names — the user's paste, else the live plan's own child labels. */
  names: Record<string, string[]>;
  /** Which of those the USER supplied (the rest came from the plan itself). */
  userNamedKeys: Set<string>;
  dirtyKeys: Set<string>;
  onCountChange: (familyKey: string, next: number) => void;
  onNamesChange: (familyKey: string, next: string[] | null) => void;
  onReset: () => void;
  pageTypeName: (slug: string | null) => string;
  /** How many routes this commit would create — the headline number. */
  newCount: number;
  /**
   * The "Make it real" rungs (SetupBridgeSection), injected so this column
   * stays presentational — the rungs need site + dispatch, which live in
   * SetupView. Rendered directly under the foundation checklist: the
   * checklist diagnoses, the rungs act on the same facts.
   */
  bridgeSlot?: React.ReactNode;
}) {
  const [namingOpen, setNamingOpen] = useState<string | null>(null);

  const coreItem = readiness.items.find((item) => item.key === "core");
  const foundationItems = readiness.items.filter(
    (item) => item.group === "foundation",
  );
  const unknownFoundation = foundationItems.filter(
    (item) => item.state === "unknown",
  ).length;

  return (
    <div className="flex flex-col gap-5 p-4 md:h-full md:min-h-0 md:overflow-y-auto">
      <SetupSection title="Work order">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
          <Stat value={expanded.pageCount} label="pages in shape" tone="primary" />
          <Stat value={readiness.planNodesLive} label="pages planned" />
          <Stat value={newCount} label="still to create" />
          <Stat
            value={readiness.extraRoutes.length}
            label="beyond the shape"
            tone="muted"
          />
        </div>
      </SetupSection>

      {expanded.concepts.length > 0 || expanded.omits.length > 0 ? (
        <SetupSection title="Concepts">
          <p className="mb-2 text-xs leading-relaxed text-muted-foreground">
            A shape is a SELECTION from the concept menu — what it takes, at
            which variant, and what it deliberately leaves for you to add later.
          </p>
          {expanded.concepts.length > 0 ? (
            <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
              {expanded.concepts.map((item) => (
                <li
                  key={item.concept}
                  className="flex items-baseline justify-between gap-3 bg-card px-2.5 py-1.5"
                >
                  <span className="truncate text-xs font-medium text-foreground">
                    {item.label}
                  </span>
                  <span className="shrink-0 truncate text-[11px] text-muted-foreground">
                    {item.variantLabel}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}
          {expanded.omits.length > 0 ? (
            <div className="mt-2 flex flex-wrap gap-1">
              <span className="text-[11px] leading-5 text-muted-foreground">
                Left out:
              </span>
              {expanded.omits.map((key) => (
                <span
                  key={key}
                  className="rounded bg-muted px-1.5 py-0.5 text-[11px] leading-4 text-muted-foreground"
                >
                  {humanizeKey(key)}
                </span>
              ))}
            </div>
          ) : null}
        </SetupSection>
      ) : null}

      <SetupSection
        title="Counts"
        action={
          dirtyKeys.size > 0 ? (
            <Button
              variant="ghost"
              size="sm"
              className="h-6 gap-1.5 px-2 text-xs"
              onClick={onReset}
            >
              <RotateCcw className="h-3 w-3" />
              Reset
            </Button>
          ) : null
        }
      >
        {expanded.families.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This shape has no repeating families — only its core pages.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {expanded.families.map((family) => {
              const coverage = readiness.families.find(
                (item) => item.key === family.key,
              );
              const planned = coverage?.plannedCount ?? 0;
              const pct =
                family.count > 0
                  ? Math.min(100, Math.round((planned / family.count) * 100))
                  : 0;
              const dirty = dirtyKeys.has(family.key);
              const supplied = names[family.key];
              const naming = namingOpen === family.key;
              return (
                <li key={family.key} className="bg-card px-2.5 py-2">
                  <div className="flex items-center gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium text-foreground">
                          {family.label}
                        </span>
                        {family.materialize === "count_only" ? (
                          <span
                            className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[11px] leading-none text-muted-foreground"
                            title="Only the hub page is created — the individual titles come from research, not a template. The count is recorded on the hub as the work order."
                          >
                            count only
                          </span>
                        ) : null}
                        {dirty ? (
                          <span className="shrink-0 rounded bg-primary/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-primary">
                            changed
                          </span>
                        ) : null}
                      </div>
                      <div className="mt-0.5 flex items-center gap-2 font-mono text-[11px] text-muted-foreground">
                        <span className="truncate">{family.route}/…</span>
                        <span className="truncate">
                          {pageTypeName(family.childPageType)}
                        </span>
                      </div>
                      <div className="mt-1.5 flex items-center gap-2">
                        <div
                          className="h-1 min-w-0 flex-1 overflow-hidden rounded-full bg-muted"
                          role="presentation"
                        >
                          <div
                            className={cn(
                              "h-full rounded-full transition-[width]",
                              pct >= 100 ? "bg-success" : "bg-primary",
                            )}
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                        <span className="w-16 shrink-0 text-right font-mono text-[11px] tabular-nums text-muted-foreground">
                          {planned}/{family.count}
                        </span>
                      </div>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label={`One fewer ${family.label}`}
                        disabled={family.count <= 0}
                        onClick={() =>
                          onCountChange(family.key, Math.max(0, family.count - 1))
                        }
                      >
                        <Minus className="h-3.5 w-3.5" />
                      </Button>
                      <Input
                        type="number"
                        inputMode="numeric"
                        min={0}
                        max={MAX_COUNT}
                        value={counts[family.key] ?? family.count}
                        aria-label={`${family.label} count`}
                        onChange={(event) => {
                          const parsed = Number.parseInt(event.target.value, 10);
                          if (Number.isNaN(parsed)) {
                            onCountChange(family.key, 0);
                            return;
                          }
                          onCountChange(
                            family.key,
                            Math.max(0, Math.min(MAX_COUNT, parsed)),
                          );
                        }}
                        /* 16px on mobile: anything smaller makes iOS zoom on focus. */
                        className="h-7 w-16 px-1.5 text-center text-base tabular-nums sm:text-sm"
                      />
                      <Button
                        variant="outline"
                        size="sm"
                        className="h-7 w-7 p-0"
                        aria-label={`One more ${family.label}`}
                        disabled={family.count >= MAX_COUNT}
                        onClick={() => onCountChange(family.key, family.count + 1)}
                      >
                        <Plus className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>

                  {family.materialize === "pages" ? (
                    <div className="mt-1.5 flex items-center gap-2">
                      {supplied && userNamedKeys.has(family.key) ? (
                        <span className="inline-flex items-center gap-1 rounded bg-success/15 px-1.5 py-0.5 text-[11px] font-medium leading-none text-success">
                          {supplied.length} named
                          <button
                            type="button"
                            aria-label={`Clear the ${family.label} names`}
                            onClick={() => onNamesChange(family.key, null)}
                          >
                            <X className="h-3 w-3" />
                          </button>
                        </span>
                      ) : supplied ? (
                        <span
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px] font-medium leading-none text-muted-foreground"
                          title="These names come from the pages already in the plan, so re-running this shape adopts them instead of adding placeholders beside them."
                        >
                          {supplied.length} from the plan
                        </span>
                      ) : null}
                      <button
                        type="button"
                        className="ml-auto inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:underline"
                        onClick={() =>
                          setNamingOpen(naming ? null : family.key)
                        }
                      >
                        <ListPlus className="h-3 w-3" />
                        {supplied ? "Edit names" : "Name them"}
                        <span className="sr-only"> for {family.label}</span>
                      </button>
                    </div>
                  ) : null}

                  {naming ? (
                    <NameBox
                      label={family.label}
                      initial={supplied ?? family.childLabels}
                      onCancel={() => setNamingOpen(null)}
                      onApply={(list) => {
                        onNamesChange(family.key, list.length > 0 ? list : null);
                        setNamingOpen(null);
                      }}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </SetupSection>

      {coreItem ? (
        <SetupSection
          title={`Core pages · ${coreItem.actual} of ${coreItem.required} planned`}
        >
          <ul className="flex flex-wrap gap-1.5">
            {readiness.corePages.map((page) => (
              <li
                key={page.route}
                className={cn(
                  "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs",
                  page.present
                    ? "border-success/40 bg-success/10 text-foreground"
                    : "border-dashed border-border text-muted-foreground",
                )}
              >
                <span className="font-medium">{page.label}</span>
                <span className="font-mono text-[11px] opacity-70">{page.route}</span>
              </li>
            ))}
          </ul>
        </SetupSection>
      ) : null}

      <SetupSection title="Foundation this shape demands">
        {foundationItems.length === 0 ? (
          <p className="text-xs text-muted-foreground">
            This shape declares no foundation requirements.
          </p>
        ) : (
          <ul className="divide-y divide-border overflow-hidden rounded-md border border-border">
            {foundationItems.map((item) => (
              <FoundationRow key={item.key} item={item} />
            ))}
          </ul>
        )}
        <p className="text-[11px] leading-relaxed text-muted-foreground">
          Counts propagate — {humanizeKey("service_icon")} follows the Services
          count.{" "}
          {unknownFoundation > 0
            ? `${unknownFoundation} item(s) could not be measured: what satisfies them lives in the CMS database, and this site has no CMS counterpart we could read. Nothing is marked done from a guess.`
            : "Measured against the linked CMS site — tokens, components, navigation, and assets are real counts, not assumptions."}
        </p>
      </SetupSection>

      {bridgeSlot}

      <SetupSection title="Depth of what is planned">
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-wrap sm:items-stretch">
          <Stat
            value={readiness.planNodesLive - readiness.nodesWithoutBrief}
            label="have a brief"
          />
          <Stat
            value={readiness.planNodesLive - readiness.nodesWithoutKeyword}
            label="have a keyword"
          />
          <Stat value={readiness.nodesWithoutBrief} label="brief missing" tone="muted" />
          <Stat
            value={readiness.nodesWithoutKeyword}
            label="keyword missing"
            tone="muted"
          />
        </div>
      </SetupSection>
    </div>
  );
}

function FoundationRow({ item }: { item: ChecklistItem }) {
  return (
    <li className="flex items-center gap-2 bg-card px-2.5 py-1.5" title={item.detail}>
      <span
        className={cn("h-2 w-2 shrink-0 rounded-full", STATE_DOT[item.state])}
        aria-hidden
      />
      <span className="min-w-0 flex-1 truncate text-sm text-foreground">
        {item.label}
      </span>
      <span className="shrink-0 font-mono text-[11px] tabular-nums text-muted-foreground">
        {item.state === "unknown" ? "—" : item.actual} / {item.required}
      </span>
      <span
        className={cn(
          "w-16 shrink-0 rounded px-1.5 py-0.5 text-center text-[11px] font-medium leading-none",
          item.state === "met" && "bg-success/15 text-success",
          item.state === "partial" && "bg-primary/15 text-primary",
          item.state === "unmet" && "bg-muted text-muted-foreground",
          item.state === "unknown" && "bg-warning/15 text-warning",
        )}
      >
        {item.state === "unknown" ? "not checked" : item.state}
      </span>
    </li>
  );
}

/**
 * Uncontrolled on purpose: the textarea owns the typing, and the value is read
 * out of the form on submit. Nothing upstream re-renders per keystroke, and
 * there is no draft state to go stale against a background refetch.
 */
function NameBox({
  label,
  initial,
  onApply,
  onCancel,
}: {
  label: string;
  initial: string[];
  onApply: (names: string[]) => void;
  onCancel: () => void;
}) {
  return (
    <form
      className="mt-2"
      onSubmit={(event) => {
        event.preventDefault();
        const field = event.currentTarget.elements.namedItem("names");
        const raw = field instanceof HTMLTextAreaElement ? field.value : "";
        onApply(
          raw
            .split("\n")
            .map((line) => line.trim())
            .filter(Boolean),
        );
      }}
    >
      <Textarea
        name="names"
        defaultValue={initial.join("\n")}
        rows={6}
        autoFocus
        placeholder={`Paste the real ${label.toLowerCase()} — one per line`}
        /* 16px on mobile: anything smaller makes iOS zoom the page on focus. */
        className="min-h-0 resize-y text-base sm:text-sm"
      />
      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
        One per line. This sets both the count and the slugs — the routes rewrite
        live in the preview.
      </p>
      <div className="mt-1.5 flex gap-1.5">
        <Button type="submit" size="sm" className="h-7 px-2.5 text-xs">
          Use these names
        </Button>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 px-2.5 text-xs"
          onClick={onCancel}
        >
          Cancel
        </Button>
      </div>
    </form>
  );
}
