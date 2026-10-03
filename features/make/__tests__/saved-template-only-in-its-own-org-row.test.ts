// features/make/__tests__/saved-template-only-in-its-own-org-row.test.ts — D2 (lane MAKE-HOME, wave 4).
//
// THE USE CASE. Cedar Ridge Physical Therapy saved "Cedar Ridge front desk" as a template; Brennan &
// Vogel Family Law saved "Client intake". The admin who belongs to both opens /make with Cedar Ridge
// active: Cedar Ridge's row shows its own template and never the law firm's.
//
// Offline half of the guard: the row's filter asks the door for THIS organization only, and the
// row drops any card another organization owns even if a read widened. The database half — the door
// itself, as test@test.com and admin, rolled back — is
// scripts/campaign-tests/make_gallery_org_row_guard.mts (red on a scratch-copy plant, recorded in
// PROGRESS-MAKE-HOME.md).

import { orgRowCards, orgRowFilter, platformCards, type GalleryCard } from "../gallery/catalogue";

const CEDAR = "0a54df90-eab8-4d07-ab29-81a45fb41e04";
const BRENNAN = "13764fab-7475-4174-8cf8-978e3e93cbb6";

const card = (catalogue_id: string, scope: "platform" | "org", owner: string | null, name: string): GalleryCard => ({
  id: `id-${catalogue_id}`,
  catalogue_id,
  version: 1,
  scope,
  owner_organization_id: owner,
  name,
  persona: null,
  business: null,
  vertical: null,
  industry: "healthcare",
  job: "intake",
  audience: "organization",
  teaches: "forms",
  strengths: [],
  requires: [],
  footprint: { line: "2 tables · 1 form" },
  preview_image: null,
  install_door: "custom.template_install",
  installed: null,
});

const CARDS = [
  card("T0115", "platform", null, "Physical therapy clinic"),
  card("CEDAR-1", "org", CEDAR, "Cedar Ridge front desk"),
  card("BRENNAN-1", "org", BRENNAN, "Client intake"),
];

it("the row asks the catalogue door for the active organization's own templates only", () => {
  expect(orgRowFilter(CEDAR)).toMatchObject({ scope: "org", organization_id: CEDAR, installed_in: CEDAR });
});

it("a saved template appears only in its own organization's row", () => {
  expect(orgRowCards(CARDS, CEDAR).map((c) => c.catalogue_id)).toEqual(["CEDAR-1"]);
  expect(orgRowCards(CARDS, BRENNAN).map((c) => c.catalogue_id)).toEqual(["BRENNAN-1"]);
  expect(orgRowCards(CARDS, null)).toEqual([]);
});

it("organizations' own templates never fill the platform list", () => {
  expect(platformCards(CARDS).map((c) => c.catalogue_id)).toEqual(["T0115"]);
});
