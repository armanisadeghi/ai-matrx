"use client";

/**
 * /marketing/monitoring — the Marketing pillar's FRONT DOOR to monitoring.
 *
 * Monitoring is not one workspace here; it is four questions the platform
 * already answers, and every one of them is answered PER WEBSITE inside that
 * site's own workspace:
 *
 *   Coverage        — who wrote about this brand (`seo.coverage_mention`)
 *   Link changes    — what happened to the links we already have
 *   AI visibility   — whether the answer engines cite us
 *   Reputation      — the cases, publications and narratives behind the tone
 *
 * The pillar route therefore scopes to a site and opens those views. It does
 * NOT re-render them: a second copy of a workspace is the failure this whole
 * front-door pattern exists to avoid.
 *
 * Reviews monitoring and "tell me when something moves" alerting are the parts
 * of the original promise that are genuinely NOT built — so they stay a
 * registered promise (`marketing.monitoring.alerts`) shown on this page rather
 * than quietly dropped.
 */

import { Link2Off, MessagesSquare, Newspaper, ShieldAlert } from "lucide-react";

import { QueryError } from "@/features/marketing/components/shared/MarketingUi";
import { getComingSoon } from "@/lib/coming-soon/registry";
import {
  MarketingDoorBoard,
  MarketingFrontDoorPage,
  MarketingFrontDoorPromise,
  type MarketingDoor,
} from "./MarketingDoorBoard";
import {
  FrontDoorSiteSelect,
  frontDoorSitePath,
  useFrontDoorSite,
} from "./FrontDoorSiteSelect";

const ALERTS_PROMISE_ID = "marketing.monitoring.alerts";

export function MonitoringFrontDoor() {
  const siteState = useFrontDoorSite();
  const promise = getComingSoon(ALERTS_PROMISE_ID);

  const doors: MarketingDoor[] = [];
  if (siteState.site) {
    const sitePath = frontDoorSitePath(siteState.site);
    doors.push(
      {
        label: "Coverage",
        href: `${sitePath}/backlinks?view=coverage`,
        description:
          "Who wrote about this brand, refreshed from the news index every 30 minutes and then verified by our own crawl — most of it never links.",
        Icon: Newspaper,
      },
      {
        label: "Link changes",
        href: `${sitePath}/backlinks?view=changes`,
        description:
          "What happened to the backlinks you already have: new, lost, nofollowed, or re-anchored — written nightly.",
        Icon: Link2Off,
      },
      {
        label: "AI visibility",
        href: `${sitePath}/ai-visibility`,
        description:
          "Ask ChatGPT, Claude, Gemini and Perplexity a real buyer question and see whether they cite you, and which pages they cite.",
        Icon: MessagesSquare,
      },
      {
        label: "Reputation",
        href: `${sitePath}/reputation`,
        description:
          "The decision brief: which published pages hurt, what each one needs, and the pitch angle that fixes it.",
        Icon: ShieldAlert,
      },
    );
  }

  return (
    <MarketingFrontDoorPage
      title="Monitoring"
      lede="What the web is saying, citing, and linking — watched per website. Pick a site and open the view that answers your question."
      toolbar={
        <FrontDoorSiteSelect
          state={siteState}
          basePath="/marketing/monitoring"
          label="Website to monitor"
        />
      }
    >
      {siteState.isError ? (
        <QueryError error={siteState.error} />
      ) : null}

      {doors.length > 0 ? (
        <MarketingDoorBoard
          title={siteState.site ? siteState.site.name : "Views"}
          description="Each view lives in this website's own workspace — this page is the way in, not a second copy."
          doors={doors}
        />
      ) : siteState.isPending || siteState.isError ? null : (
        <p className="rounded-md border border-border bg-card px-3 py-2 text-xs text-muted-foreground">
          Monitoring watches a website. Add one and these views turn on with the
          first crawl.
        </p>
      )}

      {promise ? (
        <MarketingFrontDoorPromise
          label={promise.label}
          promise={promise.promise}
        />
      ) : null}
    </MarketingFrontDoorPage>
  );
}
