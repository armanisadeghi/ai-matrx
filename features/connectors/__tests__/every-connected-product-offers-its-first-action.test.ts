/**
 * 🚨 EVERY CONNECTED ROW OFFERS ITS FIRST USEFUL ACTION — OR SAYS IN WRITING WHY
 * THERE IS NOTHING TO OFFER YET (PLAN §2; law 4: a screen is absent or honest).
 *
 * THE DEFECT THIS PINS (lane F-51, escalated from U-W2). `firstAction` was
 * `{ label, href } | null`, and FIVE of the nine Google rows were `null`.
 * Calendar was one of them although its first action — opening the agenda — was
 * built, catalogued and shipped in the same project: the field could only hold an
 * href, and the agenda is a window with no route. Nothing could tell a row that
 * had nothing to offer from a row somebody forgot, on any provider, ever.
 *
 * So the census is over the CONFIG, not over one row: every product declares one
 * of three shapes, an overlay action names a real catalogued overlay, a route
 * action is a real in-app path, and the rows that offer nothing are an explicit,
 * shrinking list with a written reason each. A new product row copied from a
 * neighbour cannot reach a person with nothing at the end of it.
 */

import { OVERLAY_CATALOGUE, isOverlayId, type OverlayId } from "@/features/overlays/catalogue";

import {
  GOOGLE_CONNECTOR_PROVIDER,
  type ConnectorFirstActionContextKey,
  type ConnectorProviderConfig,
} from "../provider-config";

/** Every provider config the app ships. The census walks all of them. */
const PROVIDERS: ConnectorProviderConfig[] = [GOOGLE_CONNECTOR_PROVIDER];

/**
 * 🚨 THE DEFECT LANE F-55 FIXES (Cursor Bugbot, Medium, thread 4043109495, PR
 * 228, commit 9e31d18a). F-51 turned `firstAction` into a closed union that
 * let an overlay action carry an id and nothing else, and Tasks' row used
 * exactly that shape — `{ kind: "overlay", overlayId: "googleTasksImportWindow" }`
 * — so the button dispatched `openOverlay({ overlayId })` with NO data. The
 * window (`GoogleTasksImportWindow` → `GoogleTasksImportPanel`) reads
 * `organizationId` off that data and refuses to load without it
 * (`GoogleTasksImportPanel.tsx`: `if (!organizationId) return … could not
 * load`), so the new "Import your tasks" button opened a window that could
 * list and import nothing — a screen that looked alive but was dead.
 *
 * This census is the independently-confirmed ground truth for every window a
 * `kind: "overlay"` first action can name, read directly off each window
 * body's own prop contract (see the comment on each entry) — never off the
 * `needs` the config declares, or this test would only ever agree with
 * itself. An overlay action whose window is in this map, or added to it
 * later, must declare EVERY one of these keys in its `needs`, or the button
 * it renders would open the same kind of dead window Tasks' did.
 */
const WINDOW_REQUIRED_CONTEXT_KEYS: Readonly<
  Partial<Record<OverlayId, readonly ConnectorFirstActionContextKey[]>>
> = {
  // GoogleTasksImportPanel.tsx: `if (!organizationId) { … return "could not
  // load" }` — the organization the imported tasks are written into, and the
  // window's body cannot function at all without it.
  googleTasksImportWindow: ["organizationId"],
  // GoogleContactsImportWindow → GoogleContactsImportPanel takes the same
  // `organizationId` prop for the same reason. No provider config currently
  // routes a first action to this overlay, but the census covers it anyway
  // so a future row copied from Tasks' neighbour cannot skip `needs` either.
  googleContactsImportWindow: ["organizationId"],
  // GoogleAgendaWindow → AgendaPanel takes no organization/project prop at
  // all — its subject is the signed-in person, not anything a caller
  // supplies — so it is deliberately ABSENT here, never `[]`: absence means
  // "this window needs nothing", `[]` on a `needs` field would mean the same
  // thing by accident.
};

/**
 * The rows that have NOTHING to offer yet, each with a reason in the config.
 *
 * 🚨 THIS LIST ONLY EVER SHRINKS. It is not permission — it is the visible debt
 * lane F-51 escalated to the chair: Gmail has no compose surface, Tag Manager has
 * no surface of its own, and YouTube has no channel-binding surface the way
 * Search Console and Analytics do. Adding a name here is a decision somebody
 * makes on purpose; forgetting to decide fails this file.
 */
const OFFERS_NOTHING_YET: Readonly<Record<string, readonly string[]>> = {
  google: ["gmail", "tag_manager", "youtube"],
};

describe("every product a person can switch on offers its first useful action", () => {
  for (const provider of PROVIDERS) {
    describe(provider.name, () => {
      it("declares one of the three shapes on every row — never a bare null", () => {
        const undeclared = provider.products.filter((product) => {
          const action = product.firstAction as unknown;
          if (!action || typeof action !== "object") return true;
          const kind = (action as { kind?: unknown }).kind;
          return kind !== "route" && kind !== "overlay" && kind !== "none";
        });
        expect(undeclared.map((product) => product.key)).toEqual([]);
      });

      it("opens a real catalogued overlay wherever the action is a window", () => {
        const overlays = provider.products.flatMap((product) =>
          product.firstAction.kind === "overlay"
            ? [{ key: product.key, action: product.firstAction }]
            : [],
        );
        // The product this lane was escalated for. If Calendar ever loses its
        // agenda door again, this line is the one that says so.
        expect(overlays.map((entry) => entry.key)).toContain("calendar");
        for (const entry of overlays) {
          expect(isOverlayId(entry.action.overlayId)).toBe(true);
          expect(OVERLAY_CATALOGUE[entry.action.overlayId].isWindow).toBe(true);
          expect(entry.action.label.trim().length).toBeGreaterThan(0);
        }
      });

      it("carries every context key the overlay it opens reads off overlay data", () => {
        const overlays = provider.products.flatMap((product) =>
          product.firstAction.kind === "overlay"
            ? [{ key: product.key, action: product.firstAction }]
            : [],
        );
        const dead = overlays.flatMap(({ key, action }) => {
          const required = WINDOW_REQUIRED_CONTEXT_KEYS[action.overlayId];
          if (!required) return [];
          const declared = new Set(action.needs ?? []);
          const missing = required.filter((needed) => !declared.has(needed));
          return missing.length > 0 ? [{ key, overlayId: action.overlayId, missing }] : [];
        });
        expect(dead).toEqual([]);
      });

      it("points a route action at a real in-app path", () => {
        for (const product of provider.products) {
          if (product.firstAction.kind !== "route") continue;
          expect(product.firstAction.href.startsWith("/")).toBe(true);
          expect(product.firstAction.label.trim().length).toBeGreaterThan(0);
        }
      });

      it("offers something on every row except the ones deliberately named, each with a reason", () => {
        const silent = provider.products
          .filter((product) => product.firstAction.kind === "none")
          .map((product) => product.key)
          .sort();
        expect(silent).toEqual([...(OFFERS_NOTHING_YET[provider.id] ?? [])].sort());
        for (const product of provider.products) {
          if (product.firstAction.kind !== "none") continue;
          // A reason is a sentence a person could read, not a placeholder.
          expect(product.firstAction.because.trim().length).toBeGreaterThan(20);
        }
      });
    });
  }
});
