/**
 * Remount safety — board-only content: label, image, write-up, web page, page.
 *
 * SUT: each type's `Body` from `items/catalog.ts`, mounted as the board mounts
 * a tile (`remount-safety/harness.tsx`). The break each case catches: a body
 * that keeps the person's words in mount-local state and loses them on a
 * remount, re-creates its content on wake, or reaches the network on wake.
 * These types own no record, so `ownRecord` is empty: any write still fails.
 */

jest.mock("@/utils/supabase/client", () => {
  const { createFakeSupabase } = jest.requireActual("./remount-safety/fake-backend");
  const client = createFakeSupabase();
  return { createClient: () => client, supabase: client };
});
jest.mock("next/navigation", () => jest.requireActual("./remount-safety/next-navigation"));

import { BOARD_ITEM_TYPES } from "../items/catalog";
import { pageSource } from "../items/page-items";
import { expectRemountSafe, runCycle, typeInto } from "./remount-safety/harness";
import { installBrowserGaps } from "./remount-safety/browser-gaps";
import { remountType } from "./remount-safety/cases";

installBrowserGaps();

const type = (key: string) => {
  const t = BOARD_ITEM_TYPES.find((x) => x.key === key);
  if (!t) throw new Error(`no board item type ${key}`);
  return t;
};

const LABEL = "Unit 4B — lease renewal due Nov 30";
remountType(
  "label",
  () =>
    runCycle(type("label"), { kind: "label", text: "" }, {
      title: "Label",
      act: async (tile) => {
        await typeInto(tile.container.querySelector("textarea")!, LABEL);
      },
      kept: (tile) => ({ shown: tile.container.querySelector("textarea")?.value, saved: tile.source() }),
    }),
  (r) => expectRemountSafe(r, { shown: LABEL, saved: { kind: "label", text: LABEL } }, []),
);

const IMAGE = "https://images.harborviewproperties.com/units/4b/kitchen-after-remodel.jpg";
remountType(
  "image",
  () =>
    runCycle(type("image"), { kind: "image", url: IMAGE }, {
      title: "kitchen-after-remodel.jpg",
      kept: (tile) => tile.container.querySelector("img")?.getAttribute("src"),
    }),
  (r) => expectRemountSafe(r, IMAGE, []),
);

const WRITE_UP = "# Move-out inspection, Unit 4B\n\nCarpet in the second bedroom needs replacing; deduct $640 from the deposit.";
remountType(
  "write-up",
  () =>
    runCycle(type("write-up"), { kind: "text", markdown: WRITE_UP }, {
      title: "Write-up",
      kept: (tile) => {
        const text = tile.container.textContent ?? "";
        return { heading: text.includes("Move-out inspection, Unit 4B"), body: text.includes("deduct $640 from the deposit") };
      },
    }),
  (r) => expectRemountSafe(r, { heading: true, body: true }, []),
);

const WEB = "https://www.portlandoregon.gov/bds/rental-registration";
remountType(
  "web-page",
  () =>
    runCycle(type("web-page"), { kind: "html", url: WEB }, {
      title: "www.portlandoregon.gov",
      kept: (tile) => tile.container.querySelector("iframe")?.getAttribute("src"),
    }),
  (r) => expectRemountSafe(r, WEB, []),
);

remountType(
  "page",
  () =>
    runCycle(type("page"), pageSource("/meetings"), {
      title: "Meetings",
      kept: (tile) => ({ src: tile.container.querySelector("iframe")?.getAttribute("src"), saved: tile.source() }),
    }),
  (r) => expectRemountSafe(r, { src: "/meetings", saved: pageSource("/meetings") }, []),
);
