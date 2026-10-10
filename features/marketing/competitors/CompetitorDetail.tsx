"use client";

/**
 * The competitor detail window: name, website, every social account with its stats, the best
 * outliers, and the two actions (find their socials, track what was found). Plain sentences and
 * numbers only — never a key, an id or a JSON view.
 */

import { asClause } from "@ai-matrx/kit/text";
import Link from "next/link";
import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { ExternalLink, Loader2, Search, UserPlus } from "lucide-react";

import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";

import { listBrandCompetitors, type BrandCompetitor } from "./brand-competitors";
import { competitorDetailModel, platformLabel } from "./competitor-detail";
import { AddHandlesForm } from "./AddHandlesForm";
import { useSocialSpend } from "@/features/marketing/social/cost";
import { directoryKey, useCompetitorSocialActions, useFoundSocials, type BrandRef } from "./useCompetitorSocials";

function Heading({ children }: { children: string }) {
  return <p className="mb-2 text-xs font-medium uppercase tracking-wide text-muted-foreground">{children}</p>;
}

export function CompetitorDetail({
  row,
  brand,
  brandSeg,
  siteIds,
}: {
  row: BrandCompetitor;
  brand: BrandRef;
  brandSeg: string;
  siteIds: string[];
}) {
  // Follows the list: after Track, the new account shows here without reopening the window.
  const live = useQuery({
    queryKey: [...directoryKey(brand.id), siteIds],
    queryFn: ({ signal }) => listBrandCompetitors(brand.id, siteIds, signal),
    enabled: false,
  });
  const current = live.data?.find((r) => r.key === row.key) ?? row;
  const model = useMemo(() => competitorDetailModel(current, brandSeg), [current, brandSeg]);
  const found = useFoundSocials(brand.id, current.key);
  const { find, track } = useCompetitorSocialActions(brand);
  const { pointsText } = useSocialSpend(brand.organizationId);
  const busy = found?.status === "finding" || found?.status === "tracking";

  async function trackAll() {
    if (!found?.links.length) return;
    const out = await track(current, found.links);
    if (out.tracked) toast.success(`Tracking ${out.tracked} ${out.tracked === 1 ? "account" : "accounts"}`);
  }

  return (
    <div className="space-y-5 p-4 text-sm">
      <header className="space-y-1">
        {model.website ? (
          <a
            href={model.website.href}
            target="_blank"
            rel="noreferrer"
            className="inline-flex items-center gap-1 text-foreground hover:underline"
          >
            {model.website.label}
            <ExternalLink className="h-3 w-3" />
          </a>
        ) : (
          <p className="text-muted-foreground">No website on file</p>
        )}
      </header>

      <section>
        <Heading>Social accounts</Heading>
        {model.accounts.length === 0 ? (
          <p className="text-muted-foreground">
            {model.canFindSocials ? "None tracked yet. Find them on their website." : "None tracked yet."}
          </p>
        ) : (
          <ul className="divide-y divide-border rounded-md border border-border">
            {model.accounts.map((a) => (
              <li key={a.trackedAccountId} className="flex items-center justify-between gap-3 px-3 py-2">
                <Link href={a.href} className="min-w-0 truncate hover:underline">
                  <span className="font-medium">{a.platformLabel}</span>
                  <span className="ml-2 text-muted-foreground">{a.handle}</span>
                </Link>
                <span className="flex shrink-0 gap-4 text-xs tabular-nums text-muted-foreground">
                  <span>{a.followers} followers</span>
                  <span>{a.posts} posts</span>
                  {a.outlier ? <span>{a.outlier} best</span> : null}
                </span>
              </li>
            ))}
          </ul>
        )}
      </section>

      {model.outliers.length > 0 ? (
        <section>
          <Heading>Top outliers, last 30 days</Heading>
          <ul className="space-y-1">
            {model.outliers.map((o) => (
              <li key={`${o.platformLabel}-${o.handle}`} className="flex items-center justify-between gap-3">
                <span className="min-w-0 truncate">
                  <span className="font-medium tabular-nums">{o.multiple}</span>
                  <span className="ml-2 text-muted-foreground">
                    {o.platformLabel} {o.handle}
                    {o.views ? ` · ${o.views} views` : ""}
                  </span>
                </span>
                {o.postUrl ? (
                  <a href={o.postUrl} target="_blank" rel="noreferrer" className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Open post
                  </a>
                ) : (
                  <Link href={o.href} className="shrink-0 text-xs text-muted-foreground hover:text-foreground hover:underline">
                    Open account
                  </Link>
                )}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {found?.unreadable || model.accounts.length === 0 ? (
        <section className="space-y-2">
          <Heading>Add handles</Heading>
          {found?.unreadable ? <p className="text-xs text-muted-foreground">{asClause(found.message)}. Add their accounts here instead.</p> : null}
          <AddHandlesForm row={current} brand={brand} />
        </section>
      ) : null}

      {found && !found.unreadable && (found.links.length > 0 || found.message) ? (
        <section>
          <Heading>Found on their website</Heading>
          {found.links.length > 0 ? (
            <ul className="mb-2 space-y-1">
              {found.links.map((l) => (
                <li key={l.url} className="flex items-center justify-between gap-3">
                  <span className="min-w-0 truncate">
                    <span className="font-medium">{platformLabel(l.platform)}</span>
                    <span className="ml-2 text-muted-foreground">{l.url.replace(/^https?:\/\/(www\.)?/, "")}</span>
                  </span>
                  <Button variant="outline" disabled={busy} onClick={() => void track(current, [l])}>
                    {pointsText("track") ? `Track · ${pointsText("track")}` : "Track"}
                  </Button>
                </li>
              ))}
            </ul>
          ) : null}
          {found.message ? <p className="text-xs text-muted-foreground">{found.message}</p> : null}
        </section>
      ) : null}

      <footer className="flex flex-wrap gap-2 border-t border-border pt-3">
        {model.canFindSocials ? (
          <Button
            variant="outline"
            disabled={busy}
            icon={found?.status === "finding" ? <Loader2 className="animate-spin" /> : <Search />}
            onClick={() => void find(current)}
          >
            {found?.status === "finding" ? "Reading their website…" : "Find socials · Free"}
          </Button>
        ) : null}
        {found?.links.length ? (
          <Button variant="primary" disabled={busy} icon={<UserPlus />} onClick={() => void trackAll()}>
            {found.status === "tracking" ? "Tracking…" : `Track ${found.links.length}${pointsText("track", found.links.length) ? ` · ${pointsText("track", found.links.length)}` : ""}`}
          </Button>
        ) : null}
      </footer>
    </div>
  );
}
