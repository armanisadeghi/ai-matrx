"use client";

/**
 * A starter pack, seen from the Matrx Library catalog.
 *
 * THE SUBSCRIBE LAW: a pack is a COPY type. Taking it means adopting its
 * defaults ONTO ONE SITE — there is no org-level "subscribe" that would be
 * honest here, so this panel never offers one. Its primary action picks the
 * site and hands off to that site's own pack review screen
 * (`…/value/packs?pack=<id>&review=1`), which is the ONE adoption path.
 *
 * Everything shown is server truth (`starter_pack_detail`) — the same rows the
 * review screen will offer, so the catalog can never promise a different pack
 * than the one that lands.
 */

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  BookOpenCheck,
  Boxes,
  Building2,
  Globe2,
  Layers,
  ListChecks,
  Loader2,
  MapPinned,
  TreePine,
} from "lucide-react";

import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { cn } from "@/lib/utils";
import { useSiteOptions } from "@/features/marketing/data/hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import {
  getStarterPackDetail,
  starterPackDetailQueryKey,
} from "@/features/marketing/seo/value-system/data";
import { packReviewHref } from "@/features/marketing/seo/value-system/lib";
import { EntitlementChip } from "@/features/rag/components/library-catalog/EntitlementChip";
import type { LibraryResource } from "@/features/rag/hooks/useLibraryResources";

/** Pack status, in the tenant's words. Mirrors the industry-packs screen. */
const STATUS_META: Record<string, { label: string; hint: string; tone: string }> = {
  ratified: {
    label: "Expert-ratified",
    hint: "A domain expert has signed off on these defaults.",
    tone: "border-success/40 bg-success/10 text-success",
  },
  proposed: {
    label: "Proposed",
    hint: "Built from real demand, awaiting expert ratification. Safe to use — every row stays editable on your site.",
    tone: "border-warning/40 bg-warning/10 text-warning",
  },
  draft: {
    label: "Draft",
    hint: "Still being assembled.",
    tone: "border-border bg-muted text-muted-foreground",
  },
  retired: {
    label: "Retired",
    hint: "Superseded. Kept so adopted sites can still see where their rows came from.",
    tone: "border-border bg-muted text-muted-foreground",
  },
};

function Stat({
  icon: Icon,
  count,
  label,
}: {
  icon: typeof TreePine;
  count: number;
  label: string;
}) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md border border-border bg-card px-2 py-1 text-[11px] text-muted-foreground">
      <Icon className="h-3 w-3" aria-hidden />
      <span className="font-medium tabular-nums text-foreground">{count}</span>
      {label}
    </span>
  );
}

/** The one action: choose a site, land on that site's review screen. */
function UseOnSite({ packId }: { packId: string }) {
  const router = useRouter();
  const sites = useSiteOptions();
  const options = sites.data ?? [];
  const [siteId, setSiteId] = useState<string | null>(null);
  const [going, setGoing] = useState(false);
  const chosen = options.find((s) => s.id === siteId) ?? options[0] ?? null;

  if (sites.isPending) {
    return (
      <span className="inline-flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading your sites…
      </span>
    );
  }

  if (!chosen) {
    // No sites at all — the honest door is the one that creates the first site.
    return (
      <Link
        href={marketingRoutes.newSite()}
        className="inline-flex items-center gap-1.5 rounded-md border border-border bg-card px-2.5 py-1.5 text-xs font-medium hover:border-primary/50 hover:bg-accent"
      >
        <Globe2 className="h-3.5 w-3.5 text-muted-foreground" aria-hidden />
        Add a website to use this pack
      </Link>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-1.5">
      {options.length > 1 ? (
        <Select value={chosen.id} onValueChange={setSiteId}>
          <SelectTrigger className="h-8 w-[190px] text-xs">
            <SelectValue placeholder="Choose a website" />
          </SelectTrigger>
          <SelectContent>
            {options.map((site) => (
              <SelectItem key={site.id} value={site.id} className="text-xs">
                {site.name || site.domain}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      ) : null}
      <Button
        size="sm"
        className="h-8"
        disabled={going}
        onClick={() => {
          setGoing(true);
          router.push(packReviewHref(chosen.brand_id, chosen.id, packId));
        }}
      >
        {going ? (
          <Loader2 className="h-3.5 w-3.5 animate-spin" />
        ) : (
          <ArrowRight className="h-3.5 w-3.5" />
        )}
        Use on {options.length > 1 ? "this site" : (chosen.name || chosen.domain)}
      </Button>
    </div>
  );
}

export function PackDetailPanel({
  item,
  onBack,
  organizationId,
}: {
  item: LibraryResource;
  /** Mobile: return to the list pane. */
  onBack: () => void;
  /** For the "why you have this" door into the org's industry opt-ins. */
  organizationId: string | null;
}) {
  const detail = useQuery({
    queryKey: starterPackDetailQueryKey(item.id),
    queryFn: ({ signal }) => getStarterPackDetail(item.id, signal),
  });
  const status = STATUS_META[item.status ?? ""] ?? null;
  const pack = detail.data?.pack ?? null;
  // Counts come from the ROWS the detail RPC returned, not from the pack row:
  // `starter_pack_detail` hands back the raw `seo.starter_pack` record, which
  // carries no *_count columns (those are computed by the catalog function).
  // Reading them off `pack` printed a confident 0 next to a list of 40.
  const parts = detail.data;

  return (
    <div className="flex h-full flex-col overflow-hidden">
      <header className="shrink-0 space-y-2 border-b px-4 py-3">
        <div className="flex flex-wrap items-center gap-2">
          <button
            type="button"
            onClick={onBack}
            aria-label="Back to the Library list"
            className="inline-flex h-7 w-7 items-center justify-center rounded-md text-muted-foreground transition-colors hover:bg-muted hover:text-foreground md:hidden"
          >
            <ArrowLeft className="h-4 w-4" />
          </button>
          <Boxes className="h-4 w-4 text-muted-foreground" />
          <h1 className="text-sm font-semibold">{item.name}</h1>
          <span className="rounded bg-secondary px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-secondary-foreground">
            Starter pack
          </span>
          {status ? (
            <span
              className={cn(
                "rounded border px-1.5 py-0.5 text-[10px] font-medium",
                status.tone,
              )}
              title={status.hint}
            >
              {status.label}
            </span>
          ) : null}
          <EntitlementChip
            entitledVia={item.entitledVia}
            industryName={item.entitledIndustryName}
          />
          <div className="ml-auto">
            <UseOnSite packId={item.id} />
          </div>
        </div>
        {item.description ? (
          <p className="text-xs text-muted-foreground">{item.description}</p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-muted-foreground">
          {item.entitledIndustryName ? (
            <span className="inline-flex items-center gap-1">
              <Building2 className="h-3 w-3" />
              {item.entitledIndustryName}
            </span>
          ) : null}
          <span className="tabular-nums">
            {item.subscriberCount} organization
            {item.subscriberCount === 1 ? "" : "s"} using it
          </span>
          {item.slug ? <span className="font-mono">{item.slug}</span> : null}
          <span className="select-all font-mono text-[10px]">{item.id}</span>
        </div>
        {item.entitledVia === "industry" && organizationId ? (
          <p className="text-[11px] text-muted-foreground">
            You have this because your organization is in{" "}
            <Link
              href={`/organizations/${organizationId}/settings`}
              className="font-medium text-primary hover:underline"
            >
              {item.entitledIndustryName ?? "this industry"}
            </Link>
            .
          </p>
        ) : null}
      </header>

      <div className="flex-1 space-y-4 overflow-auto p-4">
        <section className="space-y-2">
          <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
            What it carries
          </h2>
          {detail.isPending ? (
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Loading the pack…
            </div>
          ) : detail.isError ? (
            <div className="text-xs text-destructive">
              {detail.error instanceof Error
                ? detail.error.message
                : "Could not load this pack."}
            </div>
          ) : (
            <>
              <div className="flex flex-wrap gap-1.5">
                <Stat
                  icon={TreePine}
                  count={parts?.topics.length ?? 0}
                  label="topics"
                />
                <Stat
                  icon={ListChecks}
                  count={parts?.meaning.length ?? 0}
                  label="meanings"
                />
                <Stat
                  icon={Layers}
                  count={parts?.value_bands.length ?? 0}
                  label="value bands"
                />
                <Stat
                  icon={Layers}
                  count={parts?.geo_bands.length ?? 0}
                  label="geo bands"
                />
                <Stat
                  icon={MapPinned}
                  count={parts?.geo_areas.length ?? 0}
                  label="geo areas"
                />
              </div>
              {pack?.guidelines ? (
                <div>
                  <p className="mb-1 flex items-center gap-1.5 text-[11px] font-medium text-foreground">
                    <BookOpenCheck className="h-3.5 w-3.5 text-muted-foreground" />
                    Business guidelines
                  </p>
                  {/* Bounded and pre-wrapped, exactly as the site's own pack
                      review screen shows it — a guidelines document is pages of
                      prose, and printing it as one paragraph made the previous
                      pack UI unreadable. */}
                  <pre className="max-h-48 overflow-auto whitespace-pre-wrap rounded-md border border-border bg-muted/40 p-2 text-[11px] leading-relaxed text-muted-foreground scrollbar-thin">
                    {pack.guidelines}
                  </pre>
                </div>
              ) : null}
              <PackPreviewLists detail={detail.data ?? null} />
            </>
          )}
        </section>

        <p className="flex items-start gap-1.5 text-[11px] text-muted-foreground/80">
          <BadgeCheck className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          A starter pack is COPIED onto the site you choose — additive and
          idempotent, never over a ruling that site already made. Every row stays
          yours to edit afterwards.
        </p>
      </div>
    </div>
  );
}

/** The first rows of each part, so the catalog shows the real pack. */
function PackPreviewLists({
  detail,
}: {
  detail: { topics: { item_id: string; name: string }[]; meaning: { item_id: string; label: string }[] } | null;
}) {
  if (!detail) return null;
  const topics = detail.topics.slice(0, 8);
  const meanings = detail.meaning.slice(0, 8);
  if (topics.length === 0 && meanings.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        This pack has no rows yet.
      </p>
    );
  }
  return (
    <div className="grid gap-3 md:grid-cols-2">
      {topics.length > 0 ? (
        <div className="rounded-md border">
          <div className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Topics
          </div>
          <ul className="divide-y">
            {topics.map((t) => (
              <li key={t.item_id} className="px-3 py-1.5 text-xs">
                {t.name}
              </li>
            ))}
            {detail.topics.length > topics.length ? (
              <li className="px-3 py-1.5 text-[11px] text-muted-foreground">
                +{detail.topics.length - topics.length} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
      {meanings.length > 0 ? (
        <div className="rounded-md border">
          <div className="border-b bg-muted/40 px-3 py-1.5 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Meanings
          </div>
          <ul className="divide-y">
            {meanings.map((item) => (
              <li key={item.item_id} className="px-3 py-1.5 text-xs">
                {item.label}
              </li>
            ))}
            {detail.meaning.length > meanings.length ? (
              <li className="px-3 py-1.5 text-[11px] text-muted-foreground">
                +{detail.meaning.length - meanings.length} more
              </li>
            ) : null}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
