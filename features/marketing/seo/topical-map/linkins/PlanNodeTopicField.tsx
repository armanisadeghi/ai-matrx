"use client";

/**
 * The plan node's TOPIC field (placement §7 #5, R3): which map topic this
 * planned page is written for. Writes `plan.node.topic_id` — the canonical
 * node→topic link from this round on; the associations path keeps being read
 * until the backfill (R3). The options are the live topics of the map the
 * node's SITE uses (`seo.site_map_id` → `seo.map_topic`), because a planned
 * page belongs to a site and a site uses one map.
 *
 * The field reports the chosen id up (the panel's own draft/save owns the
 * write, exactly like every other field there) and names the current topic
 * with a door into the map. No map on the site → the field says so and offers
 * to start one; it is never a blank select.
 */

import Link from "next/link";
import { ExternalLink, Loader2 } from "lucide-react";

import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

import { startMapHref } from "../components/TopicalMapHome";
import { topicalMapErrorText } from "../errors";
import { useMapTopicRows } from "../hooks";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { useSiteTopicalMapLink } from "./useSiteTopicalMapLink";
import { ErrorNotice } from "@/components/errors/ErrorNotice";

const NONE = "__none__";

export function PlanNodeTopicField({
  siteId,
  brandSeg,
  value,
  onChange,
  disabled,
}: {
  siteId: string;
  brandSeg: string | null;
  /** `plan.node.topic_id` as drafted. */
  value: string | null;
  onChange: (topicId: string | null) => void;
  disabled?: boolean;
}) {
  const link = useSiteTopicalMapLink(siteId, brandSeg);
  // access-errors: ok — rendered verbatim.
  const topics = useMapTopicRows(link.mapId ?? "", link.status === "ready");

  if (link.status === "loading") {
    return (
      <p className="flex items-center gap-1 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin" aria-hidden />
        Finding this site&apos;s map…
      </p>
    );
  }
  if (link.status === "error") {
    return (
      <ErrorNotice size="inline" className="text-xs" message={link.error} />
    );
  }
  if (link.status === "none") {
    return (
      <p className="text-xs text-muted-foreground">
        This site uses no topical map yet.{" "}
        {brandSeg ? (
          <Link href={startMapHref(brandSeg, { source: "data", siteId })} className="underline">
            Start one from its data
          </Link>
        ) : null}
      </p>
    );
  }
  if (topics.isError) {
    return (
      <ErrorNotice size="inline" className="text-xs" message={topicalMapErrorText(topics.error)} />
    );
  }

  const rows = (topics.data ?? []).filter((t) => t.status === "active");
  const current = value ? (topics.data ?? []).find((t) => t.id === value) ?? null : null;
  const orphan = value && !current && !topics.isPending;

  return (
    <div className="grid gap-1">
      <Select
        value={value ?? NONE}
        onValueChange={(v) => onChange(v === NONE ? null : v)}
        disabled={disabled || topics.isPending}
      >
        <SelectTrigger className="h-8 text-xs" aria-label="Map topic this page is written for">
          <SelectValue placeholder={topics.isPending ? "Loading topics…" : "No topic"} />
        </SelectTrigger>
        <SelectContent>
          <SelectItem value={NONE}>No topic</SelectItem>
          {orphan ? (
            // A linked topic the map no longer lists live (retired/rejected)
            // still renders — hiding it would show "No topic" for a real link.
            <SelectItem value={value as string}>Linked topic (not live on this map)</SelectItem>
          ) : null}
          {rows.map((t) => (
            <SelectItem key={t.id} value={t.id}>
              {t.name}
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
      {current ? (
        <Link
          href={
            brandSeg
              ? `${marketingRoutes.brandTopicalMap(brandSeg, link.mapId)}?topic=${encodeURIComponent(current.slug)}`
              : `${marketingRoutes.topicalMapDoor(link.mapId)}?topic=${encodeURIComponent(current.slug)}`
          }
          className="inline-flex items-center gap-1 text-[11px] text-muted-foreground underline"
        >
          <ExternalLink className="h-3 w-3" aria-hidden />
          Open {current.name} in the map
        </Link>
      ) : null}
    </div>
  );
}
