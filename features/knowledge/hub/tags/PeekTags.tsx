"use client";

/**
 * The peek's Tags section. A result the search service sent carries its tags;
 * anything else (an Inbox row, a favorite) reads them live, so a tag just
 * added shows at once instead of "No tags yet".
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { actionTarget } from "@/features/knowledge/hub/hubActions";
import { TagChips } from "./TagChips";
import { hitTags } from "./tagActions";
import { listItemTags } from "./tagApi";

export function PeekTags({
  hit,
  live,
  onFilter,
}: {
  hit: KnowledgeHit;
  /** Read from the database instead of the hit (sample data: false). */
  live: boolean;
  onFilter: (name: string) => void;
}) {
  const target = actionTarget(hit);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; tags: string[]; error?: string }>({
    status: "loading",
    tags: [],
  });
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    listItemTags(target.entity, target.id)
      .then((tags) => !cancelled && setState({ status: "ready", tags }))
      .catch((err: unknown) =>
        !cancelled && setState({ status: "error", tags: [], error: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [live, target.entity, target.id]);
  const tags = live ? [...new Set([...state.tags, ...hitTags(hit)])] : hitTags(hit);
  return (
    <section>
      <h3 className="pb-1.5 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">Tags</h3>
      {live && state.status === "error" ? (
        <p className="text-xs text-destructive">
          {state.error}
          <ErrorAlchemyMenu error={state.error} size="xs" />
        </p>
      ) : live && state.status === "loading" && !tags.length ? (
        <p className="text-xs text-muted-foreground">Reading its tags…</p>
      ) : tags.length ? (
        <TagChips tags={tags} onFilter={onFilter} max={20} />
      ) : (
        <p className="text-xs text-muted-foreground">
          No tags yet. Press t to tag it; typing #name in the search box finds everything with that tag.
        </p>
      )}
    </section>
  );
}
