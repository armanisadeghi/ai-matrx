"use client";

import { useCallback, useState } from "react";
import { Plus, Check, Loader2, Sparkles, X } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import Link from "next/link";
import { useResearchTags, useSourceTags } from "../../hooks/useResearchState";
import { useResearchApi } from "../../hooks/useResearchApi";
import { useResearchStream } from "../../hooks/useResearchStream";
import { assignTagsToSource, removeSourceTag, createTag } from "../../service";
import type { ResearchDataEvent } from "../../types";

interface Suggestion {
  name: string;
  confidence: number;
  reason: string;
}

/** Normalize the `suggest_tags_complete` result into typed suggestions. The
 * backend returns `[{name, confidence, reason}]` under `result.suggestions`. */
function parseSuggestions(result: Record<string, unknown> | undefined): Suggestion[] {
  const raw = Array.isArray(result?.suggestions)
    ? (result!.suggestions as unknown[])
    : Array.isArray(result)
      ? (result as unknown[])
      : [];
  const out: Suggestion[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const o = item as Record<string, unknown>;
    const name =
      typeof o.name === "string"
        ? o.name
        : typeof o.tag_name === "string"
          ? o.tag_name
          : null;
    if (!name || !name.trim()) continue;
    out.push({
      name: name.trim(),
      confidence: typeof o.confidence === "number" ? o.confidence : 0,
      reason: typeof o.reason === "string" ? o.reason : "",
    });
  }
  return out;
}

const pct = (c: number): string =>
  c <= 0 ? "" : `${Math.round(c <= 1 ? c * 100 : c)}%`;

/**
 * Assign this source to the topic's tags (dimensions). Toggling a chip adds or
 * removes the source⇄tag link via `assignTagsToSource` / `removeSourceTag` —
 * the inputs a tag consolidation actually synthesizes over.
 *
 * The "Suggest tags" action runs the backend AutoTaggerAgent for this source
 * and surfaces accepted suggestions: clicking one creates the tag (if new) and
 * assigns it. This is the FE surface for the previously-dead `suggestTags` API.
 */
export function SourceTagPicker({
  topicId,
  sourceId,
}: {
  topicId: string;
  sourceId: string;
}) {
  const api = useResearchApi();
  const stream = useResearchStream();
  const { data: tags, refresh: refreshTags } = useResearchTags(topicId);
  const { data: sourceTags, refresh } = useSourceTags(sourceId);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [suggesting, setSuggesting] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [applyingName, setApplyingName] = useState<string | null>(null);

  const available = tags ?? [];
  const assignedIds = new Set((sourceTags ?? []).map((st) => st.tag_id));
  const assignedNames = new Set(
    available.filter((t) => assignedIds.has(t.id)).map((t) => t.name.toLowerCase()),
  );

  const toggle = async (tagId: string, on: boolean) => {
    setBusyId(tagId);
    try {
      if (on) {
        await removeSourceTag(sourceId, tagId);
      } else {
        await assignTagsToSource(sourceId, {
          tag_ids: [tagId],
          is_primary_source: false,
        });
      }
      refresh();
    } catch (err) {
      toast.error(
        `Couldn't ${on ? "remove" : "add"} tag: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    } finally {
      setBusyId(null);
    }
  };

  const handleSuggest = useCallback(async () => {
    if (suggesting) return;
    setSuggesting(true);
    setSuggestions([]);
    try {
      const response = await api.suggestTags(topicId, sourceId);
      stream.startStream(response, {
        onData: (payload: ResearchDataEvent) => {
          if (
            payload.type === "suggest_tags_complete" &&
            payload.source_id === sourceId
          ) {
            setSuggestions(parseSuggestions(payload.result));
          }
        },
        onEnd: () => setSuggesting(false),
        onError: (msg: string) => {
          toast.error(`Couldn't suggest tags: ${msg}`);
          setSuggesting(false);
        },
      });
    } catch (err) {
      toast.error(
        `Couldn't suggest tags: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
      setSuggesting(false);
    }
  }, [api, topicId, sourceId, stream, suggesting]);

  const acceptSuggestion = async (s: Suggestion) => {
    setApplyingName(s.name);
    try {
      const existing = available.find(
        (t) => t.name.toLowerCase() === s.name.toLowerCase(),
      );
      let tagId = existing?.id;
      if (!tagId) {
        const created = await createTag(topicId, {
          name: s.name,
          description: s.reason || null,
        });
        tagId = created.id;
        refreshTags();
      }
      await assignTagsToSource(sourceId, {
        tag_ids: [tagId],
        is_primary_source: false,
      });
      refresh();
      setSuggestions((prev) =>
        prev.filter((x) => x.name.toLowerCase() !== s.name.toLowerCase()),
      );
      toast.success(`Tagged with “${s.name}”`);
    } catch (err) {
      toast.error(
        `Couldn't apply tag: ${
          err instanceof Error ? err.message : "unknown error"
        }`,
      );
    } finally {
      setApplyingName(null);
    }
  };

  const dismissSuggestion = (name: string) =>
    setSuggestions((prev) =>
      prev.filter((x) => x.name.toLowerCase() !== name.toLowerCase()),
    );

  const visibleSuggestions = suggestions.filter(
    (s) => !assignedNames.has(s.name.toLowerCase()),
  );

  return (
    <div className="space-y-2.5">
      {available.length > 0 ? (
        <div className="flex flex-wrap gap-1.5">
          {available.map((tag) => {
            const on = assignedIds.has(tag.id);
            const isBusy = busyId === tag.id;
            return (
              <button
                key={tag.id}
                type="button"
                onClick={() => toggle(tag.id, on)}
                disabled={isBusy}
                aria-pressed={on}
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] font-medium transition-colors disabled:opacity-50 min-h-[28px]",
                  on
                    ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/15"
                    : "border-border/60 bg-muted/30 text-muted-foreground hover:bg-muted/60",
                )}
              >
                {isBusy ? (
                  <Loader2 className="h-2.5 w-2.5 animate-spin" />
                ) : on ? (
                  <Check className="h-2.5 w-2.5" />
                ) : (
                  <Plus className="h-2.5 w-2.5" />
                )}
                <span className="truncate max-w-[10rem]">{tag.name}</span>
              </button>
            );
          })}
        </div>
      ) : visibleSuggestions.length === 0 ? (
        <p className="text-[11px] text-muted-foreground leading-relaxed">
          No tags yet. Create tags on the{" "}
          <Link
            href={`/research/topics/${topicId}/tags`}
            className="text-primary hover:underline"
          >
            Tags page
          </Link>
          , assign sources here, or use{" "}
          <span className="text-foreground/70">Suggest tags</span> below.
        </p>
      ) : null}

      {/* AI-suggested tags — accept to create+assign, dismiss to drop */}
      {visibleSuggestions.length > 0 && (
        <div className="space-y-1.5">
          <span className="text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Suggested
          </span>
          <div className="flex flex-wrap gap-1.5">
            {visibleSuggestions.map((s) => {
              const applying = applyingName === s.name;
              return (
                <span
                  key={s.name}
                  className="inline-flex items-center gap-1 rounded-full border border-primary/30 bg-primary/[0.06] pl-1.5 pr-0.5 py-0.5 text-[11px]"
                >
                  <button
                    type="button"
                    onClick={() => acceptSuggestion(s)}
                    disabled={applying}
                    title={s.reason || `Add “${s.name}”`}
                    className="inline-flex items-center gap-1 text-primary disabled:opacity-50 min-h-[24px]"
                  >
                    {applying ? (
                      <Loader2 className="h-2.5 w-2.5 animate-spin" />
                    ) : (
                      <Sparkles className="h-2.5 w-2.5" />
                    )}
                    <span className="truncate max-w-[10rem] font-medium">
                      {s.name}
                    </span>
                    {pct(s.confidence) && (
                      <span className="text-[10px] text-muted-foreground tabular-nums">
                        {pct(s.confidence)}
                      </span>
                    )}
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissSuggestion(s.name)}
                    aria-label={`Dismiss ${s.name}`}
                    className="inline-flex items-center justify-center h-4 w-4 rounded-full text-muted-foreground hover:text-foreground hover:bg-muted/60"
                  >
                    <X className="h-2.5 w-2.5" />
                  </button>
                </span>
              );
            })}
          </div>
        </div>
      )}

      <button
        type="button"
        onClick={handleSuggest}
        disabled={suggesting}
        className="inline-flex items-center gap-1 text-[11px] font-medium text-primary hover:text-primary/80 disabled:opacity-50 transition-colors"
      >
        {suggesting ? (
          <Loader2 className="h-3 w-3 animate-spin" />
        ) : (
          <Sparkles className="h-3 w-3" />
        )}
        {suggesting ? "Suggesting…" : "Suggest tags"}
      </button>
    </div>
  );
}
