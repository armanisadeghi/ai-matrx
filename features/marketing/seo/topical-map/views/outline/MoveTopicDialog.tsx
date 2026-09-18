"use client";

/**
 * views/outline/MoveTopicDialog.tsx — "Move to another parent" without a
 * drag: pick the new parent from a searchable list (`seo.search_map_topics`)
 * or "Top level", and the same `useMoveMapTopic` write the drag uses runs.
 *
 * THE TOPIC AND ITS DESCENDANTS ARE NOT OFFERED. Hanging a branch under its
 * own child is a cycle the server would refuse; the tree's own drag refuses
 * it before the call (`useTopicTreeDnd`), and this dialog does the same from
 * the loaded tree so both doors behave alike. The server stays the authority
 * for everything the loaded rows cannot see.
 *
 * A refusal renders INSIDE the dialog through `TopicalMapFailed`, so the
 * function's own sentence sits next to the choice that caused it.
 */

import { useState } from "react";
import { ChevronRight, CornerUpRight, FolderTree } from "lucide-react";

import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@ai-matrx/design-system";
import { useAppSelector } from "@/lib/redux/hooks";

import { TopicalMapFailed } from "../../components/TopicalMapStates";
import { useMapTopicSearch } from "../../hooks";
import { selectMapTopic, selectMapTopicsBySlug } from "../../redux/selectors";
import type { NormalizedMapTopic } from "../../redux/types";

/** `slug` plus every descendant, from the loaded tree. */
export function subtreeSlugs(
  topics: Readonly<Record<string, NormalizedMapTopic>>,
  slug: string,
): Set<string> {
  const out = new Set<string>();
  const stack = [slug];
  while (stack.length > 0) {
    const current = stack.pop();
    if (!current || out.has(current)) continue;
    out.add(current);
    for (const child of topics[current]?.childSlugs ?? []) stack.push(child);
  }
  return out;
}

export interface MoveTopicDialogProps {
  mapId: string;
  /** The topic being moved, or null when closed. */
  slug: string | null;
  onClose: () => void;
  /** The write. Resolves when the move landed; rejects with the RPC's error. */
  onMove: (slug: string, newParentSlug: string | null) => Promise<unknown>;
}

export function MoveTopicDialog({ mapId, slug, onClose, onMove }: MoveTopicDialogProps) {
  return (
    <Dialog open={slug !== null} onOpenChange={(open) => (open ? undefined : onClose())}>
      <DialogContent className="max-w-md p-0">
        {slug ? <MoveTopicBody mapId={mapId} slug={slug} onClose={onClose} onMove={onMove} /> : null}
      </DialogContent>
    </Dialog>
  );
}

function MoveTopicBody({
  mapId,
  slug,
  onClose,
  onMove,
}: {
  mapId: string;
  slug: string;
  onClose: () => void;
  onMove: MoveTopicDialogProps["onMove"];
}) {
  const [query, setQuery] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>(null);
  const topic = useAppSelector(selectMapTopic(mapId, slug));
  const topics = useAppSelector(selectMapTopicsBySlug(mapId));
  const search = useMapTopicSearch(mapId, query, 25);

  const excluded = subtreeSlugs(topics, slug);
  const currentParent = topic?.parentSlug ?? null;
  const hits = (search.data ?? []).filter((hit) => !excluded.has(hit.slug));

  async function move(target: string | null) {
    setBusy(true);
    setError(null);
    try {
      await onMove(slug, target);
      onClose();
    } catch (cause) {
      setError(cause);
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <DialogHeader className="px-4 pt-4">
        <DialogTitle className="flex items-center gap-2 text-sm">
          <CornerUpRight className="h-4 w-4 text-muted-foreground" aria-hidden />
          Move «{topic?.name ?? slug}»
        </DialogTitle>
        <DialogDescription className="text-xs">
          Pick its new parent. Everything under it moves with it; its pages, planned pages
          and keywords stay attached.
        </DialogDescription>
      </DialogHeader>

      {error ? (
        <div className="px-4">
          <TopicalMapFailed what={`moving "${topic?.name ?? slug}"`} error={error} />
        </div>
      ) : null}

      <Command shouldFilter={false} className="border-t border-border">
        <CommandInput
          value={query}
          onValueChange={setQuery}
          placeholder="Find the new parent…"
          disabled={busy}
        />
        <CommandList className="max-h-72">
          <CommandGroup>
            {currentParent !== null ? (
              <CommandItem value="__root" onSelect={() => void move(null)} disabled={busy}>
                <FolderTree className="mr-2 h-3.5 w-3.5 text-muted-foreground" aria-hidden />
                Top level
              </CommandItem>
            ) : null}
          </CommandGroup>
          {search.isError ? (
            <div className="px-3 py-2">
              <TopicalMapFailed what="the topic search" error={search.error} />
            </div>
          ) : null}
          <CommandEmpty>
            {search.isPending ? "Searching…" : "No topic matches, or every match is inside this branch."}
          </CommandEmpty>
          <CommandGroup heading="Topics">
            {hits.map((hit) => (
              <CommandItem
                key={hit.slug}
                value={hit.slug}
                disabled={busy || hit.slug === currentParent}
                onSelect={() => void move(hit.slug)}
                className="flex flex-col items-start gap-0"
              >
                <span className="text-sm">
                  {hit.name}
                  {hit.slug === currentParent ? (
                    <span className="ml-2 text-[11px] text-muted-foreground">current parent</span>
                  ) : null}
                </span>
                {hit.path.length > 1 ? (
                  <span className="flex items-center gap-0.5 text-[11px] text-muted-foreground">
                    {hit.path.slice(0, -1).map((crumb, index) => (
                      <span key={crumb} className="flex items-center gap-0.5">
                        {index > 0 ? <ChevronRight className="h-3 w-3" aria-hidden /> : null}
                        {topics[crumb]?.name ?? crumb}
                      </span>
                    ))}
                  </span>
                ) : null}
              </CommandItem>
            ))}
          </CommandGroup>
        </CommandList>
      </Command>
    </>
  );
}
