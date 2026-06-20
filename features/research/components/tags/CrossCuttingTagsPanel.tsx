"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Sparkles, Check, Network } from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { ProTextarea } from "@/components/official/ProTextarea";
import { cn } from "@/lib/utils";
import { useTopicContext } from "../../context/ResearchContext";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import type {
  CrossCuttingTagSuggestion,
  ResearchDataEvent,
} from "../../types";
import { CrossCuttingTagsExportButton } from "./CrossCuttingTagsExportButton";

interface CrossCuttingTagsPanelProps {
  /** Fired after suggestions are applied so the parent can refetch its tag list. */
  onTagsCreated?: () => void;
}

/** Integer percentage, never a decimal. */
function confidencePct(confidence: number): number {
  return Math.round(Math.max(0, Math.min(1, confidence)) * 100);
}

/** Small neutral chip for a spanned keyword. */
function KeywordChip({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/40 px-2 py-0.5 text-[10px] font-medium text-muted-foreground">
      {label}
    </span>
  );
}

/** A clean, muted confidence bar — number + track, never red. */
function ConfidenceMeter({ confidence }: { confidence: number }) {
  const pct = confidencePct(confidence);
  return (
    <div className="flex items-center gap-1.5 shrink-0" title={`${pct}% confidence`}>
      <div className="h-1.5 w-16 rounded-full bg-muted overflow-hidden">
        <div
          className="h-full rounded-full bg-primary/70"
          style={{ width: `${pct}%` }}
        />
      </div>
      <span className="text-[10px] font-medium tabular-nums text-muted-foreground w-8 text-right">
        {pct}%
      </span>
    </div>
  );
}

function SuggestionRow({
  suggestion,
  selected,
  onToggle,
}: {
  suggestion: CrossCuttingTagSuggestion;
  selected: boolean;
  onToggle: (name: string, next: boolean) => void;
}) {
  const created = suggestion.applied;
  return (
    <div
      className={cn(
        "flex items-start gap-3 rounded-xl border p-3 transition-colors",
        created
          ? "border-border/40 bg-muted/30"
          : "border-border/50 bg-card/60 backdrop-blur-sm hover:border-border",
      )}
    >
      <div className="pt-0.5">
        {created ? (
          <span
            className="inline-flex h-3.5 w-3.5 items-center justify-center rounded-xs bg-primary/15 text-primary"
            title="Already created"
          >
            <Check className="h-3 w-3" />
          </span>
        ) : (
          <Checkbox
            checked={selected}
            onCheckedChange={(v) => onToggle(suggestion.name, v === true)}
            aria-label={`Select ${suggestion.name}`}
          />
        )}
      </div>

      <div className="flex-1 min-w-0 space-y-1.5">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="text-sm font-medium text-foreground">
            {suggestion.name}
          </span>
          {created && (
            <span className="inline-flex items-center rounded-full border border-border/60 bg-muted/50 px-1.5 py-px text-[9px] font-medium uppercase tracking-wide text-muted-foreground">
              Created
            </span>
          )}
          <span className="ml-auto">
            <ConfidenceMeter confidence={suggestion.confidence} />
          </span>
        </div>

        {suggestion.reason && (
          <p className="text-xs text-muted-foreground leading-snug">
            {suggestion.reason}
          </p>
        )}

        {suggestion.keywords_spanned.length > 0 && (
          <div className="flex flex-wrap items-center gap-1 pt-0.5">
            {suggestion.keywords_spanned.map((kw) => (
              <KeywordChip key={kw} label={kw} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

/**
 * Cross-cutting tags — discover tag dimensions that span several of the topic's
 * keywords, pick which to keep, and create them as real tags.
 *
 * Flow: suggest → pick → create. Suggestions persist on
 * `rs_topic.tag_suggestions`, so they survive a refresh (hydrated on load); a
 * fresh run re-streams them. An "Export search results" action lets the user run
 * the generator agent manually instead.
 */
export function CrossCuttingTagsPanel({
  onTagsCreated,
}: CrossCuttingTagsPanelProps) {
  const { topicId, topic, refresh } = useTopicContext();
  const api = useResearchApi();
  const stream = useResearchStream();

  const [userInput, setUserInput] = useState("");
  const [generating, setGenerating] = useState(false);
  const [applying, setApplying] = useState(false);
  const [suggestions, setSuggestions] = useState<CrossCuttingTagSuggestion[]>(
    [],
  );
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [hasRun, setHasRun] = useState(false);

  // Hydrate from the persisted bundle so suggestions survive a refresh. Only
  // until the user runs a fresh generation this session (which owns state).
  useEffect(() => {
    if (hasRun) return;
    const persisted = topic?.tag_suggestions?.tags;
    if (persisted && persisted.length > 0) {
      setSuggestions(persisted);
    }
  }, [topic?.tag_suggestions, hasRun]);

  const pending = useMemo(
    () => suggestions.filter((s) => !s.applied),
    [suggestions],
  );
  const selectedCount = selected.size;

  const toggle = useCallback((name: string, next: boolean) => {
    setSelected((prev) => {
      const copy = new Set(prev);
      if (next) copy.add(name);
      else copy.delete(name);
      return copy;
    });
  }, []);

  const toggleAll = useCallback(() => {
    setSelected((prev) => {
      if (prev.size === pending.length) return new Set();
      return new Set(pending.map((s) => s.name));
    });
  }, [pending]);

  const generate = useCallback(async () => {
    if (generating) return;
    setGenerating(true);
    setHasRun(true);
    setSelected(new Set());
    const toastId = toast.loading("Discovering cross-cutting tags…");
    try {
      const response = await api.generateTagSuggestions(topicId, {
        user_input: userInput.trim() || null,
      });
      await stream.startStream(response, {
        onData: (e: ResearchDataEvent) => {
          if (e.type === "tag_suggestions_complete") {
            setSuggestions(e.tags);
            toast.success(
              e.tags.length > 0
                ? `Found ${e.tags.length} cross-cutting ${e.tags.length === 1 ? "dimension" : "dimensions"}`
                : "No cross-cutting dimensions found",
              { id: toastId },
            );
          }
        },
        onError: (msg) =>
          toast.error(`Discovery failed: ${msg}`, { id: toastId }),
        onEnd: () => {
          // Refresh the topic so the persisted bundle (and `applied` flags) sync.
          refresh();
        },
      });
    } catch (err) {
      toast.error(
        `Discovery failed: ${err instanceof Error ? err.message : "unknown error"}`,
        { id: toastId },
      );
    } finally {
      setGenerating(false);
    }
  }, [generating, api, topicId, userInput, stream, refresh]);

  const createSelected = useCallback(async () => {
    if (applying || selectedCount === 0) return;
    setApplying(true);
    try {
      const picked_names = Array.from(selected);
      const result = await api.applyTagSuggestions(topicId, { picked_names });
      toast.success(
        `Created ${result.created} ${result.created === 1 ? "dimension" : "dimensions"}`,
        {
          description:
            result.assignments > 0
              ? `${result.assignments} source assignments written.`
              : undefined,
        },
      );
      setSelected(new Set());
      // Refetch tags (parent) and the topic so `applied` flags flip to created.
      onTagsCreated?.();
      await refresh();
    } catch (err) {
      toast.error(
        `Create failed: ${err instanceof Error ? err.message : "unknown error"}`,
      );
    } finally {
      setApplying(false);
    }
  }, [applying, selectedCount, selected, api, topicId, onTagsCreated, refresh]);

  const busy = generating || applying;
  const showEmptyHint = hasRun && !generating && suggestions.length === 0;

  return (
    <div className="rounded-2xl border border-border/50 bg-card/40 backdrop-blur-sm p-3 sm:p-4 space-y-3">
      {/* Header */}
      <div className="flex items-start gap-2.5">
        <div className="h-8 w-8 rounded-lg bg-primary/8 flex items-center justify-center shrink-0">
          <Network className="h-4 w-4 text-primary/70" />
        </div>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-foreground">
            Cross-cutting tags
          </h3>
          <p className="text-[11px] text-muted-foreground leading-snug mt-0.5">
            Discover tag dimensions that span several keywords, then pick which to
            create.
          </p>
        </div>
        <CrossCuttingTagsExportButton
          topicId={topicId}
          topicName={topic?.name ?? null}
        />
      </div>

      {/* Guidance + generate */}
      <div className="space-y-2">
        <ProTextarea
          value={userInput}
          onChange={(e) => setUserInput(e.target.value)}
          placeholder="Add guidance for the model (optional)"
          autoGrow
          minHeight={44}
          maxHeight={120}
          disabled={busy}
          className="text-xs rounded-lg"
          wrapperClassName="w-full"
        />
        <div className="flex items-center justify-between gap-2">
          <Button
            variant="outline"
            size="sm"
            disabled={busy}
            onClick={generate}
            className="gap-1.5 text-xs"
          >
            {generating ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <Sparkles className="h-3.5 w-3.5 text-primary" />
            )}
            {generating
              ? "Discovering…"
              : suggestions.length > 0
                ? "Discover again"
                : "Discover cross-cutting tags"}
          </Button>
          {topic?.tag_suggestions?.generated_at && !generating && (
            <span className="text-[10px] text-muted-foreground">
              Last run{" "}
              {new Date(topic.tag_suggestions.generated_at).toLocaleDateString()}
            </span>
          )}
        </div>
      </div>

      {/* Streaming progress */}
      {generating && (
        <div className="flex items-center gap-2 rounded-lg border border-border/40 bg-muted/30 px-3 py-2 text-xs text-muted-foreground">
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
          Reading keywords and search results…
        </div>
      )}

      {/* Empty result */}
      {showEmptyHint && (
        <p className="text-xs text-muted-foreground px-1 py-2">
          No cross-cutting dimensions surfaced. Try adding guidance above, or run
          a search first so there are results to analyze.
        </p>
      )}

      {/* Suggestions */}
      {suggestions.length > 0 && (
        <div className="space-y-2">
          {pending.length > 0 && (
            <div className="flex items-center justify-between gap-2 px-0.5">
              <button
                onClick={toggleAll}
                disabled={busy}
                className="text-[11px] font-medium text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40"
              >
                {selected.size === pending.length
                  ? "Clear selection"
                  : "Select all"}
              </button>
              <span className="text-[10px] text-muted-foreground tabular-nums">
                {selectedCount} of {pending.length} selected
              </span>
            </div>
          )}

          <div className="space-y-1.5">
            {suggestions.map((s) => (
              <SuggestionRow
                key={s.name}
                suggestion={s}
                selected={selected.has(s.name)}
                onToggle={toggle}
              />
            ))}
          </div>

          <div className="flex justify-end pt-0.5">
            <Button
              size="sm"
              disabled={busy || selectedCount === 0}
              onClick={createSelected}
              className="gap-1.5 text-xs"
            >
              {applying ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <Check className="h-3.5 w-3.5" />
              )}
              Create selected{selectedCount > 0 ? ` (${selectedCount})` : ""}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}
