/**
 * Remount safety — the education items: flashcard deck and study kit.
 *
 * SUT: each type's `Body` from `items/catalog.ts` (`SetDetailView`, `KitHub`), mounted as the board
 * mounts a tile (`remount-safety/harness.tsx`), over the real store and the recording service
 * boundary. The break each case catches is named above it.
 */

jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));

import { BOARD_ITEM_TYPES } from "../items/catalog";
import { expectRemountSafe, runCycle, type TileHandle } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { ORGANIZATION, PERSON } from "./remount-safety/people";
import { seed, seedRpc } from "./remount-safety/fake-backend";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};
const shows = (tile: TileHandle, text: string) => (tile.container.textContent ?? "").includes(text);
const skeleton = (tile: TileHandle) => tile.container.querySelector('[aria-busy="true"]') !== null;

const DECK_ID = "6c1e8d3a-52b4-4f97-8a0e-3d7b9f2c4e18";
const DECK_NAME = "Spanish for property managers: lease vocabulary";
const deckRow = {
  id: DECK_ID,
  organization_id: ORGANIZATION.id,
  created_by: PERSON.id,
  created_at: "2026-09-27T15:30:00.000Z",
  updated_at: "2026-09-27T15:30:00.000Z",
  deleted_at: null,
  visibility: "personal",
  name: DECK_NAME,
  description: "Words a landlord needs at a walk-through.",
  topic: "Spanish",
  lesson: null,
  difficulty: "easy",
  metadata: {},
  version: 1,
};

// Break: the deck page re-reads the deck and its cards on wake / remount (its data is local state
// of the page component), or drops to its skeleton while it does.
remountType(
  "fc_set",
  () =>
    runCycle(type("fc_set"), { kind: "entity", entity: "fc_set", id: DECK_ID }, {
      title: DECK_NAME,
      prepare: () => {
        seed("education.fc_set", [deckRow]);
        seed("education.fc_card", []);
        seed("education.fc_detail", []);
        seedRpc("assoc_for_targets_visible", []);
      },
      loadMs: 1500,
      kept: (tile) => ({ deck: shows(tile, DECK_NAME), loading: skeleton(tile) }),
    }),
  (r) => expectRemountSafe(r, { deck: true, loading: false }, [/^education\.fc_set$/, /^education\.fc_card$/, /^education\.fc_detail$/]),
);

const KIT_SOURCE_ID = "b4a7c2e9-18d3-4a65-9f0b-7e5d1c8a3b26";
// Break: the kit hub re-reads its kit and its artifacts' practice stats on wake / remount.
remountType(
  "study-kit",
  () =>
    runCycle(type("study-kit"), { kind: "entity", entity: "study-kit", id: KIT_SOURCE_ID }, {
      title: "Lease agreement chapter 4",
      prepare: () => {
        seedRpc("assoc_for_entity", []);
      },
      loadMs: 1500,
      kept: (tile) => ({ loading: skeleton(tile), text: (tile.container.textContent ?? "").trim().slice(0, 60) }),
    }),
  (r) => {
    expect(r.keptAfterWake).toEqual(r.keptAfterRemount);
    expectRemountSafe({ ...r, keptAfterRemount: r.keptAfterWake }, r.keptAfterWake, [/^assoc_for_entity$/, /^assoc_for_sources$/]);
  },
);
