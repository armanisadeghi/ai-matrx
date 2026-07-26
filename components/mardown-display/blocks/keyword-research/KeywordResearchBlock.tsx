"use client";

/**
 * KeywordResearchBlock — renderer for the `keyword_relationship_research`
 * kind. Streaming-first: the bridge feeds partial serverData on every
 * envelope flush, so each relationship bucket card appears the moment its
 * label parses and every keyword chip pops in individually as it arrives.
 * A still-streaming bucket shows a subtle inline pulse; nothing ever waits
 * for the full payload.
 *
 * Consumes the bridge serverData from
 * features/content-ir/kinds/keyword-research.ts. Also rendered directly
 * (outside chat) by the keyword-research workbench's live feed.
 */

import {
  ArrowUpFromDot,
  GitFork,
  Link2,
  Loader2,
  SearchCheck,
  Tags,
  Waypoints,
} from "lucide-react";
import type { ReactNode } from "react";
import type {
  KeywordListData,
  KeywordRelationshipResearchData,
} from "@/features/content-ir/kinds/keyword-research";

export interface KeywordResearchBlockProps {
  serverData?: unknown;
}

function isList(value: unknown): value is KeywordListData {
  return (
    typeof value === "object" &&
    value !== null &&
    Array.isArray((value as KeywordListData).keywords)
  );
}

export function readKeywordResearchData(
  serverData: unknown,
): KeywordRelationshipResearchData | null {
  if (typeof serverData !== "object" || serverData === null) return null;
  const candidate = serverData as Partial<KeywordRelationshipResearchData>;
  if (!Array.isArray(candidate.lists)) return null;
  return {
    primaryKeyword:
      typeof candidate.primaryKeyword === "string"
        ? candidate.primaryKeyword
        : null,
    lists: candidate.lists.filter(isList),
    isComplete: candidate.isComplete === true,
  };
}

/** Bucket label → icon element; loose contains-matching so agent phrasing can vary. */
function listIcon(label: string | null): ReactNode {
  const className = "h-3.5 w-3.5 text-primary";
  const lower = (label ?? "").toLowerCase();
  if (lower.includes("parent")) return <ArrowUpFromDot className={className} />;
  if (lower.includes("child")) return <GitFork className={className} />;
  if (lower.includes("lsi") || lower.includes("semantic")) {
    return <Waypoints className={className} />;
  }
  if (lower.includes("related")) return <Link2 className={className} />;
  return <Tags className={className} />;
}

function KeywordListCard({ list }: { list: KeywordListData }) {
  return (
    <div className="rounded-lg border border-border bg-card p-3">
      <div className="mb-2 flex items-center gap-2">
        {listIcon(list.label)}
        <span className="text-xs font-semibold uppercase tracking-wide text-foreground">
          {list.label ?? "Keywords"}
        </span>
        <span className="rounded-full bg-muted px-1.5 py-0.5 text-[10px] tabular-nums text-muted-foreground">
          {list.keywords.length}
        </span>
        {!list.complete && (
          <Loader2 className="ml-auto h-3 w-3 animate-spin text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-wrap gap-1.5">
        {list.keywords.map((keyword, index) => (
          <span
            key={`${index}-${keyword}`}
            className="animate-in fade-in rounded-full border border-border bg-background px-2 py-0.5 text-xs text-foreground"
          >
            {keyword}
          </span>
        ))}
        {list.keywords.length === 0 && (
          <span className="text-xs text-muted-foreground">Collecting…</span>
        )}
      </div>
    </div>
  );
}

export default function KeywordResearchBlock({
  serverData,
}: KeywordResearchBlockProps) {
  const data = readKeywordResearchData(serverData);
  if (!data) return null;

  return (
    <div className="my-2 space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <SearchCheck className="h-4 w-4 text-primary" />
        <span className="text-sm font-semibold text-foreground">
          Keyword research
        </span>
        {data.primaryKeyword && (
          <span className="rounded-full border border-primary/40 px-2 py-0.5 text-xs font-medium text-foreground">
            {data.primaryKeyword}
          </span>
        )}
        {!data.isComplete && (
          <span className="inline-flex items-center gap-1 text-xs text-muted-foreground">
            <Loader2 className="h-3 w-3 animate-spin" />
            Mapping relationships
          </span>
        )}
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {data.lists.map((list, index) => (
          <KeywordListCard key={index} list={list} />
        ))}
      </div>
    </div>
  );
}
