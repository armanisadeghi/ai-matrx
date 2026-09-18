// features/marketing/seo/topical-map/views/table/__fixtures__/allGreenPageIntents.ts
//
// 🚨 RECORDED, NOT WRITTEN. Two answers of `seo.list_page_intents` on the live
// database (project brsgrqvjdzwihsvnfqkf), 2026-09-18, read as the test admin
// (`request.jwt.claims.sub = 87a6e699-…`, role `authenticated`, both
// `set_config(…, true)`), for the All Green map + site, narrowed by disposition:
//
//   list_page_intents(map, site, null, 'move',     null, 1000, 0) → total 1
//   list_page_intents(map, site, null, 'redirect', null, 1000, 0) → total 19
//
// These are the only dispositions that can produce a LEAVING or ARRIVING
// count (keep/rewrite/delete never do — see `pageIntentTone`). The recording
// carries a truth nobody would have typed by hand: all 19 redirects send a page
// into another page OF THE SAME TOPIC, so their topic row draws them as
// in_place — the page leaves the site, not the topic — and only the one move
// (data destruction → sewing machines, a human-placed page) moves a count.
//
// Notes are the agent's own words as stored; nothing was edited. The three
// helpers below only factor the fields the 19 redirect rows repeat verbatim
// (the page shape, the `into` shape, the CRT coverage row); every value they
// are called with is the recorded one.

import type { PageIntentsResult } from "../../../types";

export const RECORDED_ALL_GREEN_MOVE_INTENTS: PageIntentsResult = {
  items: [
    {
      page: {
        id: "b90d8883-c20c-41b2-893b-ec7420b0f44d",
        url: "https://allgreenrecycling.com/certified-sewing-machine-recycling",
        type: "web_page",
        label: "https://allgreenrecycling.com/certified-sewing-machine-recycling",
        clicks: 57,
        site_id: "d0aff5b6-0710-4848-8304-164db3c80ab7",
        impressions: 1301,
        performance_window_days: 28,
      },
      intent: {
        note: "Earned 59 clicks and 2 backlinks, but covers sewing machine recycling rather than data destruction; belongs on sewing-machine-recycling.",
        state: "proposed",
        topic: { name: "Sewing Machine Recycling", slug: "sewing-machine-recycling" },
        source: "agent",
        updated_at: "2026-09-17T18:46:09.860563+00:00",
        disposition: "move",
      },
      current_topics: [
        { name: "Data Destruction Services", slug: "data-destruction-services", source: "human", confidence: 100 },
      ],
    },
  ],
  limit: 1000,
  total: 1,
  offset: 0,
  duplicate_intents: 0,
  performance_window_days: 28,
} as PageIntentsResult;

const CRT = { name: "CRT and TV Recycling", slug: "crt-and-tv-recycling" };
const SITE = "d0aff5b6-0710-4848-8304-164db3c80ab7";
const CRT_PILLAR = {
  id: "2aafdb72-7113-475b-bb39-e5943dcc2849",
  url: "https://allgreenrecycling.com/crt-tv-recycling",
  type: "web_page",
  label: "https://allgreenrecycling.com/crt-tv-recycling",
  status: "active",
};

function page(id: string, url: string, clicks: number, impressions: number) {
  return { id, url, type: "web_page", label: url, clicks, site_id: SITE, impressions, performance_window_days: 28 };
}
function into(id: string, url: string) {
  return { id, url, type: "web_page", label: url, status: "active" };
}
function covers(confidence: number, extra?: { name: string; slug: string; confidence: number }) {
  const rows = [{ ...CRT, source: "mapper", confidence }];
  return extra ? [...rows, { name: extra.name, slug: extra.slug, source: "mapper", confidence: extra.confidence }] : rows;
}

export const RECORDED_ALL_GREEN_REDIRECT_INTENTS: PageIntentsResult = {
  items: [
    { page: page("a02c4878-d32c-4f4f-ad89-58b5801284c2", "https://allgreenrecycling.com/5-old-ugly-tvs/amp", 0, 14), intent: { into: into("61699d0f-d66a-4eaf-a609-f04bcbb36c65", "https://allgreenrecycling.com/5-old-ugly-tvs"), note: "AMP alternate with 14 impressions; redirect into its live canonical page 5-old-ugly-tvs.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(68, { name: "Consumer Electronics Recycling", slug: "consumer-electronics-recycling", confidence: 60 }) },
    { page: page("7a36a359-dca0-4307-976c-d30f2edd9b3c", "https://allgreenrecycling.com/5-tv-recycling-essentials/amp", 0, 190), intent: { into: into("f6a8e8e9-3d4e-4c98-8558-39b10549dd5e", "https://allgreenrecycling.com/5-tv-recycling-essentials"), note: "AMP alternate with 197 impressions; redirect into its live canonical page 5-tv-recycling-essentials.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("f81a3958-0d24-43b9-8307-6ceb2f504c42", "https://allgreenrecycling.com/allgreenrecycling.com/what-is-a-crt-tv", 0, 1), intent: { into: CRT_PILLAR, note: "Malformed domain-doubled URL with 0 clicks and 1 impression; redirect to the primary crt-tv-recycling pillar page.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("10233307-07b4-4b91-bcc2-d324a80b59b4", "https://allgreenrecycling.com/certified-plasma-tv-recycling?landing_page=https://allgreenrecycling.com/location/&keyword=None%20Found", 0, 0), intent: { into: into("38d7fdff-2b67-459d-b3d7-bb1c72169edf", "https://allgreenrecycling.com/certified-plasma-tv-recycling"), note: "Query-string tracking parameter alternate; redirect into canonical certified-plasma-tv-recycling page.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("104d9804-b6e2-4101-a67e-7b7e6750d121", "https://allgreenrecycling.com/crt-monitor-recycling", 0, 248), intent: { into: into("dd22abbc-d214-47f5-a84f-788762147107", "https://allgreenrecycling.com/certified-monitor-recycling"), note: "Zero-click CRT monitor page with 257 impressions; redirect into certified-monitor-recycling, the 2,463-word monitor pillar with 484 internal links.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T17:46:41.386336+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("6c21d7f5-c58f-491b-8c41-12b42ebf7d21", "https://allgreenrecycling.com/crt-recycling", 1, 721), intent: { into: CRT_PILLAR, note: "Direct keyword duplicate of crt-tv-recycling, which dominates impressions (3,343 vs 742); redirect consolidates equity and ranking into the 3,018-word pillar.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T17:46:41.386336+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("52537e19-08c8-47d9-adb6-fa445b776920", "https://allgreenrecycling.com/crt-television-recycling", 1, 118), intent: { into: CRT_PILLAR, note: "Direct synonym duplicate of crt-tv-recycling with 1 click and 122 impressions; redirect into the primary 3,018-word pillar to consolidate topical authority.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T17:46:41.386336+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("733b2a0f-e007-4be3-b1aa-2c899281970a", "https://allgreenrecycling.com/crts-how-a-tv-works/amp", 0, 54), intent: { into: into("932724ca-510c-47d8-8ecf-02d4b58364f1", "https://allgreenrecycling.com/crts-how-a-tv-works"), note: "AMP alternate with 55 impressions; redirect into its live canonical page crts-how-a-tv-works. [changed to redirect: this is the amp rendition of https://allgreenrecycling.com/crts-how-a-tv-works, which is live — a second address for one page is sent to its canonical, never judged on its own]", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(68) },
    { page: page("b697983f-96aa-4394-9356-2883dddd50fa", "https://allgreenrecycling.com/fish-tank-made-from-crt-tv/amp", 0, 128), intent: { into: into("7f5fa6cc-0ae3-4db5-a0da-6885afb35d9c", "https://allgreenrecycling.com/fish-tank-made-from-crt-tv"), note: "AMP alternate holding 132 impressions; redirect into its live canonical page fish-tank-made-from-crt-tv. [changed to redirect: this is the amp rendition of https://allgreenrecycling.com/fish-tank-made-from-crt-tv, which is live — a second address for one page is sent to its canonical, never judged o", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(60) },
    { page: page("408c8671-5ae5-497f-8d16-5aa671397575", "https://allgreenrecycling.com/how-to-dispose-of-old-tv", 0, 147), intent: { into: CRT_PILLAR, note: "Near-duplicate TV disposal query with zero clicks and 153 impressions; redirect into the primary crt-tv-recycling pillar to unite search intent.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T17:46:41.386336+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("6a24f41f-5475-4514-a887-24f02d9df791", "https://allgreenrecycling.com/news/ugly-tv-contest?nonamp=1/", 0, 0), intent: { into: into("516091dc-9739-4749-9a8b-2cb9dd3dded4", "https://allgreenrecycling.com/news/ugly-tv-contest"), note: "Query-string parameter alternate; redirect into canonical news/ugly-tv-contest page. [changed to redirect: this is the query-string rendition of https://allgreenrecycling.com/news/ugly-tv-contest, which is live — a second address for one page is sent to its canonical, never judged on its own]", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(60) },
    { page: page("ecdc28c9-69c8-4d90-879b-b43f1ec2d00d", "https://allgreenrecycling.com/recycling-old-tvs-responsibly/amp", 1, 170), intent: { into: into("82f6f46b-f458-4192-a29a-00c08984131e", "https://allgreenrecycling.com/recycling-old-tvs-responsibly"), note: "AMP alternate with 1 click and 177 impressions; redirect into its live canonical page recycling-old-tvs-responsibly. [changed to redirect: this is the amp rendition of https://allgreenrecycling.com/recycling-old-tvs-responsibly, which is live — a second address for one page is sent to its canonical,", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70, { name: "Consumer Electronics Recycling", slug: "consumer-electronics-recycling", confidence: 62 }) },
    { page: page("18b1f022-6d9a-4a9d-a8e5-462473536773", "https://allgreenrecycling.com/tv-recycling-process/amp", 0, 15), intent: { into: into("6fe9ccc3-fc7d-4cb6-9649-f61abec20d7c", "https://allgreenrecycling.com/tv-recycling-process"), note: "AMP alternate with 15 impressions; redirect into its live canonical page tv-recycling-process. [changed to redirect: this is the amp rendition of https://allgreenrecycling.com/tv-recycling-process, which is live — a second address for one page is sent to its canonical, never judged on its own]", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("6cb68187-761f-4428-84bd-1dd6f8c5ea20", "https://allgreenrecycling.com/ugliest-tv-contest", 0, 9), intent: { into: CRT_PILLAR, note: "Defunct contest page with zero clicks and only 9 impressions; redirect to the main CRT TV recycling page to preserve any residual equity.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T17:46:41.386336+00:00", disposition: "redirect" }, current_topics: covers(61) },
    { page: page("68d9e6e1-c589-4d54-8f6d-3806a7d836ad", "https://allgreenrecycling.com/what-is-a-crt-tv?landing_page=https://allgreenrecycling.com/types-of-recycling/&keyword=None%20Found", 0, 0), intent: { into: CRT_PILLAR, note: "Tracking parameter URL with zero traffic and no links; redirect into crt-tv-recycling pillar.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("3b3788e9-623f-4e43-9400-edfe1712d5e6", "https://allgreenrecycling.com/what-is-an-older-crt-tv", 0, 1), intent: { into: CRT_PILLAR, note: "Zero clicks, 1 impression, no backlinks, and duplicate of crt-tv-recycling; redirect into that stronger sibling.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("c5354be9-53cd-4e36-947d-c81662de5814", "https://allgreenrecycling.com/what-is-data-destruction/amp", 0, 1906), intent: { into: into("8d3da6b8-a7a7-44c4-a0aa-c65d749dd61b", "https://allgreenrecycling.com/what-is-data-destruction"), note: "AMP variant with 2,000 impressions; redirecting to the canonical live address https://allgreenrecycling.com/what-is-data-destruction. [changed to redirect: this is the amp rendition of https://allgreenrecycling.com/what-is-data-destruction, which is live — a second address for one page is sent to it", state: "proposed", topic: { name: "Data Destruction Services", slug: "data-destruction-services" }, source: "agent", updated_at: "2026-09-17T18:46:13.343318+00:00", disposition: "redirect" }, current_topics: [{ name: "Data Destruction Services", slug: "data-destruction-services", source: "mapper", confidence: 70 }] },
    { page: page("9143a30a-ba65-4e28-a8ce-d58aaac6348e", "https://allgreenrecycling.com/where-can-i-recycle-old-tvs/amp", 0, 202), intent: { into: into("ca26e487-5733-4e37-9b6f-7b15ea712fdb", "https://allgreenrecycling.com/where-can-i-recycle-old-tvs"), note: "AMP alternate with 220 impressions; redirect into its live canonical page where-can-i-recycle-old-tvs. [changed to redirect: this is the amp rendition of https://allgreenrecycling.com/where-can-i-recycle-old-tvs, which is live — a second address for one page is sent to its canonical, never judged on", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(70) },
    { page: page("88c9ef64-e4f8-4aa1-b2be-7bcc13ee1a67", "https://allgreenrecycling.com/where-to-recycle-old-tvs/amp", 13, 615), intent: { into: into("a5708eb9-9130-46ff-8a45-02c85c72befe", "https://allgreenrecycling.com/where-to-recycle-old-tvs"), note: "AMP alternate with 13 clicks; redirect into the live canonical page where-to-recycle-old-tvs to consolidate search equity.", state: "proposed", topic: CRT, source: "agent", updated_at: "2026-09-17T18:47:10.29239+00:00", disposition: "redirect" }, current_topics: covers(75) },
  ],
  limit: 1000,
  total: 19,
  offset: 0,
  duplicate_intents: 0,
  performance_window_days: 28,
} as PageIntentsResult;
