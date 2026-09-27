"use client";

// features/education/study/analytics/components/TopicMasteryList.tsx
//
// The ONE per-topic section of the progress dashboard. It replaced two cards
// that said the same thing ("Highest-leverage fixes" = the first five rows of
// "By topic"): one list, sorted weakest-first by default, searchable and
// re-sortable, collapsed past COLLAPSED_ROWS, each row opening practice of
// that topic. Topics exist only on flashcards today (the study spine has no
// topic column), so the section says "Flashcard topics" — honest next to the
// cross-mode numbers above it.
//
// React Compiler is on: no manual memo.

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { Flame, Tags } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import { SearchInput } from "@/components/official/SearchInput";
import { CopyButtons } from "@/components/agent-copy/CopyButtons";
import { cn } from "@/lib/utils";
import { topicLabel } from "../../utils/topicLabel";
import type { TopicStat } from "../computeAnalytics";

const COLLAPSED_ROWS = 8;
const SEARCH_FROM = 9;

type SortKey = "weakest" | "strongest" | "name";

export function sortTopics(topics: TopicStat[], sort: SortKey): TopicStat[] {
  const out = [...topics];
  if (sort === "name") {
    out.sort((a, b) => topicLabel(a.topic).localeCompare(topicLabel(b.topic)));
  } else if (sort === "strongest") {
    out.sort((a, b) => b.masteryPct - a.masteryPct);
  } else {
    // Weakest first; among equals, the one with more struggling cards first.
    out.sort(
      (a, b) => a.masteryPct - b.masteryPct || b.struggling - a.struggling,
    );
  }
  return out;
}

export function TopicMasteryList({
  topics,
  hrefFor,
  weakDrillHref,
  kpis,
}: {
  topics: TopicStat[];
  /** Where a topic row opens; omit for read-only (guardian) views. */
  hrefFor?: (topic: string) => string;
  /** The all-topics weak drill; omit to hide the button. */
  weakDrillHref?: string;
  /** The page's headline numbers, carried on the copy payload. */
  kpis: Record<string, string | number | boolean | null | undefined>;
}) {
  const router = useRouter();
  const [sort, setSort] = useState<SortKey>("weakest");
  const [query, setQuery] = useState("");
  const [expanded, setExpanded] = useState(false);

  const needle = query.trim().toLowerCase();
  const filtered = sortTopics(topics, sort).filter(
    (t) =>
      !needle ||
      topicLabel(t.topic).toLowerCase().includes(needle) ||
      t.topic.toLowerCase().includes(needle),
  );
  const shown = expanded || needle ? filtered : filtered.slice(0, COLLAPSED_ROWS);
  const needWork = topics.filter((t) => t.struggling > 0).length;

  const rows = () =>
    sortTopics(topics, "weakest").map((t) => ({
      topic: topicLabel(t.topic),
      raw_topic: t.topic,
      mastery_pct: t.masteryPct,
      cards: t.count,
      needs_work: t.struggling,
    }));
  const asText = () =>
    [
      `Flashcard topics — mastery, weakest first (${needWork} of ${topics.length} need work)`,
      ...rows().map(
        (t) =>
          `${t.topic}: ${t.mastery_pct}% mastery · ${t.cards} card${t.cards === 1 ? "" : "s"}${t.needs_work ? ` · ${t.needs_work} need work` : ""}`,
      ),
    ].join("\n");

  return (
    <section className="rounded-xl border border-border bg-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex min-w-0 items-center gap-2">
          <Tags className="h-4 w-4 shrink-0 text-muted-foreground" />
          <h2 className="truncate text-sm font-medium text-foreground">
            Flashcard topics
          </h2>
          <span className="shrink-0 text-xs tabular-nums text-muted-foreground">
            {needWork > 0 ? `${needWork} of ${topics.length} need work` : topics.length}
          </span>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <CopyButtons
            size="xs"
            label="Flashcard topics"
            human={asText}
            agent={() => ({
              kind: "study-topic-mastery",
              location: "Study progress › Flashcard topics",
              description:
                "Average mastery per flashcard topic, weakest first — every topic, not only the rows on screen.",
              data: rows(),
              summary: asText(),
              attributes: { ...kpis, topics: topics.length, need_work: needWork },
            })}
          />
          {weakDrillHref && needWork > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5 px-2 text-xs"
              onClick={() => router.push(weakDrillHref)}
            >
              <Flame className="h-3.5 w-3.5 text-red-500" />
              Drill weak areas
            </Button>
          )}
        </div>
      </div>

      <div className="mb-2 flex flex-wrap items-center gap-2">
        {topics.length >= SEARCH_FROM && (
          <SearchInput
            value={query}
            onValueChange={setQuery}
            placeholder="Find a topic"
            debounceTime={0}
            className="min-w-0 flex-1 basis-40"
          />
        )}
        <ToggleGroup
          type="single"
          size="sm"
          value={sort}
          onValueChange={(v) => v && setSort(v as SortKey)}
          aria-label="Sort topics"
        >
          <ToggleGroupItem value="weakest" className="h-7 px-2 text-xs">
            Weakest
          </ToggleGroupItem>
          <ToggleGroupItem value="strongest" className="h-7 px-2 text-xs">
            Strongest
          </ToggleGroupItem>
          <ToggleGroupItem value="name" className="h-7 px-2 text-xs">
            A–Z
          </ToggleGroupItem>
        </ToggleGroup>
      </div>

      {shown.length === 0 ? (
        <p className="py-3 text-center text-xs text-muted-foreground">
          No topic matches &ldquo;{query}&rdquo;.
        </p>
      ) : (
        <ul className="flex flex-col">
          {shown.map((t) => {
            const name = topicLabel(t.topic);
            const href = hrefFor?.(t.topic);
            const body = (
              <>
                <span className="min-w-0 text-sm leading-snug text-foreground sm:w-48 sm:shrink-0 sm:text-xs">
                  {name}
                </span>
                <span className="flex min-w-0 flex-1 items-center gap-3">
                  <span className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                    {t.masteryPct > 0 && (
                      <span
                        className={cn(
                          "block h-full rounded-full",
                          t.masteryPct >= 80
                            ? "bg-green-500"
                            : t.masteryPct >= 40
                              ? "bg-amber-500"
                              : "bg-red-500",
                        )}
                        style={{ width: `${t.masteryPct}%` }}
                      />
                    )}
                  </span>
                  <span className="w-9 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {t.masteryPct > 0 ? `${t.masteryPct}%` : "None"}
                  </span>
                  <span className="w-14 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {t.count} card{t.count === 1 ? "" : "s"}
                  </span>
                </span>
              </>
            );
            const rowClass =
              "flex flex-col gap-1 py-1.5 sm:flex-row sm:items-center sm:gap-3";
            return (
              <li key={t.topic} className="border-b border-border/50 last:border-0">
                {href ? (
                  <Link
                    href={href}
                    title={`Practice ${name}`}
                    className={cn(rowClass, "-mx-1.5 rounded-md px-1.5 hover:bg-muted/60")}
                  >
                    {body}
                  </Link>
                ) : (
                  <div className={rowClass}>{body}</div>
                )}
              </li>
            );
          })}
        </ul>
      )}

      {!needle && filtered.length > COLLAPSED_ROWS && (
        <Button
          size="sm"
          variant="ghost"
          className="mt-1 h-8 w-full text-xs text-muted-foreground"
          onClick={() => setExpanded((e) => !e)}
        >
          {expanded ? "Show fewer" : `Show all ${filtered.length} topics`}
        </Button>
      )}
    </section>
  );
}
