"use client";

/**
 * The peek's Tags section — the record's own tags, read live (so a tag just
 * added shows at once), each chip filtering the hub by it and carrying an ×
 * that takes the tag off this item (with Undo). Sample data shows the hit's
 * own tags, read-only.
 */

import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";
import { useEffect, useState } from "react";
import type { KnowledgeHit } from "@/features/knowledge/api/knowledgeSearch";
import { actionTarget } from "@/features/knowledge/hub/hubActions";
import { associationsService } from "@/features/scopes/service/associationsService";
import { toast } from "@/lib/toast";
import { TagChips } from "./TagChips";
import { hitTags } from "./tagActions";
import { listTagsForItems, type ItemTagRef } from "./tagApi";

export function PeekTags({
  hit,
  live,
  onFilter,
  onChanged,
}: {
  hit: KnowledgeHit;
  /** Read from the database instead of the hit (sample data: false). */
  live: boolean;
  onFilter: (name: string) => void;
  /** Told after a tag is removed or put back, so rows re-read theirs. */
  onChanged?: () => void;
}) {
  const target = actionTarget(hit);
  const [state, setState] = useState<{ status: "loading" | "ready" | "error"; tags: ItemTagRef[]; error?: string }>({
    status: "loading",
    tags: [],
  });
  const [nonce, setNonce] = useState(0);
  useEffect(() => {
    if (!live) return;
    let cancelled = false;
    listTagsForItems([{ entity: target.entity, id: target.id }])
      .then((m) => !cancelled && setState({ status: "ready", tags: m.get(`${target.entity}:${target.id}`) ?? [] }))
      .catch((err: unknown) =>
        !cancelled && setState({ status: "error", tags: [], error: err instanceof Error ? err.message : String(err) }),
      );
    return () => {
      cancelled = true;
    };
  }, [live, target.entity, target.id, nonce]);

  const link = { sourceType: target.entity, sourceId: target.id, targetType: "scope" };
  const remove = async (name: string) => {
    const ref = state.tags.find((t) => t.name === name);
    if (!ref) return;
    setState((s) => ({ ...s, tags: s.tags.filter((t) => t.scopeId !== ref.scopeId) }));
    const res = await associationsService.remove({ ...link, targetId: ref.scopeId });
    if ("error" in res && res.error) {
      toast.error(`#${name} was not removed: ${(res.error as { message?: string }).message ?? "the server refused."}`);
      setNonce((n) => n + 1);
      return;
    }
    onChanged?.();
    toast.success(`Removed #${name}.`, {
      action: {
        label: "Undo",
        onClick: () =>
          void associationsService
            .add({ ...link, targetId: ref.scopeId } as never)
            .then((r: unknown) => {
              const failed = r && typeof r === "object" && "error" in r && (r as { error?: unknown }).error;
              if (failed) toast.error(`#${name} was not put back.`);
              else toast.success(`Put #${name} back.`);
              setNonce((n) => n + 1);
              onChanged?.();
            }),
      },
    });
  };

  const tags = live ? state.tags.map((t) => t.name) : hitTags(hit);
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
        <TagChips tags={tags} onFilter={onFilter} onRemove={live ? (n) => void remove(n) : undefined} max={20} />
      ) : (
        <p className="text-xs text-muted-foreground">No tags</p>
      )}
    </section>
  );
}
