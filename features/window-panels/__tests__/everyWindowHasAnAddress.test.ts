/**
 * everyWindowHasAnAddress.test.ts — THE ADDRESS CENSUS (V-23, ruling R35).
 *
 * 🚨 A window with no `urlSync` key cannot be deep-linked, cannot be opened by
 * anyone verifying it from the seat, and cannot be reached by the extension or
 * the desktop app — which the Google-native plan (§5.7) promises reach "the
 * same panels through the existing window-panel deep links; no client-specific
 * Google code". V-23 ended three items UNMEASURED for exactly that reason: the
 * agenda and the two Google import panels had no address, and the site Quick
 * view's one-panel identity could not be checked because the overlay-bound
 * window had none either.
 *
 * WHAT THIS CHECKS, over the live catalogue and the live registry metadata —
 * never a hand-written list of windows, which would go stale the first time a
 * window was added:
 *
 *  1. Every `isWindow: true` overlay has a row in `windowRegistryMetadata.ts`.
 *     Without one it cannot declare an address AT ALL (nor a mobile
 *     presentation, nor a preservation contract). The agenda and the approval
 *     queue both shipped with no row.
 *  2. Every window whose payload names a durable subject — an id-bearing key
 *     in `defaultData` — declares `urlSync.key`.
 *  3. No two windows claim the same `urlSync.key` (two windows on one address
 *     means one of them is unreachable).
 *
 * THE BASELINE ONLY SHRINKS. `window-address-baseline.json` is the census of
 * what was already unaddressed when this guard landed, plus the windows that
 * genuinely must not have an address (each with its reason). A window that is
 * unaddressed and NOT in the baseline fails: new debt is refused. A baseline
 * entry that has since been addressed also fails, with the line to delete.
 */

import { OVERLAY_CATALOGUE } from "@/features/overlays/catalogue";
import { ALL_WINDOW_STATIC_METADATA } from "../registry/windowRegistryMetadata";
import baseline from "../registry/window-address-baseline.json";

/**
 * A key in `defaultData` that names a durable subject the address must carry:
 * `siteId`, `agentIds`, `shareToken`, `dimensionSlug`. `title`, `content` and
 * `search` are window-local state, not an identity.
 */
const SUBJECT_KEY = /(^|[a-z])(Id|Ids|Token|Slug)$/;

/**
 * `callbackGroupId` marks a window that hands a value BACK to whatever opened
 * it — a picker, an uploader, a cell editor. A deep link would open it with
 * nothing to answer, so it is addressed by its caller and nothing else. The
 * reason is written out per window in `addressless`.
 */
const CALLBACK_KEY = "callbackGroupId";

const addressless = baseline.addressless as Record<string, string>;
const sharedAddresses = baseline.sharedAddresses as Record<string, string>;
const noMetadataBaseline = baseline.noMetadataBaseline as readonly string[];
const unaddressedBaseline = baseline.unaddressedBaseline as readonly string[];

const metadataByOverlayId = new Map(
  ALL_WINDOW_STATIC_METADATA.map((entry) => [String(entry.overlayId), entry]),
);

const windowOverlayIds = Object.entries(
  OVERLAY_CATALOGUE as Record<string, { isWindow?: boolean }>,
)
  .filter(([, entry]) => entry.isWindow)
  .map(([overlayId]) => overlayId);

function census() {
  const noMetadata: string[] = [];
  const unaddressed: string[] = [];

  for (const overlayId of windowOverlayIds) {
    const entry = metadataByOverlayId.get(overlayId);
    if (!entry) {
      noMetadata.push(overlayId);
      continue;
    }
    if (entry.urlSync?.key) continue;

    const keys = Object.keys(entry.defaultData ?? {});
    if (keys.includes(CALLBACK_KEY)) continue;
    if (keys.some((key) => SUBJECT_KEY.test(key))) unaddressed.push(overlayId);
  }

  return { noMetadata, unaddressed };
}

describe("every window has an address (R35)", () => {
  const { noMetadata, unaddressed } = census();

  it("adds no NEW window without a registry row", () => {
    const fresh = noMetadata.filter((id) => !noMetadataBaseline.includes(id));
    expect({
      windowsWithNoRegistryRow: fresh,
      remedy:
        "Add a row to features/window-panels/registry/windowRegistryMetadata.ts " +
        "with a urlSync key and a hydrator in url-sync/initUrlHydration.ts.",
    }).toEqual({ windowsWithNoRegistryRow: [], remedy: expect.any(String) });
  });

  it("adds no NEW window with a durable subject and no address", () => {
    const fresh = unaddressed.filter(
      (id) => !unaddressedBaseline.includes(id) && !(id in addressless),
    );
    expect({
      windowsWithASubjectAndNoAddress: fresh,
      remedy:
        "Declare `urlSync: { key: \"<snake_key>\" }` on the registry row, register a " +
        "hydrator in url-sync/initUrlHydration.ts, and pass `urlSyncId={<the subject id>}` " +
        "on the WindowPanel so the address carries the subject. If the window genuinely " +
        "cannot be addressed, add it to `addressless` in window-address-baseline.json " +
        "WITH the reason.",
    }).toEqual({
      windowsWithASubjectAndNoAddress: [],
      remedy: expect.any(String),
    });
  });

  it("keeps the baseline honest — an addressed window is deleted from it", () => {
    const staleNoMetadata = noMetadataBaseline.filter(
      (id) => !noMetadata.includes(id),
    );
    const staleUnaddressed = unaddressedBaseline.filter(
      (id) => !unaddressed.includes(id),
    );
    const staleAddressless = Object.keys(addressless).filter(
      (id) => !windowOverlayIds.includes(id),
    );
    expect({
      staleNoMetadata,
      staleUnaddressed,
      staleAddressless,
      remedy:
        "These windows are fixed (or gone). Delete their lines from " +
        "features/window-panels/registry/window-address-baseline.json — the baseline only shrinks.",
    }).toEqual({
      staleNoMetadata: [],
      staleUnaddressed: [],
      staleAddressless: [],
      remedy: expect.any(String),
    });
  });

  it("gives every genuinely address-less window a written reason", () => {
    const blank = Object.entries(addressless)
      .filter(([, reason]) => !reason || reason.trim().length < 20)
      .map(([id]) => id);
    expect(blank).toEqual([]);
  });

  it("never lets two windows claim one address", () => {
    const seen = new Map<string, string>();
    const collisions: string[] = [];
    for (const entry of ALL_WINDOW_STATIC_METADATA) {
      const key = entry.urlSync?.key;
      if (!key) continue;
      const first = seen.get(key);
      if (first && !(key in sharedAddresses)) {
        collisions.push(`"${key}" claimed by both ${first} and ${entry.overlayId}`);
      } else {
        seen.set(key, String(entry.overlayId));
      }
    }
    expect(collisions).toEqual([]);
  });

  it("addresses the windows V-23 could not reach", () => {
    // The named subjects of the finding. These are asserted BY NAME, not by
    // baseline arithmetic, so a future edit that quietly drops one of their
    // urlSync keys fails here instead of silently growing the baseline.
    const mustBeAddressed = [
      "googleAgendaWindow",
      "googleContactsImportWindow",
      "googleTasksImportWindow",
      "siteQuickViewWindow",
      "googleConnectWindow",
      "approvalsWindow",
      "detailWindow",
    ];
    const addresses = Object.fromEntries(
      mustBeAddressed.map((id) => [
        id,
        metadataByOverlayId.get(id)?.urlSync?.key ?? null,
      ]),
    );
    expect(addresses).toEqual({
      googleAgendaWindow: "agenda",
      googleContactsImportWindow: "google_contacts_import",
      googleTasksImportWindow: "google_tasks_import",
      siteQuickViewWindow: "site_quick_view",
      googleConnectWindow: "google_connect",
      approvalsWindow: "approvals",
      detailWindow: "detail",
    });
  });
});
