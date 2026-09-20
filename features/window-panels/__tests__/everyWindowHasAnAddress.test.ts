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

import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";

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
const subjectlessAddresses = baseline.subjectlessAddresses as Record<string, string>;
const unlocatableWindows = baseline.unlocatableWindows as readonly string[];

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

/**
 * 🚨 A REGISTERED ADDRESS THAT THE WINDOW NEVER FILLS IN (V-27 NEW-2).
 *
 * The census above is entirely over the REGISTRY: it proves a row exists and
 * declares a `urlSync.key`. That is half an address. The other half is the
 * `urlSyncId` the window hands `WindowPanel` — the SUBJECT the key is joined
 * to — and nothing checked it, so `brandChannelWindow` shipped with a row, a
 * hydrator and no id: `?panels=brand_channel:<brandId>` opened once, rewrote
 * itself to `?panels=brand_channel%3AbrandChannelWindow` (the singleton overlay
 * id, which is what `urlSyncId` falls back to), and reloading THAT address
 * opened nothing at all while the console said the token "names no brand".
 * Its `siteTrackingWindow` twin, written days earlier, carries `urlSyncId=
 * {siteId}` and round-trips perfectly — the registry integrity check cannot
 * tell them apart, and a person who shares the link silently loses the window.
 *
 * So this reads the window COMPONENTS: every overlay whose registry row
 * declares an address for a durable subject must pass `urlSyncId` in the file
 * that renders it. A window whose component cannot be located is reported by
 * name too — an unmeasured window is never a pass.
 */
const REPO_ROOT = join(__dirname, "..", "..", "..");
/** Every directory a window component can live in. A window is not always under
 *  `features/window-panels/windows/` — the settings shell, the image studio and
 *  the agent variable editor each render their own `WindowPanel`. */
const COMPONENT_ROOTS = ["features", "components", "app"].map((dir) =>
  join(REPO_ROOT, dir),
);

function componentFiles(dir: string): string[] {
  const out: string[] = [];
  for (const dirent of readdirSync(dir, { withFileTypes: true })) {
    if (dirent.name === "node_modules" || dirent.name.startsWith(".")) continue;
    const full = join(dir, dirent.name);
    if (dirent.isDirectory()) out.push(...componentFiles(full));
    else if (dirent.name.endsWith(".tsx")) out.push(full);
  }
  return out;
}

/**
 * overlayId → the source of every component that renders that overlay. Two
 * spellings, because both are in the tree: the literal `overlayId="x"` and the
 * module constant (`const OVERLAY_ID = "x"` … `overlayId={OVERLAY_ID}`), which
 * is how `AgentVariableEditorWindow` — a correctly addressed window — writes it.
 */
/**
 * 🚨 COMMENTS ARE NOT CODE. The first cut of this census matched `urlSyncId`
 * anywhere in the file, and the very fix it was written for carries the word in
 * its explanatory comment — so deleting the prop left the case GREEN. Everything
 * below is matched against the source with comments removed.
 */
function withoutComments(source: string): string {
  return source.replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1");
}

const SOURCE_BY_OVERLAY_ID = (() => {
  const map = new Map<string, string[]>();
  const add = (overlayId: string, source: string) => {
    map.set(overlayId, [...(map.get(overlayId) ?? []), source]);
  };
  for (const root of COMPONENT_ROOTS) {
    for (const file of componentFiles(root)) {
      const source = withoutComments(readFileSync(file, "utf8"));
      if (!source.includes("overlayId=")) continue;
      for (const match of source.matchAll(/overlayId="([A-Za-z0-9_]+)"/g)) {
        add(match[1], source);
      }
      const constant = /const\s+OVERLAY_ID\s*=\s*"([A-Za-z0-9_]+)"/.exec(source);
      if (constant && /overlayId=\{OVERLAY_ID\}/.test(source)) {
        add(constant[1], source);
      }
    }
  }
  return map;
})();

/**
 * The windows this case governs: a registry row with a `urlSync.key` whose
 * payload names a durable subject, so the address is meant to carry one.
 */
const ADDRESSED_SUBJECT_WINDOWS = ALL_WINDOW_STATIC_METADATA.filter(
  (entry) =>
    Boolean(entry.urlSync?.key) &&
    Object.keys(entry.defaultData ?? {}).some((key) => SUBJECT_KEY.test(key)),
).map((entry) => String(entry.overlayId));

describe("an address carries its subject, not the overlay id (V-27 NEW-2)", () => {
  it("passes urlSyncId in every window whose address names a subject", () => {
    const measurable = ADDRESSED_SUBJECT_WINDOWS.filter((id) =>
      SOURCE_BY_OVERLAY_ID.has(id),
    );
    const missing = measurable.filter((id) =>
      (SOURCE_BY_OVERLAY_ID.get(id) ?? []).every(
        (source) => !/urlSyncId/.test(source),
      ),
    );
    expect({
      windowsWhoseAddressCannotCarryItsSubject: missing.filter(
        (id) => !(id in subjectlessAddresses),
      ),
      remedy:
        "Pass `urlSyncId={<the subject id>}` to WindowPanel in that window's own " +
        "component. Without it the panel registers its sync entry under the " +
        "singleton overlay id and writes THAT into ?panels=, so the deep link " +
        "opens nothing on reload.",
    }).toEqual({
      windowsWhoseAddressCannotCarryItsSubject: [],
      remedy: expect.any(String),
    });
  });

  it("measures every one of them — a window it cannot find is not a pass", () => {
    const unlocatable = ADDRESSED_SUBJECT_WINDOWS.filter(
      (id) => !SOURCE_BY_OVERLAY_ID.has(id) && !unlocatableWindows.includes(id),
    );
    expect({
      windowsWithNoComponentUnderFeaturesWindowPanelsWindows: unlocatable,
      remedy:
        "This case reads `overlayId` out of every .tsx under features/, components/ and app/. " +
        "A window it cannot find is unmeasured, which is not the same as addressed — give the " +
        "component a literal `overlayId=\"<id>\"` (or the `OVERLAY_ID` constant spelling), or " +
        "add it to `unlocatableWindows` in window-address-baseline.json WITH the reason.",
    }).toEqual({
      windowsWithNoComponentUnderFeaturesWindowPanelsWindows: [],
      remedy: expect.any(String),
    });
  });

  it("keeps the brand channel and its tracking twin addressed BY NAME", () => {
    // The two windows of the finding: one round-tripped, one destroyed its own
    // address. Asserted by name so baseline arithmetic can never absorb them.
    for (const id of ["brandChannelWindow", "siteTrackingWindow"]) {
      const sources = SOURCE_BY_OVERLAY_ID.get(id) ?? [];
      expect(sources.length).toBeGreaterThan(0);
      expect(sources.some((source) => /urlSyncId=\{/.test(source))).toBe(true);
    }
  });
});
