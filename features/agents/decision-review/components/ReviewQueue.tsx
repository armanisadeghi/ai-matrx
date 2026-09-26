"use client";

/**
 * ReviewQueue — people give the true answer to an agent's decision answers,
 * lowest confidence first, from the keyboard.
 *
 * Champion: Braintrust / LangSmith annotation queues — a list, the item under
 * review with everything the model saw, one keystroke per label, and the next
 * item already loaded. Labels land in platform.judge_verdict through the
 * ledger's agreement writer; the calibration view reads them.
 */

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { AlertTriangle, Check, ChevronLeft, ChevronRight, LineChart, X } from "lucide-react";
import {
  Button,
  SegmentedControl,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Skeleton,
} from "@ai-matrx/design-system";
import { cn } from "@/lib/utils";
import { DecisionAnswers } from "@/features/agents/decision-answers/DecisionAnswers";
import { METHOD_LABELS, type DecisionMethod } from "@/features/agents/decision-answers/read";
import {
  calibrationHref,
  DEFAULT_FILTERS,
  labelItem,
  loadFacets,
  loadJudgedState,
  loadQueue,
  type JudgedState,
  type QueueFacets,
  type QueueFilters,
} from "../service";
import { optionLabel, queueKeyAction, type ReviewItem } from "../queue";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

const ALL = "__all__";

function percent(value: number | null): string {
  return value == null ? "—" : `${Math.round(value * 100)}%`;
}

function FilterSelect({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value: string | null;
  options: { value: string; label: string }[];
  onChange: (value: string | null) => void;
}) {
  return (
    <Select value={value ?? ALL} onValueChange={(v) => onChange(v === ALL ? null : v)}>
      <SelectTrigger className="h-7 w-auto min-w-[7rem] text-xs" aria-label={label}>
        <SelectValue placeholder={label} />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={ALL}>{`All ${label.toLowerCase()}s`}</SelectItem>
        {options.map((o) => (
          <SelectItem key={o.value} value={o.value}>
            {o.label}
          </SelectItem>
        ))}
      </SelectContent>
    </Select>
  );
}

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="rounded border border-border bg-muted px-1 font-mono text-[10px] text-muted-foreground">
      {children}
    </kbd>
  );
}

function QueueRow({
  item,
  selected,
  onSelect,
}: {
  item: ReviewItem;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      data-selected={selected ? "true" : undefined}
      className={cn(
        "grid w-full grid-cols-[1fr_auto] items-center gap-x-2 border-b border-border/60 px-3 py-1.5 text-left text-xs",
        selected ? "bg-accent" : "hover:bg-muted/60",
      )}
    >
      <span className="flex min-w-0 items-baseline gap-2">
        <span className="shrink-0 font-mono text-[10px] text-muted-foreground">{item.question}</span>
        <span className="truncate font-medium">{optionLabel(item, item.verdict)}</span>
      </span>
      <span className="flex items-center gap-1.5">
        {item.label != null &&
          (item.agreed ? (
            <Check className="h-3 w-3 text-emerald-500" aria-label="Human agreed" />
          ) : (
            <X className="h-3 w-3 text-destructive" aria-label="Human disagreed" />
          ))}
        <span
          className={cn(
            "w-9 text-right font-mono text-[11px]",
            (item.confidence ?? 0) < 0.5 ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground",
          )}
        >
          {percent(item.confidence)}
        </span>
      </span>
      <span className="col-span-2 truncate font-mono text-[10px] text-muted-foreground">
        v{item.version} · {item.model ?? "model not recorded"}
        {item.method ? ` · ${METHOD_LABELS[item.method]}` : ""}
      </span>
    </button>
  );
}

export function ReviewQueue({ agentId }: { agentId: string }) {
  const [filters, setFilters] = useState<QueueFilters>(DEFAULT_FILTERS);
  const [items, setItems] = useState<ReviewItem[] | null>(null);
  const [facets, setFacets] = useState<QueueFacets | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // Phones get list OR detail (the iOS list→detail pattern); from md up both
  // panes show side by side. A 22rem list beside the detail left the detail
  // one letter wide at 375px.
  const [phoneDetail, setPhoneDetail] = useState(false);
  const [state, setState] = useState<JudgedState | null>(null);
  const [saving, setSaving] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    setItems(null);
    Promise.all([loadQueue(agentId, filters), loadFacets(agentId)])
      .then(([queue, facetRows]) => {
        if (cancelled) return;
        setItems(queue);
        setFacets(facetRows);
        setSelectedId((current) =>
          current && queue.some((i) => i.id === current) ? current : (queue[0]?.id ?? null),
        );
      })
      .catch((err: unknown) => {
        console.error("[decision-review] queue load failed", err);
        if (!cancelled) {
          setItems([]);
          setError("The answers could not be loaded. Reload the page to try again.");
        }
      });
    return () => {
      cancelled = true;
    };
  }, [agentId, filters, reloadKey]);

  const selectedIndex = items?.findIndex((i) => i.id === selectedId) ?? -1;
  const selected = selectedIndex >= 0 && items ? items[selectedIndex] : null;

  useEffect(() => {
    if (!selected) {
      setState(null);
      return;
    }
    let cancelled = false;
    setState(null);
    loadJudgedState(selected)
      .then((s) => {
        if (!cancelled) setState(s);
      })
      .catch((err: unknown) => {
        console.error("[decision-review] state load failed", err);
        if (!cancelled) setState({ parts: [], visible: false });
      });
    return () => {
      cancelled = true;
    };
  }, [selected]);

  const move = (delta: number) => {
    if (!items || items.length === 0) return;
    const next = Math.min(items.length - 1, Math.max(0, selectedIndex + delta));
    setSelectedId(items[next].id);
    listRef.current
      ?.querySelector(`[data-row-index="${next}"]`)
      ?.scrollIntoView({ block: "nearest" });
  };

  const applyLabel = async (item: ReviewItem, key: string) => {
    setSaving(key);
    setError(null);
    try {
      const saved = await labelItem(item, key);
      setItems((current) => {
        if (!current) return current;
        const updated = current.map((i) =>
          i.id === item.id ? { ...i, label: saved.authority_verdict, agreed: saved.agreed } : i,
        );
        if (filters.status !== "unlabeled") return updated;
        // In the to-label view a labeled item leaves the list; the next one takes its place.
        const index = updated.findIndex((i) => i.id === item.id);
        const remaining = updated.filter((i) => i.id !== item.id);
        setSelectedId(remaining[Math.min(index, remaining.length - 1)]?.id ?? null);
        return remaining;
      });
      setFacets((f) => (f && item.label == null ? { ...f, labeled: f.labeled + 1 } : f));
      if (filters.status !== "unlabeled") move(1);
    } catch (err) {
      console.error("[decision-review] label failed", err);
      setError(err instanceof Error ? err.message : "That label was not saved.");
    } finally {
      setSaving(null);
    }
  };

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null;
      if (
        event.metaKey ||
        event.ctrlKey ||
        event.altKey ||
        target?.closest("input, textarea, select, [contenteditable='true'], [role='combobox'], [role='listbox']")
      ) {
        return;
      }
      const action = queueKeyAction(selected, event.key);
      if (!action) return;
      event.preventDefault();
      if (action.type === "next" || action.type === "skip") move(1);
      else if (action.type === "previous") move(-1);
      else if (selected && !saving) void applyLabel(selected, action.key);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const setFilter = <K extends keyof QueueFilters>(key: K, value: QueueFilters[K]) =>
    setFilters((f) => ({ ...f, [key]: value }));

  return (
    <div className="flex h-full min-h-0 flex-col pt-[var(--shell-header-h)]">
      {/* One row of controls. */}
      <div className="flex flex-wrap items-center gap-2 border-b border-border px-3 py-2">
        <SegmentedControl
          size="sm"
          value={filters.status}
          onValueChange={(v) => setFilter("status", v as QueueFilters["status"])}
          data={[
            { value: "unlabeled", label: "To label" },
            { value: "labeled", label: "Labeled" },
            { value: "all", label: "All" },
          ]}
        />
        <FilterSelect
          label="Question"
          value={filters.question}
          options={(facets?.questions ?? []).map((q) => ({ value: q, label: q }))}
          onChange={(v) => setFilter("question", v)}
        />
        <FilterSelect
          label="Method"
          value={filters.method}
          options={(facets?.methods ?? []).map((m) => ({
            value: m,
            label: METHOD_LABELS[m as DecisionMethod] ?? m,
          }))}
          onChange={(v) => setFilter("method", v)}
        />
        <FilterSelect
          label="Model"
          value={filters.model}
          options={(facets?.models ?? []).map((m) => ({ value: m, label: m }))}
          onChange={(v) => setFilter("model", v)}
        />
        <FilterSelect
          label="Version"
          value={filters.version == null ? null : String(filters.version)}
          options={(facets?.versions ?? []).map((v) => ({ value: String(v), label: `v${v}` }))}
          onChange={(v) => setFilter("version", v == null ? null : Number(v))}
        />
        <span className="ml-auto font-mono text-[11px] text-muted-foreground">
          {facets ? `${facets.labeled} / ${facets.total} labeled` : ""}
        </span>
        <Button asChild size="sm" variant="outline" className="h-7 gap-1.5 text-xs">
          <Link href={calibrationHref(agentId)}>
            <LineChart className="h-3.5 w-3.5" />
            Calibration
          </Link>
        </Button>
      </div>

      {error && (
        <p className="flex items-start gap-1.5 border-b border-destructive/40 bg-destructive/10 px-3 py-1.5 text-xs text-destructive">
          <AlertTriangle className="mt-px h-3.5 w-3.5 shrink-0" />
          <span className="flex-1">{error}</span>
          <button type="button" className="underline" onClick={() => { setError(null); setReloadKey((k) => k + 1); }}>
            Reload
          </button>
          <ErrorAlchemyMenu error={error} />
        </p>
      )}

      <div className="flex min-h-0 flex-1">
        {/* The list. */}
        <div
          ref={listRef}
          className={cn(
            "w-full shrink-0 overflow-y-auto border-border md:block md:w-[22rem] md:border-r",
            phoneDetail && "hidden",
          )}
        >
          {items == null ? (
            <div className="flex flex-col gap-1 p-2">
              {Array.from({ length: 8 }, (_, i) => (
                <Skeleton key={i} className="h-9 w-full" />
              ))}
            </div>
          ) : items.length === 0 ? (
            <p className="p-4 text-xs text-muted-foreground">
              {filters.status === "unlabeled"
                ? "Nothing left to label with these filters."
                : "No answers match these filters."}
            </p>
          ) : (
            items.map((item, index) => (
              <div key={item.id} data-row-index={index}>
                <QueueRow
                  item={item}
                  selected={item.id === selectedId}
                  onSelect={() => {
                    setSelectedId(item.id);
                    setPhoneDetail(true);
                  }}
                />
              </div>
            ))
          )}
        </div>

        {/* The item under review. */}
        <div
          className={cn(
            "min-w-0 flex-1 overflow-y-auto md:block",
            !phoneDetail && "hidden",
          )}
        >
          {selected ? (
            <div className="mx-auto flex max-w-3xl flex-col gap-3 p-4">
              <button
                type="button"
                onClick={() => setPhoneDetail(false)}
                className="-ml-1 inline-flex h-8 items-center gap-1 self-start rounded px-1 text-xs text-muted-foreground hover:text-foreground md:hidden"
              >
                <ChevronLeft className="h-4 w-4" />
                All answers
              </button>
              <div className="flex items-baseline gap-2">
                <span className="text-sm font-medium">{selected.instructions ?? "Question text not recorded"}</span>
                <span className="font-mono text-[11px] text-muted-foreground">{selected.question}</span>
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {selectedIndex + 1} / {items?.length ?? 0}
                </span>
              </div>

              <section className="rounded-lg border border-border bg-card">
                <div className="flex items-center gap-2 border-b border-border px-3 py-1.5 text-[11px] font-medium text-muted-foreground">
                  What the model judged
                  {selected.workflowRunId && (
                    <Link
                      href={`/workflows/runs/${selected.workflowRunId}`}
                      className="ml-auto font-normal text-primary hover:underline"
                    >
                      Workflow run{selected.workflowNodeId ? ` · step ${selected.workflowNodeId}` : ""}
                    </Link>
                  )}
                </div>
                <div className="max-h-[40vh] overflow-y-auto whitespace-pre-wrap px-3 py-2 text-xs leading-relaxed">
                  {state == null ? (
                    <Skeleton className="h-16 w-full" />
                  ) : !state.visible ? (
                    <span className="text-muted-foreground">
                      This run is in a conversation you cannot open, so only its answer is shown.
                    </span>
                  ) : state.parts.length === 0 ? (
                    <span className="text-muted-foreground">The turn carried no text.</span>
                  ) : (
                    state.parts.join("\n\n")
                  )}
                </div>
              </section>

              {selected.view && (
                <DecisionAnswers
                  view={selected.view}
                  instructions={selected.instructions ? { [selected.question]: selected.instructions } : undefined}
                  showInstructions={false}
                />
              )}

              <section className="flex flex-col gap-2">
                <div className="flex items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="font-medium text-foreground">True answer</span>
                  {selected.label != null && (
                    <span>
                      labeled {optionLabel(selected, selected.label)}
                      {selected.agreed ? " — agrees" : " — disagrees"}
                    </span>
                  )}
                  <span className="ml-auto flex items-center gap-1">
                    <Kbd>j</Kbd>
                    <Kbd>k</Kbd> move · <Kbd>s</Kbd> skip
                  </span>
                </div>
                <div className="flex flex-wrap gap-1.5">
                  {selected.options.map((option, index) => {
                    const isModel = option.key === selected.verdict;
                    const isLabel = option.key === selected.label;
                    return (
                      <Button
                        key={option.key}
                        size="sm"
                        variant={isLabel ? "default" : "outline"}
                        disabled={saving != null}
                        onClick={() => void applyLabel(selected, option.key)}
                        className="h-8 gap-2 text-xs"
                        title={isModel ? "The model's answer" : undefined}
                      >
                        {index < 9 && <Kbd>{index + 1}</Kbd>}
                        <span>{selected.answerType === "choice" ? option.key : optionLabel(selected, option.key)}</span>
                        {selected.answerType === "choice" && option.label !== option.key && (
                          <span className="max-w-[14rem] truncate text-[10px] text-muted-foreground">{option.label}</span>
                        )}
                        {isModel && <span className="text-[10px] text-muted-foreground">model</span>}
                      </Button>
                    );
                  })}
                  <Button size="sm" variant="ghost" className="h-8 gap-1 text-xs" onClick={() => move(1)}>
                    Skip
                    <ChevronRight className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {selected.options.length === 0 && (
                  <p className="text-xs text-amber-600 dark:text-amber-400">
                    This answer has no recorded options, so it cannot be labeled here.
                  </p>
                )}
              </section>
            </div>
          ) : (
            items != null && (
              <div className="p-6 text-xs text-muted-foreground">Select an answer to review it.</div>
            )
          )}
        </div>
      </div>
    </div>
  );
}
