"use client";

/**
 * "Get your site ready" — the Search Console setup checklist.
 *
 * THE FIRST CONSUMER of `lib/guided-setup/`. It replaces the hand-rolled gate
 * that used to live at the top of `SiteIntakeWizard`: two dead-end blocks that
 * said "Connect Google Search Console to run the site interview" and "No
 * Search Console data imported yet", each with one button, no memory of where
 * you were, and no way to see what else was still missing.
 *
 * Every step here is exactly one of the three kinds, chosen by what we can
 * genuinely do (Arman's ruling, 2026-08-14):
 *
 *   brand / address / connection  → VERIFIED. We can read the truth from the
 *       site row, so we never ask a human to tell us.
 *   history import                → AUTO. We can perform it, so we do, without
 *       being asked. Google deletes history past ~16 months; every day we wait
 *       is a day that is eventually gone forever.
 *   right property                → CONFIRMED. Only the person who owns the
 *       business knows whether the property they connected is the one they
 *       meant. We hand them both values side by side and let them say.
 */

import type { AppDispatch } from "@/lib/redux/store";
import { registerChecklist } from "@/lib/guided-setup/registry";
import type { CheckResult } from "@/lib/guided-setup/types";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { siteConnectionStatuses } from "@/features/marketing/lib/site-status";
import { parseSiteIntegrations } from "@/features/marketing/data/integrations-schema";
import {
  getGscBackfillStatus,
  getGscFreshness,
} from "@/features/marketing/search-console/data";
import { syncGscSearchPerformance } from "@/features/marketing/search-console/sync";
import type { MarketingSite } from "@/features/marketing/types";

export interface SiteSetupContext {
  site: MarketingSite;
  dispatch: AppDispatch;
}

const integrationsHref = (site: MarketingSite) =>
  `${marketingRoutes.site(site.brand_id, site.id)}/integrations`;

/** The Search Console property this site is bound to, if any. */
function gscProperty(site: MarketingSite): string | null {
  const parsed = parseSiteIntegrations(site.integrations);
  const ref = parsed.googleSearchConsole.resourceRef.trim();
  return ref === "" ? null : ref;
}

export const siteSetupChecklist = registerChecklist<SiteSetupContext>({
  key: "marketing.site_setup",
  title: "Get your site ready",
  description:
    "We check these every time you come back, so if something stops working you'll see it here.",
  completeTitle: "Your site is ready",
  completeDescription:
    "Everything's connected and your search history is in. We keep checking.",
  steps: [
    {
      kind: "verified",
      id: "brand",
      title: "Your site belongs to a brand",
      description:
        "Everything we plan and write for this site is filed under its brand.",
      check: async ({ site }): Promise<CheckResult> =>
        site.brand_id
          ? { status: "pass" }
          : {
              status: "fail",
              reason: "This site isn't filed under a brand yet.",
              fix: { label: "Open your sites", href: marketingRoutes.sites() },
            },
    },
    {
      kind: "verified",
      id: "address",
      title: "Your site has a web address",
      description: "The address we use to match your site to its search data.",
      check: async ({ site }): Promise<CheckResult> =>
        site.domain
          ? { status: "pass", detail: site.domain }
          : {
              status: "fail",
              reason: "We don't have a web address for this site yet.",
              fix: { label: "Add the address", href: integrationsHref(site) },
            },
    },
    {
      kind: "verified",
      id: "search_console",
      title: "Connected to Google Search Console",
      description:
        "This is where Google tells us what people searched for before they found you.",
      dependsOn: ["address"],
      check: async ({ site }): Promise<CheckResult> => {
        const status = siteConnectionStatuses(site).find(
          (entry) => entry.key === "search_console",
        );
        if (!status || status.state === "off") {
          return {
            status: "fail",
            reason: "Google Search Console isn't connected to this site yet.",
            fix: {
              label: "Connect Search Console",
              href: integrationsHref(site),
            },
          };
        }
        if (status.state === "attention") {
          // "Attention" is a real, specific problem with its own words —
          // pass them straight through rather than inventing a summary.
          return {
            status: "fail",
            reason: status.detail,
            fix: { label: "Fix the connection", href: integrationsHref(site) },
          };
        }
        return { status: "pass", detail: gscProperty(site) ?? undefined };
      },
    },
    {
      kind: "auto",
      id: "history",
      title: "Your search history is in",
      description:
        "Google only keeps about 16 months. We pull all of it the moment we can — days we never pull are gone for good.",
      dependsOn: ["search_console"],
      runningLabel: "Bringing in your history — this keeps running if you leave.",
      check: async ({ site }): Promise<CheckResult> => {
        const [rows, backfill] = await Promise.all([
          getGscFreshness(site.id),
          getGscBackfillStatus(site.id),
        ]);
        if (rows.length > 0) {
          const from = rows.reduce(
            (min, row) => (row.min_date < min ? row.min_date : min),
            rows[0].min_date,
          );
          const to = rows.reduce(
            (max, row) => (row.max_date > max ? row.max_date : max),
            rows[0].max_date,
          );
          return { status: "pass", detail: `${from} through ${to}` };
        }
        if (backfill?.active) {
          // Already running server-side. Reporting this as "not done" would
          // make the checklist kick a second import on top of the first.
          return {
            status: "unknown",
            reason:
              "We're pulling your history right now. It keeps going even if you close this page.",
          };
        }
        return {
          status: "fail",
          reason: "We haven't pulled your search history yet.",
        };
      },
      run: async ({ site, dispatch }) => {
        // Detached server work — leaving the page never stops it.
        await syncGscSearchPerformance(dispatch, site.id, site.organization_id, {
          mode: "backfill",
        });
        await syncGscSearchPerformance(
          dispatch,
          site.id,
          site.organization_id,
          {},
        ).catch(() => undefined);
      },
    },
    {
      kind: "confirmed",
      id: "right_property",
      title: "This is the right property",
      description:
        "Google can hold several versions of the same website. Only you can tell us which one is the one you care about.",
      dependsOn: ["search_console"],
      confirmLabel: "Yes, that's the one",
      values: ({ site }) => {
        const property = gscProperty(site);
        return [
          {
            label: "Connected in Google",
            value: property ?? "Nothing connected yet",
            hint: "This is the property we're reading data from.",
          },
          {
            label: "Your site's address",
            value: site.domain ?? "No address set",
            hint: "If these two describe different websites, change the connection.",
          },
        ];
      },
      howTo: () => [
        "Compare the two lines above — they should be the same website.",
        "If they aren't, open Integrations and connect the right property.",
        "A domain property (no https:// in front) covers every version of your site and is usually the one you want.",
      ],
    },
  ],
});
