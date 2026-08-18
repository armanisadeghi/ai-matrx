"use client";

// features/crm/components/record/PartyProvenanceCard.tsx
//
// "WHY IS THIS ORGANIZATION IN MY CRM?"
//
// The G1 fold (aidream `services/crm/seo_domains.py`) writes a provenance EDGE
// beside every party it creates — `party -> seo_referring_domain_profile`
// (role `link_prospect`), `party -> seo_reputation_case` (role
// `outreach_target`), `party -> seo_link_gap_domain` (role `link_gap`). That
// edge is the whole answer, and until now no surface rendered it: a user
// looking at a company they never typed in had no way to learn where it came
// from. A record you cannot explain is a dead end.
//
// 🚨 We read the LIVE seo row, not the edge payload. `platform.associations`
// has zero browser grants and the `assoc_*` RPCs deliberately return
// `metadata`, not `payload` — but they DO return `other_type` / `other_id`,
// which is the exact row. Reading the live record is also the better answer:
// the payload is a snapshot ("observed_at"), the row is the current verdict,
// priority and pitch angle, and every id becomes a real door.

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowUpRight,
  Compass,
  Loader2,
  RefreshCw,
  UserPlus,
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { toast } from "@/lib/toast";
import { supabase } from "@/utils/supabase/client";
import { associationsService } from "@/features/scopes/service/associationsService";
import { updateParty } from "../../service";
import type { PartyRow } from "../../types";
import { SectionCard, SectionEmpty } from "./SectionCard";

/** The three provenance roles the SEO→CRM bridge writes. */
const PROVENANCE_ROLES = new Set([
  "link_prospect",
  "outreach_target",
  "link_gap",
]);

interface ProvenanceItem {
  key: string;
  /** What kind of opportunity put this org here, in the user's words. */
  kindLabel: string;
  title: string;
  /** The current verdict on the live row (never a stale payload snapshot). */
  verdict: string | null;
  priority: number | null;
  pitchAngle: string | null;
  /** The page that proves it — always openable. */
  sourceUrl: string | null;
  /** Where in the platform this evidence lives. */
  href: string | null;
  hrefLabel: string;
  observedAt: string | null;
}

function humanVerdict(value: string | null): string | null {
  return value ? value.replaceAll("_", " ") : null;
}

async function sitePathsFor(siteIds: string[]): Promise<Map<string, string>> {
  const out = new Map<string, string>();
  const ids = Array.from(new Set(siteIds.filter(Boolean)));
  if (!ids.length) return out;
  const { data } = await supabase
    .schema("web")
    .from("site")
    .select("id,brand_id")
    .in("id", ids);
  for (const row of data ?? []) {
    if (row.brand_id)
      out.set(row.id, `/marketing/brands/${row.brand_id}/sites/${row.id}`);
  }
  return out;
}

async function loadProvenance(partyId: string): Promise<ProvenanceItem[]> {
  const result = await associationsService.listForEntity("party", partyId);
  if (!result.ok) throw new Error(result.error.message);
  const edges = result.data.edges.filter(
    (edge) =>
      edge.direction === "outgoing" && PROVENANCE_ROLES.has(edge.role ?? ""),
  );
  if (!edges.length) return [];

  const caseIds = edges
    .filter((e) => e.otherType === "seo_reputation_case")
    .map((e) => e.otherId);
  const profileIds = edges
    .filter((e) => e.otherType === "seo_referring_domain_profile")
    .map((e) => e.otherId);
  const gapIds = edges
    .filter((e) => e.otherType === "seo_link_gap_domain")
    .map((e) => e.otherId);

  const seo = supabase.schema("seo");
  const [cases, profiles, gaps] = await Promise.all([
    caseIds.length
      ? seo
          .from("reputation_case")
          .select(
            "id,site_id,headline,verdict,priority,pitch_angle,source_url,source_domain,analyzed_at",
          )
          .in("id", caseIds)
      : Promise.resolve({ data: [], error: null }),
    profileIds.length
      ? seo
          .from("referring_domain_profile")
          .select(
            "id,site_id,display_domain,opinion_verdict,opinion_score,opinion_summary,current_backlinks",
          )
          .in("id", profileIds)
      : Promise.resolve({ data: [], error: null }),
    gapIds.length
      ? seo
          .from("link_gap_domain")
          .select(
            "id,site_id,display_domain,review_status,priority_score,match_count",
          )
          .in("id", gapIds)
      : Promise.resolve({ data: [], error: null }),
  ]);

  const paths = await sitePathsFor([
    ...(cases.data ?? []).map((row) => row.site_id),
    ...(profiles.data ?? []).map((row) => row.site_id),
    ...(gaps.data ?? []).map((row) => row.site_id),
  ]);

  const items: ProvenanceItem[] = [];
  for (const row of cases.data ?? []) {
    const base = paths.get(row.site_id);
    items.push({
      key: `case-${row.id}`,
      kindLabel: "Media / reputation case",
      title: row.headline,
      verdict: row.verdict,
      priority: row.priority,
      pitchAngle: row.pitch_angle,
      sourceUrl: row.source_url,
      href: base ? `${base}/reputation?view=cases` : null,
      hrefLabel: "Open the reputation workspace",
      observedAt: row.analyzed_at,
    });
  }
  for (const row of profiles.data ?? []) {
    const base = paths.get(row.site_id);
    items.push({
      key: `profile-${row.id}`,
      kindLabel: "Link prospect",
      title: `${row.display_domain} — ${row.current_backlinks} link${row.current_backlinks === 1 ? "" : "s"} to you`,
      verdict: row.opinion_verdict,
      priority: row.opinion_score,
      pitchAngle: row.opinion_summary,
      sourceUrl: `https://${row.display_domain}`,
      href: base ? `${base}/backlinks?view=domains` : null,
      hrefLabel: "Open the referring domains",
      observedAt: null,
    });
  }
  for (const row of gaps.data ?? []) {
    const base = paths.get(row.site_id);
    items.push({
      key: `gap-${row.id}`,
      kindLabel: "Competitor link gap",
      title: `${row.display_domain} — links to ${row.match_count} of your competitors`,
      verdict: row.review_status,
      priority: row.priority_score,
      pitchAngle: null,
      sourceUrl: `https://${row.display_domain}`,
      href: base ? `${base}/backlinks?view=prospects` : null,
      hrefLabel: "Open the link-gap prospects",
      observedAt: null,
    });
  }
  return items;
}

export function PartyProvenanceCard({
  party,
  onChanged,
}: {
  party: PartyRow;
  onChanged: () => void;
}) {
  const [items, setItems] = useState<ProvenanceItem[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [promoting, setPromoting] = useState(false);
  const [attempt, setAttempt] = useState(0);

  const discovered = party.record_class === "discovered";

  useEffect(() => {
    let cancelled = false;
    setError(null);
    void (async () => {
      try {
        const rows = await loadProvenance(party.id);
        if (!cancelled) setItems(rows);
      } catch (e) {
        if (!cancelled)
          setError(
            e instanceof Error
              ? e.message
              : "Could not read where this record came from.",
          );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [party.id, attempt]);

  // Nothing to explain: a hand-entered contact has no provenance edge and no
  // origin stamp, and an empty card would be noise on every ordinary record.
  if (!discovered && !party.source && (items?.length ?? 0) === 0 && !error)
    return null;

  const promote = async () => {
    setPromoting(true);
    try {
      await updateParty(party.id, { record_class: "contact" });
      toast.success(`${party.display_name} is now one of your contacts.`);
      onChanged();
    } catch (e) {
      toast.error(
        e instanceof Error ? e.message : "Could not add this to your contacts",
      );
    } finally {
      setPromoting(false);
    }
  };

  return (
    <SectionCard
      title="Why this is in your CRM"
      Icon={Compass}
      count={items?.length ?? undefined}
    >
      <div className="space-y-2">
        {discovered && (
          <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-border bg-muted/30 p-2.5">
            <p className="text-xs text-muted-foreground">
              The platform found this record — it is not in your contact list
              yet, so it stays out of pickers and searches.
            </p>
            {/* The sensible next step, offered where the explanation is. */}
            <Button
              size="sm"
              variant="outline"
              className="h-7 gap-1.5"
              disabled={promoting}
              onClick={() => void promote()}
            >
              {promoting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
              ) : (
                <UserPlus className="h-3.5 w-3.5" />
              )}
              Add to my contacts
            </Button>
          </div>
        )}

        {party.source && (
          <p className="text-xs text-muted-foreground">
            Origin: <span className="text-foreground">{party.source.replaceAll("_", " ")}</span>
            {party.source_detail ? (
              <>
                {" · "}
                <a
                  href={party.source_detail}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="text-primary "
                >
                  {party.source_detail}
                </a>
              </>
            ) : null}
          </p>
        )}

        {error && (
          <div className="flex items-start justify-between gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-2.5 text-xs">
            <span className="text-destructive">{error}</span>
            <Button
              size="sm"
              variant="outline"
              className="h-6 gap-1 text-[11px]"
              onClick={() => setAttempt((n) => n + 1)}
            >
              <RefreshCw className="h-3 w-3" /> Retry
            </Button>
          </div>
        )}

        {items === null && !error && (
          <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
            <Loader2 className="h-3.5 w-3.5 animate-spin" /> Reading where this
            came from…
          </p>
        )}

        {items !== null && items.length === 0 && !error && (
          <SectionEmpty>
            No opportunity is recorded against this organization yet.
          </SectionEmpty>
        )}

        {(items ?? []).map((item) => (
          <div key={item.key} className="rounded-md border bg-muted/20 p-2.5">
            <div className="flex flex-wrap items-center gap-1.5">
              <Badge variant="secondary" className="gap-1">
                <Compass className="h-3 w-3" /> {item.kindLabel}
              </Badge>
              {item.verdict && (
                <Badge variant="outline" className="capitalize">
                  {humanVerdict(item.verdict)}
                </Badge>
              )}
              {item.priority !== null && (
                <span className="text-[11px] tabular-nums text-muted-foreground">
                  priority {item.priority}
                </span>
              )}
            </div>
            <p className="mt-1.5 text-xs font-medium text-foreground">
              {item.title}
            </p>
            {item.pitchAngle && (
              <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                {item.pitchAngle}
              </p>
            )}
            <div className="mt-1.5 flex flex-wrap gap-3 text-[11px]">
              {item.sourceUrl && (
                <a
                  href={item.sourceUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-primary "
                >
                  Open the source <ArrowUpRight className="h-3 w-3" />
                </a>
              )}
              {item.href && (
                <Link
                  href={item.href}
                  className="inline-flex items-center gap-1 text-primary "
                >
                  {item.hrefLabel} <ArrowUpRight className="h-3 w-3" />
                </Link>
              )}
            </div>
          </div>
        ))}
      </div>
    </SectionCard>
  );
}
