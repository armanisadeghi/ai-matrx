"use client";

/**
 * C10 — the value receipt's location line, against LIVE data.
 *
 * Why this demo exists: `KeywordLocationLine` normally renders inside the value
 * receipt, and a receipt is only reachable for a keyword with traffic in the
 * current 28-day window. The keywords that actually RESOLVE to a location today
 * (titaniummarketing.com's Irvine searches) last had impressions in July, so the
 * one state that matters most — "Irvine, CA — because you bound the service area
 * that covers Irvine to it" — could not be seen anywhere in the product. This
 * page calls the same live RPC with the same real ids, so the resolved, the
 * unresolved and the silent cases can each be looked at.
 *
 * Nothing here is mocked: real site, real keyword ids, real
 * `seo.gsc_keyword_locations`. Change the ids when the sample data moves on.
 */

import { KeywordLocationLine } from "@/features/marketing/seo/value-system/locations/KeywordLocationLine";

const TITANIUM_SITE = "0fdcd5ea-39f9-4273-82cc-7329fd5a4ca7";
const TITANIUM_BRAND = "1b97568e-0c2d-4ecb-9957-8d21f919ceb2";
const DATA_DESTRUCTION_SITE = "38eff4c9-b021-451a-b995-7d9b3d17db5e";

const CASES: Array<{
  title: string;
  expect: string;
  siteId: string;
  brandId: string | null;
  keywordId: string;
  isLocal: boolean | null;
}> = [
  {
    title: "Resolved — “internet marketing irvine”",
    expect:
      "Names the location, its city and state, and that a human binding decided it.",
    siteId: TITANIUM_SITE,
    brandId: TITANIUM_BRAND,
    keywordId: "40f58e05-ad70-4658-83e5-7ed9322406f6",
    isLocal: true,
  },
  {
    title: "Resolved — “technology marketing irvine”",
    expect: "Same location, reached by the same bound area.",
    siteId: TITANIUM_SITE,
    brandId: TITANIUM_BRAND,
    keywordId: "60cc7afc-6ed2-4056-ac0f-08d57d79425c",
    isLocal: true,
  },
  {
    title: "Local, but unplaced — a datadestruction.com city search",
    expect:
      "Says the search is local and that nothing yet says which location, with a door to the location list.",
    siteId: DATA_DESTRUCTION_SITE,
    brandId: "52a7eea1-0260-4a6f-a392-90bea1dda941",
    keywordId: "40f58e05-ad70-4658-83e5-7ed9322406f6",
    isLocal: true,
  },
  {
    title: "Not local — the same keyword with no geo evidence in its chain",
    expect: "Renders NOTHING. Silence beats noise in every receipt on the site.",
    siteId: DATA_DESTRUCTION_SITE,
    brandId: "52a7eea1-0260-4a6f-a392-90bea1dda941",
    keywordId: "40f58e05-ad70-4658-83e5-7ed9322406f6",
    isLocal: null,
  },
];

export default function KeywordLocationLineDemo() {
  return (
    <div className="mx-auto max-w-2xl space-y-4 p-6">
      <div>
        <h1 className="text-base font-semibold text-foreground">
          Value receipt — which location, and how we decided
        </h1>
        <p className="mt-1 text-xs text-muted-foreground">
          Live <code>seo.gsc_keyword_locations</code>, real sites, real keyword
          ids. C10.
        </p>
      </div>
      <ul className="space-y-3">
        {CASES.map((testCase, index) => (
          <li
            key={`${testCase.keywordId}-${index}`}
            className="space-y-1.5 rounded-md border border-border bg-card p-3"
          >
            <p className="text-xs font-medium text-foreground">
              {testCase.title}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {testCase.expect}
            </p>
            <div className="rounded border border-dashed border-border bg-muted/20 p-2">
              <KeywordLocationLine
                siteId={testCase.siteId}
                brandId={testCase.brandId}
                keywordId={testCase.keywordId}
                isLocal={testCase.isLocal}
              />
            </div>
          </li>
        ))}
      </ul>
    </div>
  );
}
