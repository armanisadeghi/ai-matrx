// 🚨 A SYNCED RECORD TYPE THE CONNECTORS DECLARE IS NEVER A TYPE THE HEALTH
// STRIP FORGETS (Bugbot round 18 on frontend PR 228, `PRODUCT_BY_ITEM_TYPE`;
// re-landed as VERIFY-U-P2-R5 V17-5).
//
// F-38 made a picked Slides deck a first-class resource type
// (`google_presentation`, 4f0dfc3b) and declared it under the connectors'
// `workspace_files` product — but the health producer's type → product map was a
// hand-typed record, so a deck's strip resolved to NO product and stayed absent,
// silently, while the connectors screen knew exactly which grant it depended on.
//
// The class rule: the map is DERIVED from the connectors' own product config
// (`attachableResourceTypes` on every `ConnectorProduct`), plus the handful of
// item-presentation aliases whose tokens differ from the resource-type names.
// This census walks the config, so the next attachable type cannot be forgotten
// by the strip: it is either mapped or this test is red.
//
// Red at the hand-typed map (google_presentation → null), green with the derived
// one. The fix shipped once in `ec7ce701` and was LOST when the chair reverted
// that commit for its package half (R21) — a host-side fix that should have been
// split out. This file is the same census, plus the cross-repo leg below.
//
// 🚨 THE CROSS-REPO LEG (lane B-24). The SERVER now declares what a person can
// attach — one place, exported as data for this repo to read
// (`aidream/aidream/services/conversation_attachments/
// attachable_resource_kinds.json`, generated from `registry.py`, which derives it
// from `resource_types.py`'s ONE declared set). Every Google type it declares must
// resolve to a product HERE, or a record a person just attached renders a strip
// that cannot name the grant it depends on. That leg prints UNMEASURED and skips
// when the checkout or the export is absent — never a pass that reads as a
// measurement.

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GOOGLE_CONNECTOR_PROVIDER } from "@/features/connectors/provider-config";
import { isGoogleConnectionResourceType } from "@/features/marketing/google/types";
import { productKeyFor } from "../sourceHealth";

describe("every attachable resource type the connectors declare resolves to its product", () => {
  const declared = GOOGLE_CONNECTOR_PROVIDER.products.flatMap((product) =>
    product.attachableResourceTypes.map((type) => ({ type, product: product.key })),
  );

  it("has something to census (a walk over zero types proves nothing)", () => {
    expect(declared.length).toBeGreaterThanOrEqual(6);
    expect(declared.map((d) => d.type)).toContain("google_presentation");
  });

  for (const { type, product } of declared) {
    it(`${type} → ${product}, from a row that does not name its product`, () => {
      expect(productKeyFor(type, {})).toBe(product);
    });
  }

  it("still lets the ROW win when it names its own product", () => {
    expect(productKeyFor("google_presentation", { provider_product: "gmail" })).toBe(
      "gmail",
    );
  });
});

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");

/** Where the server exports its attach registry as data, newest home first. */
const REGISTRY_EXPORTS = [
  join(
    AIDREAM_ROOT,
    "aidream",
    "services",
    "conversation_attachments",
    "attachable_resource_kinds.json",
  ),
] as const;

interface AttachableKindRow {
  resource_type: string;
  source: string;
  label: string;
  add_more: string | null;
}

function serverRegistry(): AttachableKindRow[] | null {
  const path = REGISTRY_EXPORTS.find((candidate) => existsSync(candidate));
  if (!path) return null;
  const parsed = JSON.parse(readFileSync(path, "utf8")) as {
    providers?: Record<string, AttachableKindRow[]>;
  };
  const google = parsed.providers?.google;
  if (!google || google.length === 0) {
    throw new Error(
      `${path} declares no Google attachable kinds. Point REGISTRY_EXPORTS at the ` +
        "module that now exports them (regenerate with `uv run python -m " +
        "aidream.services.conversation_attachments.registry --write`) rather than " +
        "deleting the check — a census that measures nothing is worse than none.",
    );
  }
  return google;
}

const registry = serverRegistry();

(registry ? describe : describe.skip)(
  "against the server's own attach registry" +
    (registry
      ? ""
      : " — UNMEASURED-until-present: no aidream checkout, or lane B-24's export is absent"),
  () => {
    it("resolves every type a person can attach to a connector product", () => {
      const unmapped = (registry ?? [])
        .filter((kind) => productKeyFor(kind.resource_type, {}) === null)
        .map(
          (kind) =>
            `${kind.resource_type} is attachable on the server and maps to no connector product — a record a person just attached shows a strip that cannot name the grant it depends on`,
        );
      expect(unmapped).toEqual([]);
    });

    it("can read every type it declares as a connection resource row", () => {
      const unreadable = (registry ?? [])
        .filter((kind) => !isGoogleConnectionResourceType(kind.resource_type))
        .map(
          (kind) =>
            `${kind.resource_type} is attachable on the server and is not a type features/marketing/google/types.ts lists — one such row throws and empties the whole Google inventory read`,
        );
      expect(unreadable).toEqual([]);
    });

    it("names each one for a person, never by its wire token", () => {
      for (const kind of registry ?? []) {
        expect(kind.label).not.toContain("_");
        expect(kind.label).not.toBe(kind.resource_type);
      }
    });
  },
);
