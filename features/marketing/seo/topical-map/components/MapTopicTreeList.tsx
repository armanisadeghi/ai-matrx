"use client";

/**
 * THE U1 HARNESS. "Done means: a harness renders the same map from the store in
 * a trivial list; every RPC has a hook; selection and expansion state survive
 * switching views" (requirements §4 U1).
 *
 * This is that list, and it is deliberately plain: it reads ONLY from the
 * topical-map slice through `selectVisibleMapTopics`, so whatever it shows is
 * exactly what the outline, table and graph builders (U2) will consume. Nothing
 * here fetches; the route body owns the read.
 *
 * It is not a placeholder for the four views — it is the proof that the store
 * feeds them. U2 replaces each view's body with the real drawing and keeps this
 * same selector.
 */

import { ChevronDown, ChevronRight } from "lucide-react";

import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";

import {
  selectMapLoadedIncludes,
  selectVisibleMapTopics,
} from "../redux/selectors";
import { selectTopic, toggleExpanded } from "../redux/slice";

export function MapTopicTreeList({ mapId }: { mapId: string }) {
  const dispatch = useAppDispatch();
  const rows = useAppSelector(selectVisibleMapTopics(mapId));
  const includes = useAppSelector(selectMapLoadedIncludes(mapId));
  const countsLoaded = includes.includes("counts");

  return (
    <ul className="divide-y divide-border rounded-xl border border-border bg-card">
      {rows.map((row) => (
        <li key={row.slug}>
          <div
            className={`flex items-center gap-2 px-3 py-2 ${
              row.selected ? "bg-primary/10" : ""
            }`}
            style={{ paddingLeft: `${12 + row.depth * 18}px` }}
          >
            {row.hasChildren ? (
              <button
                type="button"
                aria-label={row.expanded ? `Collapse ${row.name}` : `Expand ${row.name}`}
                aria-expanded={row.expanded}
                className="rounded p-0.5 text-muted-foreground hover:bg-muted"
                onClick={() => dispatch(toggleExpanded({ mapId, slug: row.slug }))}
              >
                {row.expanded ? (
                  <ChevronDown className="h-4 w-4" aria-hidden />
                ) : (
                  <ChevronRight className="h-4 w-4" aria-hidden />
                )}
              </button>
            ) : (
              <span className="inline-block h-5 w-5" aria-hidden />
            )}
            <button
              type="button"
              className="min-w-0 flex-1 truncate text-left text-sm"
              aria-current={row.selected ? "true" : undefined}
              onClick={() => dispatch(selectTopic({ mapId, slug: row.slug }))}
            >
              <span className={row.selected ? "font-semibold" : ""}>{row.name}</span>
              <span className="ml-2 font-mono text-xs text-muted-foreground">
                {row.slug}
              </span>
            </button>
            {row.topic.status && row.topic.status !== "active" ? (
              <span className="shrink-0 rounded border border-border px-1.5 py-0.5 text-xs text-muted-foreground">
                {row.topic.status}
              </span>
            ) : null}
            {/* An absent count means the tree was loaded WITHOUT `counts` — it
                never means zero, so nothing is printed in that case. */}
            {countsLoaded ? (
              <span className="shrink-0 text-xs text-muted-foreground">
                {row.topic.pages ?? 0} pages · {row.topic.planned ?? 0} planned ·{" "}
                {row.topic.keywords ?? 0} keywords
              </span>
            ) : null}
          </div>
        </li>
      ))}
    </ul>
  );
}
