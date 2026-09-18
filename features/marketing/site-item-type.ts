/**
 * 🚨 F-87 — A SITE IS A RECORD, AND A RECORD OPENS IN PLACE.
 *
 * `web_site` (`web.site`, 49 rows read live 2026-09-18) is the Marketing
 * module's central identity: every Search Console number, every crawl, every
 * page, every keyword belongs to one. It has been a registered
 * `platform.entity_types` token with a route and a generic peek for months —
 * but it was NOT in the item-presentation registry, which is THE type map the
 * Detail primitive (`lib/detail`) reads. So:
 *
 *   * `useOpenItemPresentation("web_site", id)` returned `false`, and F-86's new
 *     door on the Google marketing answer (`RecordDoor` in
 *     `GoogleMarketingResultBlock.tsx`) rendered NOTHING — a control that cannot
 *     open renders absent by design, so the reader of "412 clicks" still had no
 *     way to reach the site the number is about;
 *   * `resolveItemDetailType("web_site")` resolved the neutral fallback
 *     (`load === null`), so `/detail/web_site/<id>` — a URL anyone can build,
 *     and the address the entity registry gives several tokens — said nothing
 *     about a record that is fully stored;
 *   * every reference chip the envelope resolves for the `web_site` noun
 *     (`features/matrx-envelope/referenceResolvers.ts`, the catalog-derived
 *     path) had the same dead Open.
 *
 * ONE registration closes all three, exactly as `party` (F-40) and the two
 * Google records (F-63) did. There is no new Site renderer here and no second
 * type map.
 *
 * WHERE A CLICK GOES, AND WHY. The platform already owns a site Quick view —
 * `SitePeekWindow`, the floating panel the Sites portfolio and the Content Plan
 * list open on a row — so the click opens THAT, through
 * `features/window-panels/windows/marketing/SiteQuickViewWindow.tsx`, which adds
 * only the canonical single-site read (`getSiteListRow`) a door needs and no
 * body of its own (THE PANEL WRAPS THE CANONICAL COMPONENT). The `detailSource`
 * below is still declared and still used: `/detail/web_site/<id>` is a URL
 * anyone can build, and the Detail primitive reads the row through THE type map
 * — the same split a file has (bespoke preview window for the click,
 * `detailSource` for the record view).
 *
 * The FULL site workspace stays a route. `features/marketing/components/site/
 * SiteOverview.tsx` (1,697 lines) calls `useMarketingSite()`, which THROWS
 * outside a `MarketingSiteProvider` whose value the route layout assembles (the
 * site row, its brand-first `sitePath`, the owning `brandId`, live
 * `SiteCrawlActivity`), so it is not a panel body today — and both the Quick
 * view and the record's own doors reach it at the canonical route the entity
 * registry resolves (`/marketing/sites/<id>`, which redirects to the
 * brand-first address). Making the workspace itself mountable from a record is
 * a refactor of that provider chain, reported rather than attempted here.
 *
 * WHAT THIS FILE ADDS OVER THE GENERIC COMPOSITION, and only this: the curated
 * field list. `web.site` carries five jsonb columns (`gsc_sync`,
 * `initialization`, `integrations`, `metadata`, `settings`), a `previous_slugs`
 * array, `version`, and three image URLs; the generic `fieldsFromRow` walks
 * `select *` in PostgREST key order and would dump all of them — the same
 * defect N5 found in the Person dossier, where plumbing arrived before the
 * record's own name. This is a CLOSED list in the order a person asks about a
 * site, so a column added to `web.site` tomorrow does not silently appear.
 */

import { Globe } from "lucide-react";

import type { ItemTypeConfig } from "@/features/item-presentation/registry";
import type { EnrichedItem } from "@/features/item-presentation/types";
import { formatWhen } from "@/lib/detail/format";
import type {
  DetailField,
  DetailRecordType,
  DetailRow,
} from "@/lib/detail/types";
import { visibilityWords } from "@/lib/record-words";

/** The item-presentation type token — the SAME word as the entity token. */
export const WEB_SITE_TYPE = "web_site" as const;

function text(row: DetailRow, key: string): string | null {
  const value = row[key];
  if (typeof value !== "string") return null;
  return value.trim() || null;
}

function titleCase(value: string): string {
  return value
    .replace(/[_-]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

/**
 * The site's own facts, in the order a person asks for them. Nothing outside
 * this list is shown; an absent value is simply not a field (law 4 — never an
 * empty row that implies the value is blank).
 */
export function siteFields(row: DetailRow): DetailField[] {
  const out: DetailField[] = [];
  const push = (
    key: string,
    label: string,
    value: string | null,
    ref?: DetailField["ref"],
  ) => {
    if (!value) return;
    out.push({ key, label, text: value, ...(ref ? { ref } : {}) });
  };

  // The address IS the site, to a person. It leads.
  push("root_url", "Address", text(row, "root_url"));
  push("domain", "Domain", text(row, "domain"));
  push("description", "What it is", text(row, "description"));
  const status = text(row, "status");
  push("status", "Status", status ? titleCase(status) : null);
  // The owning marketing account — a door, on the token that actually names it
  // (`brand_id` → `web_brand`; the generic column→token rule would derive
  // "brand", which names nothing, so the record would lose the door).
  const brandId = text(row, "brand_id");
  if (brandId) {
    out.push({
      key: "brand_id",
      label: "Marketing account",
      text: brandId,
      ref: { token: "web_brand", id: brandId },
    });
  }
  push("visibility", "Who can see it", visibilityWords(row.visibility));
  // Search Console's own last read of this site. Only 7 of 49 sites carry one
  // (read live 2026-09-18), and a site that has never synced simply has no
  // field here rather than a "Never" that reads like a failure.
  const gsc = text(row, "gsc_synced_at");
  push(
    "gsc_synced_at",
    "Search Console last read",
    gsc ? formatWhen(gsc) : null,
  );
  const created = text(row, "created_at");
  push("created_at", "Added", created ? formatWhen(created) : null);
  const updated = text(row, "updated_at");
  push("updated_at", "Last changed", updated ? formatWhen(updated) : null);
  return out;
}

/** The refinement the registry hands to `resolveItemDetailType`. */
export function refineSiteDetail(base: DetailRecordType): DetailRecordType {
  return {
    ...base,
    fields: (row) => siteFields(row),
  };
}

/**
 * The registry entry. `entityToken` is omitted because the item type and the
 * entity token are the SAME word — `web_site` is the registered
 * `platform.entity_types` token (`web.site`, title column `name`), which is
 * what gives the record its route, its peek, its associations and its history.
 * A twin token spelled `site` would resolve to nothing and is exactly the
 * defect this file closes.
 */
export const WEB_SITE_ITEM_TYPE: ItemTypeConfig = {
  type: WEB_SITE_TYPE,
  label: "Site",
  // `Globe` is the icon the entity registry already gives `web_site`, so the
  // record, the reference chip and the marketing lists agree.
  icon: Globe,
  accent: {
    text: "text-sky-600 dark:text-sky-400",
    bg: "bg-sky-500/10",
    ring: "ring-sky-500/20",
  },
  // 🚨 THE DISCRIMINANT THAT WAS MISSING — without it every door above is
  // absent or dead. It routes to the site Quick view (see above).
  open: { kind: "web_site" },
  detailSource: { table: "site", schemaName: "web", titleField: "name" },
  refineDetail: refineSiteDetail,
  enrich: (supabase, id) =>
    (async (): Promise<EnrichedItem> => {
      const { data, error } = await supabase
        .schema("web")
        .from("site")
        .select("name, domain, description, status")
        .eq("id", id)
        .maybeSingle();
      if (error) return {};
      if (!data) return { notFound: true };
      const row = data as unknown as DetailRow;
      const status = text(row, "status");
      return {
        name: text(row, "name") ?? undefined,
        about: text(row, "description") ?? text(row, "domain") ?? undefined,
        details: [
          text(row, "domain")
            ? { label: "Domain", value: text(row, "domain")! }
            : null,
          status ? { label: "Status", value: titleCase(status) } : null,
        ].filter(Boolean) as EnrichedItem["details"],
      };
    })(),
};
