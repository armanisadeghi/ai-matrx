"use client";

/**
 * Top posts of a connected account by one private figure (`social.own_post_metric`), read by the shared
 * insights reader. Used on the account page and in KPIs "Own channel". A figure the provider never sent
 * reads "Not available"; a post without it is not ranked.
 */

import { useState } from "react";

import { availablePostMetrics, insightText, POST_METRICS, topOwnPosts, type PostMetricId } from "../insights";
import { formatCompact } from "../outlier";
import { useOwnPostFigures } from "../useOwnInsights";

export function TopOwnPosts({ trackedAccountId, limit = 5 }: { trackedAccountId: string; limit?: number }) {
  const query = useOwnPostFigures([trackedAccountId]);
  const [picked, setPicked] = useState<PostMetricId | null>(null);
  const figures = query.data?.figures ?? [];
  const metrics = availablePostMetrics(figures);
  const metric = picked && metrics.some((m) => m.id === picked) ? picked : metrics[0]?.id ?? null;
  const top = metric ? topOwnPosts(figures, metric, limit) : [];
  return (
    <section aria-label="Top posts" className="flex flex-col gap-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <h2 className="text-sm font-medium text-foreground">Top posts</h2>
        <div className="flex flex-wrap gap-1">
          {metrics.map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => setPicked(m.id)}
              aria-pressed={m.id === metric}
              className={`rounded-md border px-2 py-0.5 text-xs ${m.id === metric ? "border-primary bg-primary/10 text-foreground" : "border-border text-muted-foreground"}`}
            >
              {m.label}
            </button>
          ))}
        </div>
      </div>
      {query.isLoading ? (
        <p className="text-xs text-muted-foreground">Loading</p>
      ) : query.isError ? (
        <p className="text-xs text-muted-foreground">Couldn't load</p>
      ) : top.length === 0 ? (
        <p className="text-xs text-muted-foreground">Not available</p>
      ) : (
        <ol className="flex flex-col divide-y divide-border rounded-md border border-border">
          {top.map((f) => {
            const label = f.postId ? query.data?.labels.get(f.postId) : undefined;
            const name = label?.title?.trim() || `Post ${f.providerPostId}`;
            return (
              <li key={f.providerPostId} className="flex items-center justify-between gap-3 px-3 py-2">
                {label?.url ? (
                  <a href={label.url} target="_blank" rel="noreferrer" className="min-w-0 truncate text-sm text-foreground hover:underline">
                    {name}
                  </a>
                ) : (
                  <span className="min-w-0 truncate text-sm text-foreground">{name}</span>
                )}
                <span className="shrink-0 text-sm tabular-nums">
                  {insightText(metric ? f.values[metric] : null, formatCompact)}
                  <span className="ml-1 text-xs text-muted-foreground">{POST_METRICS.find((m) => m.id === metric)?.label}</span>
                </span>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
