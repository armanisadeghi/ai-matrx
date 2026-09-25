// features/unified-data/__tests__/a-landed-move-is-said-where-it-survives.test.ts
//
// UI-FIX-19 (MOVE-AND-OUTSIDER's follow-up) — A LANDED MOVE IS SAID WHERE IT SURVIVES.
//
// The where-it-lives chip (records-ui) says "Rooms now lives in Elm Street Workshop." through its
// host's `notify` when bound, because the page's re-read re-mounts the chip and a sentence held
// in the chip died unread. So every RecordsMount under which the chip renders binds the platform's
// toasts. This fails the moment a page that renders the chip mounts records-ui without them.
// RED on the tree before UI-FIX-19 (no mount bound `notify`).
import { readFileSync } from "node:fs";
import { join } from "node:path";

const ROOT = join(__dirname, "..", "..", "..");

// Each page that renders <WhereItLives> (directly, or through the hub's OrganizationScope, which
// the /data-v2 page mounts) and the RecordsMount it renders under.
const CHIP_MOUNTS = [
  "app/(core)/data-v2/[tableId]/page.tsx",
  "app/(core)/data-v2/page.tsx",
  "app/(core)/organizations/[orgId]/tables/page.tsx",
];

describe("the where-it-lives chip's mounts bind the platform's toasts", () => {
  it.each(CHIP_MOUNTS)("%s binds notify: RECORDS_NOTIFY on its RecordsMount", (rel) => {
    const source = readFileSync(join(ROOT, rel), "utf8");
    expect(source).toMatch(/<RecordsMount[\s\S]*?notify:\s*RECORDS_NOTIFY/);
  });
});
