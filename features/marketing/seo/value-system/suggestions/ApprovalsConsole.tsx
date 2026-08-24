"use client";

/**
 * THE approvals console — every pending AI proposal for YOUR scope, one place
 * (register item KI-045).
 *
 * The per-site queue (`KeywordMeaningSuggestions`) already carries the whole
 * item mechanic: canonical AssistChip rows, per-item approve/reject, select-all
 * with one confirmed batch. What it could not give a reviewer is REACH — a
 * person overseeing many sites had to visit each site's Value screen to learn
 * whether anything was waiting. This page derives the site list from the
 * pending queue itself and mounts the SAME component per site — never a
 * second approval mechanic, never a fork (assists doctrine).
 *
 * Scope is honest by construction: the assists slice returns only suggestions
 * addressed to the signed-in user, so this console can never show a queue its
 * reader is not allowed to act on.
 */

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { BrainCircuit, CheckCircle2, ExternalLink, Loader2 } from "lucide-react";
import { useAppDispatch, useAppSelector } from "@/lib/redux/hooks";
import { selectUserId } from "@/lib/redux/selectors/userSelectors";
import type { RootState } from "@/lib/redux/store";
import {
  fetchMyAssists,
  selectAssistsForSurface,
  selectAssistsLoaded,
} from "@/features/assists/redux/assistsSlice";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { supabase } from "@/utils/supabase/client";
import {
  KEYWORD_MEANING_SURFACE,
  KeywordMeaningSuggestions,
} from "./KeywordMeaningSuggestions";

interface SiteRow {
  id: string;
  name: string | null;
  domain: string | null;
  brand_id: string | null;
}

export function ApprovalsConsole() {
  const dispatch = useAppDispatch();
  const userId = useAppSelector(selectUserId);
  const loaded = useAppSelector(selectAssistsLoaded);
  const surfaceAssists = useAppSelector((state: RootState) =>
    selectAssistsForSurface(state, KEYWORD_MEANING_SURFACE),
  );

  useEffect(() => {
    if (userId && !loaded) void dispatch(fetchMyAssists({ userId }));
  }, [dispatch, userId, loaded]);

  const siteIds = useMemo(() => {
    const ids = new Set<string>();
    for (const assist of surfaceAssists) {
      if (assist.action.kind === "apply_keyword_meaning") {
        ids.add(assist.action.siteId);
      }
    }
    return [...ids].sort();
  }, [surfaceAssists]);

  const [sites, setSites] = useState<Map<string, SiteRow>>(new Map());
  useEffect(() => {
    if (siteIds.length === 0) return;
    let cancelled = false;
    void (async () => {
      const { data, error } = await supabase
        .schema("web")
        .from("site")
        .select("id, name, domain, brand_id")
        .in("id", siteIds);
      if (!cancelled && !error && data) {
        setSites(new Map(data.map((row) => [row.id, row as SiteRow])));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [siteIds]);

  if (!loaded) {
    return (
      <div className="flex items-center gap-2 rounded-md border border-border bg-card p-3 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 animate-spin" /> Reading your approval
        queue…
      </div>
    );
  }

  if (siteIds.length === 0) {
    return (
      <div className="flex flex-col items-center gap-2 rounded-lg border border-border bg-card p-8 text-center">
        <CheckCircle2 className="h-8 w-8 text-success" />
        <p className="text-sm font-medium">Nothing is waiting on you</p>
        <p className="max-w-md text-xs text-muted-foreground">
          When an agent proposes a change to any of your sites&apos; keyword
          meaning — a matcher, a worth, a stamp, a guidelines edit — it appears
          here for your approval, and nothing an agent proposes takes effect
          until you rule on it.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start gap-2 rounded-md border border-border bg-muted/30 p-2.5">
        <BrainCircuit className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
        <p className="text-xs text-muted-foreground">
          Every pending agent proposal across your sites, in one place. Each
          row states the exact write it would perform; approve or reject one at
          a time, or select a site&apos;s whole queue and rule on it as a
          confirmed batch. Nothing changes until you say so.
        </p>
      </div>
      {siteIds.map((siteId) => {
        const site = sites.get(siteId);
        const label = site?.name || site?.domain || siteId;
        return (
          <section key={siteId} className="flex flex-col gap-1.5">
            <div className="flex items-center gap-2">
              <h2 className="text-sm font-semibold">{label}</h2>
              {site?.domain ? (
                <span className="text-[11px] text-muted-foreground">
                  {site.domain}
                </span>
              ) : null}
              <Link
                href={marketingRoutes.site(site?.brand_id, siteId, "/value")}
                className="ml-auto inline-flex items-center gap-1 text-[11px] text-primary underline-offset-2 hover:underline"
                title="Open this site's Value workbench"
              >
                Open site <ExternalLink className="h-3 w-3" />
              </Link>
            </div>
            <KeywordMeaningSuggestions siteId={siteId} />
          </section>
        );
      })}
    </div>
  );
}
