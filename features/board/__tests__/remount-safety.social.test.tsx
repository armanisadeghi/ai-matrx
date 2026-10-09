/**
 * Remount safety — the social items: post, profile, outlier feed, ad, swipe collection.
 *
 * SUT: each type's `Body` from `items/catalog.ts` (`items/social-items.tsx`), mounted as the board mounts a
 * tile (`remount-safety/harness.tsx`) inside the board's organization, over the real store and the recording
 * service boundary. The break each case catches is named above it.
 */

jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));

import { BOARD_ITEM_TYPES } from "../items/catalog";
import { BoardOrganizationProvider } from "../items/board-organization";
import { expectRemountSafe, runCycle, type TileHandle } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { ORGANIZATION, PERSON } from "./remount-safety/people";
import { seed, seedFetch } from "./remount-safety/fake-backend";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};
const shows = (tile: TileHandle, text: string) => (tile.container.textContent ?? "").includes(text);
const skeleton = (tile: TileHandle) => tile.container.querySelector('[aria-busy="true"]') !== null;
// The board's organization, as a saved board gives it to every tile on it.
const wrap = (children: React.ReactNode) => <BoardOrganizationProvider value={ORGANIZATION.id}>{children}</BoardOrganizationProvider>;

const STAMP = "2026-10-08T15:30:00.000Z";
const owned = { organization_id: ORGANIZATION.id, created_by: PERSON.id, created_at: STAMP, updated_at: STAMP, deleted_at: null, version: 1, visibility: "personal", custom_fields: {}, metadata: {} };

const PROFILE_ID = "3f6a9c1e-7b24-4d85-a0e3-5c1d8b2f9a47";
const POST_ID = "c8d2e5b7-1a39-4f60-8b4c-6e0a3d7f1295";
const AD_ID = "a5b1f8d3-92c6-4e07-b3a9-1d4c7e0f6288";
const COLLECTION_ID = "e2c4a7d9-6f18-4b53-9d0a-8b3e5f1c7a64";
const HANDLE = "harborview.homes";
const CAPTION = "Three walk-through mistakes that cost landlords a deposit dispute";
const AD_HEADLINE = "Move-in inspections that hold up in small claims court";
const COLLECTION_NAME = "Hooks that worked for move-in videos";

const profileRow = {
  ...owned,
  id: PROFILE_ID,
  platform: "tiktok",
  platform_user_id: "7001",
  handle: HANDLE,
  display_name: "Harborview Homes",
  bio: "Rental tips from a property manager",
  follower_count: 18200,
  following_count: 40,
  post_count: 1,
  total_likes: 90000,
  is_verified: false,
  is_business: true,
  profile_url: `https://www.tiktok.com/@${HANDLE}`,
  provider: "tiktok",
  status: "active",
  raw_payload: {},
};
const statRow = {
  ...owned,
  id: "d1e2f3a4-5b6c-4d7e-8f90-a1b2c3d4e5f6",
  post_id: POST_ID,
  views: 120000,
  likes: 9000,
  comments: 310,
  shares: 120,
  saves: 700,
  engagement_rate: 0.084,
  outlier_score: 4.2,
  percentile: 97,
  computed_at: STAMP,
};
const postRow = {
  ...owned,
  id: POST_ID,
  profile_id: PROFILE_ID,
  platform: "tiktok",
  platform_post_id: "7390000000000000001",
  url: `https://www.tiktok.com/@${HANDLE}/video/7390000000000000001`,
  format: "video",
  caption: CAPTION,
  title: null,
  hashtags: ["landlord"],
  mentions: [],
  duration_seconds: 34,
  posted_at: STAMP,
  first_seen_at: STAMP,
  provider: "tiktok",
  status: "active",
  is_ad: false,
  raw_payload: {},
  stat: [statRow],
};
const adRow = {
  ...owned,
  id: AD_ID,
  library: "meta",
  platform_ad_id: "9001",
  advertiser_name: "Lease Lock Inspections",
  headline: AD_HEADLINE,
  body: "Photo-stamped reports in ten minutes.",
  format: "image",
  countries: ["US"],
  placements: [],
  first_seen_at: STAMP,
  started_at: STAMP,
  provider: "meta",
  status: "active",
  raw_payload: {},
};
const collectionRow = { ...owned, id: COLLECTION_ID, name: COLLECTION_NAME, description: null, brand_id: null, sort: 0 };

function seedSocial() {
  seed("social.social_profile", [profileRow]);
  seed("social.post", [postRow]);
  seed("social.post_stat", [statRow]);
  seed("social.post_transcript", []);
  seed("social.post_metric_snapshot", []);
  seed("social.profile_snapshot", []);
  seed("social.tracked_account", []);
  seed("social.ad", [adRow]);
  seed("social.swipe_collection", [collectionRow]);
  seed("social.swipe_collection_item", []);
  // The post's stored media (none: the poster is the provider thumbnail).
  seedFetch(/\/social\/posts\/[^/]+\/media$/, () => []);
}

const textOf = (tile: TileHandle) => (tile.container.textContent ?? "").trim().slice(0, 80);

// Break: the post tile re-reads the stored post (and its account) on wake / remount, or drops to its skeleton while it does.
remountType(
  "social-post",
  () =>
    runCycle(type("social-post"), { kind: "entity", entity: "social-post", id: POST_ID }, {
      title: "Social post",
      prepare: seedSocial,
      wrap,
      loadMs: 1500,
      kept: (tile) => ({ caption: shows(tile, CAPTION), loading: skeleton(tile) }),
    }),
  (r) => expectRemountSafe(r, { caption: true, loading: false }, [/^social\.post$/, /^social\.social_profile$/]),
);

// Break: the profile tile re-reads the account, its posts and its snapshots on wake / remount.
remountType(
  "social-profile",
  () =>
    runCycle(type("social-profile"), { kind: "entity", entity: "social-profile", id: PROFILE_ID }, {
      title: `@${HANDLE}`,
      prepare: seedSocial,
      wrap,
      loadMs: 1500,
      kept: (tile) => ({ account: shows(tile, HANDLE), loading: skeleton(tile) }),
    }),
  (r) => expectRemountSafe(r, { account: true, loading: false }, [/^social\.social_profile$/, /^social\.post$/, /^social\.profile_snapshot$/]),
);

// Break: the outlier feed re-reads on wake / remount (its minute refresh must not restart with the tile).
remountType(
  "social-outlier-feed",
  () =>
    runCycle(type("social-outlier-feed"), { kind: "entity", entity: "social-outlier-feed", id: null }, {
      title: "Outlier feed",
      prepare: seedSocial,
      wrap,
      loadMs: 1500,
      kept: (tile) => ({ loading: skeleton(tile), text: textOf(tile) }),
    }),
  (r) => {
    expect(r.keptAfterWake).toEqual(r.keptAfterRemount);
    expectRemountSafe({ ...r, keptAfterRemount: r.keptAfterWake }, r.keptAfterWake, [/^social\.post$/]);
  },
);

// Break: the ad tile re-reads the stored ad on wake / remount.
remountType(
  "social-ad",
  () =>
    runCycle(type("social-ad"), { kind: "entity", entity: "social-ad", id: AD_ID }, {
      title: "Ad",
      prepare: seedSocial,
      wrap,
      loadMs: 1500,
      kept: (tile) => ({ ad: shows(tile, AD_HEADLINE), loading: skeleton(tile) }),
    }),
  (r) => expectRemountSafe(r, { ad: true, loading: false }, [/^social\.ad$/]),
);

// Break: the swipe collection tile re-reads the collection and its items on wake / remount.
remountType(
  "social-swipe-collection",
  () =>
    runCycle(type("social-swipe-collection"), { kind: "entity", entity: "social-swipe-collection", id: COLLECTION_ID }, {
      title: COLLECTION_NAME,
      prepare: seedSocial,
      wrap,
      loadMs: 1500,
      kept: (tile) => ({ collection: shows(tile, COLLECTION_NAME), loading: skeleton(tile) }),
    }),
  (r) => expectRemountSafe(r, { collection: true, loading: false }, [/^social\.swipe_collection$/, /^social\.swipe_collection_item$/]),
);
