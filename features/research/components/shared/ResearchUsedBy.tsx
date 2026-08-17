"use client";

/**
 * ResearchUsedBy — the FORWARD half of research lineage (before/during/after
 * doctrine, docs/handoffs/cms-page-hub.md item 6).
 *
 * The reverse direction has long existed: a CMS page/site lists the research
 * behind it (`features/cms/hooks/useCmsResearchLineage.ts` over
 * `platform.associations`). This is the same edge read inverted — a research
 * topic or tag lists the sites, plan pages, and canonical pages that consume
 * it, each one a door (THE DOOR LAW). One canonical association read
 * (`useAssociations`), the shared title resolver, and the entity registry's
 * flat resolver routes — no new data path.
 */

import { ExternalLink } from "lucide-react";

import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { useAssociations } from "@/features/scopes/hooks/useAssociations";
import { useEntityTitles } from "@/features/scopes/hooks/useEntityTitles";
import { getEntityInfo } from "@/features/scopes/registry/entityRegistry";
import type { EntityTypeToken } from "@/types/generated/entity-types.generated";

const CONSUMER_TOKENS = ["web_site", "plan_node", "web_page"] as const;
type ConsumerToken = (typeof CONSUMER_TOKENS)[number];

const CONSUMER_LABEL: Record<ConsumerToken, string> = {
  web_site: "Site",
  plan_node: "Plan page",
  web_page: "Canonical page",
};

function isConsumerToken(value: string): value is ConsumerToken {
  return (CONSUMER_TOKENS as readonly string[]).includes(value);
}

export interface ResearchUsedByProps {
  /** Which research entity this surface shows. */
  token: Extract<EntityTypeToken, "research_topic" | "research_tag">;
  id: string | null;
}

export function ResearchUsedBy({ token, id }: ResearchUsedByProps) {
  const assoc = useAssociations({ type: token, id });

  const consumers = assoc.edges.flatMap((edge) =>
    isConsumerToken(edge.otherType)
      ? [{ token: edge.otherType, id: edge.otherId, label: edge.label }]
      : [],
  );
  // One edge per (token, id) — a topic inherited through several roles is
  // still one consumer.
  const unique = consumers.filter(
    (item, index, all) =>
      all.findIndex(
        (other) => other.token === item.token && other.id === item.id,
      ) === index,
  );
  const titles = useEntityTitles(unique);

  if (!id) return null;

  return (
    <section className="space-y-1.5">
      <h3 className="text-xs font-semibold text-foreground">Used by</h3>
      {assoc.status === "error" ? (
        <p className="text-xs text-destructive">
          The places using this research could not be loaded
          {assoc.error ? `: ${assoc.error}` : "."}
        </p>
      ) : unique.length > 0 ? (
        <ul className="space-y-1">
          {unique.map((item) => {
            const info = getEntityInfo(item.token);
            const href = info.hrefFor?.(item.id);
            const title = titles.titleFor(item);
            return (
              <li
                key={`${item.token}:${item.id}`}
                className="flex items-baseline gap-2 text-xs"
              >
                <span className="shrink-0 text-muted-foreground">
                  {CONSUMER_LABEL[item.token]}
                </span>
                {href ? (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex min-w-0 items-center gap-1 font-medium text-primary hover:underline underline-offset-2"
                  >
                    <span className="truncate">{title}</span>
                    <ExternalLink className="h-3 w-3 shrink-0" />
                  </a>
                ) : (
                  <span className="truncate font-medium text-foreground">
                    {title}
                  </span>
                )}
              </li>
            );
          })}
        </ul>
      ) : assoc.status === "ready" ? (
        <p className="text-xs text-muted-foreground">
          Nothing consumes this research yet. Attach it to a site, plan page,
          or canonical page from that record&apos;s research panel, and it
          shows up here.
        </p>
      ) : (
        <p className="text-xs text-muted-foreground">
          <SuspenseLoader centered={false} size="xs" message="Loading research usage…" />
        </p>
      )}
    </section>
  );
}
