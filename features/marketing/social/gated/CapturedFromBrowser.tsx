"use client";

/**
 * "From your browser" — what this organization captured about an account in its own browsers,
 * merged after the shared data: only posts the shared cache does not already have, plus the
 * account figures when the shared cache has none. Absent when there is nothing (never an empty box).
 */

import Link from "next/link";
import { useQuery } from "@tanstack/react-query";

import { Badge } from "@ai-matrx/design-system/controls";
import { ErrorAlchemyMenu } from "@/components/errors/ErrorAlchemyMenu";

import { formatCompact } from "../outlier";
import { capturedPostsMissingFrom, fetchBrowserCaptures, type CaptureEntity } from "./capturedFromBrowser";
import { guidedResultHref } from "./guidedJob";

export function browserCapturesKey(targets: { type: CaptureEntity; id: string | null | undefined }[]) {
  return ["social", "browser-captures", ...targets.map((t) => `${t.type}:${t.id ?? ""}`)] as const;
}

export function CapturedFromBrowser({
  targets,
  knownPlatformPostIds,
}: {
  targets: { type: CaptureEntity; id: string | null | undefined }[];
  knownPlatformPostIds: ReadonlySet<string>;
}) {
  const q = useQuery({ queryKey: browserCapturesKey(targets), queryFn: () => fetchBrowserCaptures(targets) });
  if (q.isError) {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        Couldn't read your browser captures
        <ErrorAlchemyMenu error={q.error} operation="load browser captures" />
      </p>
    );
  }
  const captures = q.data ?? [];
  if (captures.length === 0) return null;
  const latest = captures[0];
  const extra = capturedPostsMissingFrom(captures, knownPlatformPostIds);
  const figures = [
    latest.profile.followerCount !== null ? `${formatCompact(latest.profile.followerCount)} followers` : null,
    latest.profile.postCount !== null ? `${formatCompact(latest.profile.postCount)} posts` : null,
  ].filter(Boolean);

  return (
    <section aria-label="From your browser" className="flex flex-col gap-2 rounded-md border border-border p-2">
      <div className="flex min-h-7 flex-wrap items-center gap-2 text-sm">
        <Badge>From your browser</Badge>
        <span className="text-muted-foreground">{figures.join(" · ") || "Saved page"}</span>
        {latest.status === "needs_agent" ? <span className="text-xs text-muted-foreground">Saved, not read yet</span> : null}
        <Link className="ml-auto text-xs underline-offset-2 hover:underline" href={guidedResultHref(latest.sourceId)}>
          Saved page
        </Link>
      </div>
      {extra.length > 0 ? (
        <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2 xl:grid-cols-3">
          {extra.slice(0, 24).map((p) => (
            <li key={p.platformPostId} className="flex min-w-0 items-center gap-2 rounded border border-border px-2 py-1 text-xs">
              <span className="truncate">{p.text || p.postedLabel || p.format}</span>
              <span className="ml-auto shrink-0 text-muted-foreground">
                {[p.likes !== null ? `${formatCompact(p.likes)} likes` : null, p.views !== null ? `${formatCompact(p.views)} views` : null]
                  .filter(Boolean)
                  .join(" · ")}
              </span>
              {p.url ? (
                <a className="shrink-0 underline-offset-2 hover:underline" href={p.url} target="_blank" rel="noreferrer noopener">
                  Open
                </a>
              ) : null}
            </li>
          ))}
        </ul>
      ) : null}
    </section>
  );
}
