/**
 * THE PRESS ROOM KEEPS ITS DOORS to the PR calendar and the media lists.
 *
 * Acceptance 2026-09-29: neither was reachable from where a PR person works. The doors were
 * added to the Press Room header, then a page-top migration (2026-10) swapped the header for
 * RecordPageHeader and silently dropped them. This pins the doors to the page itself, so any
 * future header rewrite fails here by name instead of losing them.
 */

import { readFileSync } from "node:fs";
import { join } from "node:path";

import { pressRoomDoors } from "../PressRoomDoors";

const PAGE = join(__dirname, "..", "..", "..", "..", "app", "(core)", "marketing", "[brandId]", "pr", "page.tsx");

test("the Press Room page renders its doors in the header", () => {
  expect(readFileSync(PAGE, "utf8")).toMatch(/<PressRoomHeader\b/);
});

test("the doors are the brand PR calendar and the media-list board", () => {
  expect(pressRoomDoors("all-green").map((d) => [d.label, d.href])).toEqual([
    ["PR calendar", "/marketing/all-green/planning/calendar"],
    ["Media lists", "/crm/outreach-lists"],
  ]);
});
