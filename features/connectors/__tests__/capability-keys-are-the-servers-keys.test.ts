/**
 * EVERY CAPABILITY THE SERVER SHIPS HAS A HOME ON THE SURFACE.
 *
 * THE DEFECT THIS PINS (VERIFY-U-P2-R4, V13-3). `capabilities.py` declares
 * THIRTEEN `CapabilityKey`s and thirteen descriptors for them (the report said
 * fourteen and thirteen; the counts are one off, the finding is exact);
 * `GOOGLE_CONNECTOR_PROVIDER` covered twelve and never mentioned `slides` — a capability with `rollout_phase = "available"`,
 * `eligible_resource_types = ("google_presentation",)` and the
 * `google_workspace.read_presentation` action. It was not hypothetical: live on
 * 2026-09-17 connection `4a4f4ad5` carried
 * `{"slides": {"last_success": {"at": "2026-09-17T20:48:03.195512Z", "action":
 * "slides.read"}}}` and one `google_presentation` resource was registered. A
 * capability we ship, certify, hold a resource for and have already called
 * appeared in NO consent row, no toggle, no health row, no scope disclosure and
 * no revoke consequence: the person could not see it, grant it or withdraw it on
 * the one surface whose whole job is to show them what they switched on.
 *
 * THE GUARD THAT WOULD HAVE CAUGHT IT EXISTED TWICE and was never pointed at the
 * set that decides what a person may switch on — `refusal-codes-are-the-servers-
 * codes` and `admission-codes-are-the-servers-codes` re-read the server's own
 * literals. This is the third census, built the same way, including the same
 * UNMEASURED announcement when the sibling checkout is absent.
 *
 * WHERE `slides` BELONGS, and why it is not a tenth product row: PLAN §8/§9 put
 * Slides and Forms under the one `drive.file` grant as FLIPS-ON-LATER — they are
 * not offered as products, and §2's nine dialog rows are final copy. So `slides`
 * is a capability of "Docs, Sheets & Drive files", exactly as `docs` and `sheets`
 * are, and `google_presentation` is one of that row's attachable resource types:
 * its health, its scope disclosure and its revoke consequence render on that row.
 */

import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { GOOGLE_CONNECTOR_PROVIDER } from "../provider-config";
import {
  googleActivityByProduct,
  parseGoogleCapabilityHealth,
} from "../google-capability-health";
import { productHealth, type ConnectorCapabilityRollout } from "../health";
import {
  GOOGLE_WORKSPACE_FILE_TYPES,
  GOOGLE_WORKSPACE_RESOURCE_TYPES,
  isGoogleWorkspaceResourceType,
} from "@/features/google-workspace/resource-types";
import { isGoogleConnectionResourceType } from "@/features/marketing/google/types";

const AIDREAM_ROOT =
  process.env.AIDREAM_DIR ?? join(process.cwd(), "..", "aidream");
const CAPABILITIES = join(
  AIDREAM_ROOT,
  "aidream",
  "services",
  "google_integrations",
  "capabilities.py",
);

/** The `CapabilityKey = Literal[...]` union, as the server declares it. */
function keysFromServer(): string[] {
  const source = readFileSync(CAPABILITIES, "utf8");
  const union = source.match(/CapabilityKey = Literal\[([\s\S]*?)\]/);
  if (!union) {
    throw new Error(
      `${CAPABILITIES} no longer declares 'CapabilityKey = Literal[...]'. The ` +
        "client's product coverage cannot be measured against it — fix this " +
        "reader rather than deleting the check.",
    );
  }
  return [...union[1]!.matchAll(/"([a-z0-9_]+)"/g)].map((m) => m[1]!).sort();
}

/**
 * Each descriptor's `key` with its `eligible_resource_types`, read from the same
 * file: a capability that can hold a resource type the client cannot attach is
 * the other half of V13-3 (`google_presentation` was registered live while
 * `attachableResourceTypes` had never heard of it).
 */
function resourceTypesFromServer(): Map<string, string[]> {
  const source = readFileSync(CAPABILITIES, "utf8");
  const out = new Map<string, string[]>();
  const re =
    /key="([a-z0-9_]+)"[\s\S]*?eligible_resource_types=\(([^)]*)\)/g;
  for (let m = re.exec(source); m; m = re.exec(source)) {
    out.set(
      m[1]!,
      [...m[2]!.matchAll(/"([a-z0-9_]+)"/g)].map((t) => t[1]!).sort(),
    );
  }
  return out;
}

const clientKeys = [
  ...new Set(
    GOOGLE_CONNECTOR_PROVIDER.products.flatMap((p) => p.capabilityKeys),
  ),
].sort();

const clientResourceTypes = new Set(
  GOOGLE_CONNECTOR_PROVIDER.products.flatMap((p) => p.attachableResourceTypes),
);

/**
 * A capability deliberately not surfaced lives here WITH its reason, and nothing
 * else may. It is empty on purpose: everything the catalog ships today has a
 * product row that carries it.
 */
const NOT_SURFACED: Record<string, string> = {};

describe("the client's capability coverage", () => {
  it("claims each key exactly once — no two products fight over one", () => {
    const seen = new Map<string, string>();
    for (const product of GOOGLE_CONNECTOR_PROVIDER.products) {
      for (const key of product.capabilityKeys) {
        expect(seen.get(key) ?? product.key).toBe(product.key);
        seen.set(key, product.key);
      }
    }
  });

  it("puts every resource type it can attach behind a product that grants it", () => {
    for (const product of GOOGLE_CONNECTOR_PROVIDER.products) {
      for (const type of product.attachableResourceTypes) {
        expect(typeof type).toBe("string");
        expect(product.capabilityKeys.length).toBeGreaterThan(0);
      }
    }
  });
});

const hasServer = existsSync(CAPABILITIES);

(hasServer ? describe : describe.skip)(
  "the catalog's keys against the live aidream source",
  () => {
    it("gives every declared capability a product row", () => {
      const server = keysFromServer();
      const missing = server.filter(
        (key) => !clientKeys.includes(key) && !(key in NOT_SURFACED),
      );
      expect(missing).toEqual([]);
    });

    it("carries no key the server has stopped declaring", () => {
      expect(clientKeys.filter((key) => !keysFromServer().includes(key))).toEqual([]);
    });

    it("can attach every resource type a surfaced capability is eligible for", () => {
      const missing: string[] = [];
      for (const [key, types] of resourceTypesFromServer()) {
        if (key in NOT_SURFACED) continue;
        for (const type of types) {
          if (!clientResourceTypes.has(type)) {
            missing.push(
              `${key} is eligible for '${type}', which no product declares as attachable`,
            );
          }
        }
      }
      expect(missing).toEqual([]);
    });

    it("reads the keys it claims to read", () => {
      // Thirteen on 2026-09-17, and the census is about the SET, not the count:
      // the floor only proves the reader did not come back empty.
      expect(keysFromServer().length).toBeGreaterThanOrEqual(13);
      expect(keysFromServer()).toContain("slides");
    });

    it("finds a descriptor for every key the union declares", () => {
      const described = [...resourceTypesFromServer().keys()].sort();
      expect(described).toEqual(keysFromServer());
    });
  },
);

it("says out loud when the cross-repo leg could not run", () => {
  if (!hasServer) {
    console.warn(
      `UNMEASURED: the aidream checkout was not found at ${CAPABILITIES}, so the` +
        " capability keys were checked against the client's declared set only." +
        " Set AIDREAM_DIR to the sibling checkout to measure it.",
    );
  }
  expect(true).toBe(true);
});


/**
 * THE LIVE COLUMN, VERBATIM. `users.integration_connections.capability_health`
 * on connection `4a4f4ad5`, read 2026-09-17 — the `slides` success the surface
 * could not show, beside the `drive_files` refusal its own later success
 * overtook. Not a fixture I invented: this is production data, and the row the
 * person would see is derived from it here.
 */
const LIVE_COLUMN = {
  __kind: "google_connection_capability_health",
  slides: {
    last_success: { at: "2026-09-17T20:48:03.195512Z", action: "slides.read" },
  },
  drive_files: {
    last_refusal: {
      at: "2026-09-17T20:45:00.809366Z",
      code: "call_failed",
      action: "drive.revisions",
      sentence:
        "The drive files call to Google did not complete. The connection still holds its permission; try again, and tell us if it keeps happening.",
      http_status: null,
    },
    last_success: {
      at: "2026-09-17T20:47:58.659830Z",
      action: "drive.register_file",
    },
  },
} as const;

describe("the live slides success on the row that now carries it", () => {
  const workspace = GOOGLE_CONNECTOR_PROVIDER.products.find(
    (product) => product.key === "workspace_files",
  )!;
  const rollout: ConnectorCapabilityRollout[] = workspace.capabilityKeys.map(
    (capabilityKey) => ({
      capabilityKey,
      phase: "available" as const,
      eligible: true,
      requiredScopes: [],
      ineligibleReason: null,
    }),
  );
  const activity = googleActivityByProduct(
    GOOGLE_CONNECTOR_PROVIDER,
    parseGoogleCapabilityHealth(LIVE_COLUMN),
  );

  it("folds the slides call into the product the person sees", () => {
    expect(activity.workspace_files?.lastSuccessAt).toBe(
      "2026-09-17T20:48:03.195512Z",
    );
  });

  it("renders it as that row's last successful call, with no refusal standing", () => {
    const row = productHealth({
      provider: GOOGLE_CONNECTOR_PROVIDER,
      product: workspace,
      account: {
        id: "4a4f4ad5-0000-4000-8000-000000000000",
        label: "live@example.com",
        ownerKind: "person",
        organizationId: null,
        providerSubject: "10293847",
        grantedScopes: workspace.scopes,
        usable: true,
        statusLabel: "Connected",
        statusReason: "live@example.com is connected and working.",
        statusRemedy: null,
        lastVerifiedAt: "2026-09-17T20:48:03.195512Z",
        lastRefusalSentence: null,
        activity,
      },
      rollout,
    });
    expect(row.state).toBe("connected");
    expect(row.lastSuccessAt).toBe("2026-09-17T20:48:03.195512Z");
    // The capability key itself never reaches the person (D6).
    expect(`${row.reason} ${row.label} ${row.remedy ?? ""}`).not.toContain("slides");
  });
});

/**
 * THE OTHER HALF OF V13-3, MEASURED: a resource type the server declares and
 * this client cannot RENDER.
 *
 * The first census above proves the type is attachable — that a product row
 * grants it. That is not enough, and the gap is what shipped on 2026-09-17:
 * `google_presentation` was attachable (lane F-32 added it to
 * `workspace_files.attachableResourceTypes`) while
 * `features/google-workspace`'s hand-typed pair had never heard of it, so the
 * deck was accepted by the attach call and then had no row, no icon, no name
 * and no door — and `features/marketing/google/service.ts`'s resource guard
 * THREW on it, taking the whole Google inventory read down with it.
 *
 * This leg reads the server's `eligible_resource_types` for every SURFACED
 * capability and demands a renderer entry in the ONE client record
 * (`features/google-workspace/resource-types.ts`). It fails, by name, on a type
 * the server declares that a surface could not draw — including a type added to
 * `capabilities.py` tomorrow.
 */
describe("every file type the server declares can be rendered", () => {
  it("keeps the client record and the provider's attachable set identical", () => {
    const workspace = GOOGLE_CONNECTOR_PROVIDER.products.find(
      (product) => product.key === "workspace_files",
    )!;
    expect([...GOOGLE_WORKSPACE_RESOURCE_TYPES].sort()).toEqual(
      [...workspace.attachableResourceTypes].sort(),
    );
  });

  it("gives every rendered type a person-facing name that is not the wire token", () => {
    for (const type of GOOGLE_WORKSPACE_RESOURCE_TYPES) {
      const descriptor = GOOGLE_WORKSPACE_FILE_TYPES[type];
      expect(descriptor.label.length).toBeGreaterThan(0);
      expect(descriptor.label).not.toContain("_");
      // A type with no client read must SAY so; a blank detail is the dead end.
      if (descriptor.clientRead === null) {
        expect(descriptor.readOnlyNote?.length ?? 0).toBeGreaterThan(20);
      }
      // And the door always exists, read or no read.
      expect(descriptor.hrefFor("1AbC")).toMatch(/^https:\/\//);
    }
  });

  (hasServer ? it : it.skip)(
    "knows every resource type a surfaced capability is eligible for",
    () => {
      // A type this list has never heard of makes `connectionResource` throw,
      // and ONE such row empties every Google surface in the app.
      const unknown: string[] = [];
      for (const [key, types] of resourceTypesFromServer()) {
        if (key in NOT_SURFACED) continue;
        for (const type of types) {
          if (!isGoogleConnectionResourceType(type)) {
            unknown.push(
              `${key} is eligible for '${type}', which features/marketing/google/types.ts does not list — one such row throws and takes the whole Google inventory read with it`,
            );
          }
        }
      }
      expect(unknown).toEqual([]);
    },
  );

  (hasServer ? it : it.skip)(
    "can render every file type the Workspace-files product can attach",
    () => {
      const workspace = GOOGLE_CONNECTOR_PROVIDER.products.find(
        (product) => product.key === "workspace_files",
      )!;
      const unrenderable: string[] = [];
      for (const [key, types] of resourceTypesFromServer()) {
        if (!workspace.capabilityKeys.includes(key)) continue;
        for (const type of types) {
          if (!isGoogleWorkspaceResourceType(type)) {
            unrenderable.push(
              `${key} is eligible for '${type}', which features/google-workspace/resource-types.ts cannot render — a person who picks one gets no row, no name and no door`,
            );
          }
        }
      }
      expect(unrenderable).toEqual([]);
    },
  );

  (hasServer ? it : it.skip)(
    "renders exactly the file types the server's ResourceType union declares",
    () => {
      const serviceSource = join(
        AIDREAM_ROOT,
        "aidream",
        "services",
        "google_workspace",
        "service.py",
      );
      if (!existsSync(serviceSource)) {
        console.warn(
          `UNMEASURED: ${serviceSource} is absent, so the client's file-type` +
            " record was not measured against the server's ResourceType union.",
        );
        return;
      }
      const union = readFileSync(serviceSource, "utf8").match(
        /ResourceType = Literal\[([^\]]*)\]/,
      );
      expect(union).not.toBeNull();
      const declared = [...union![1]!.matchAll(/"([a-z0-9_]+)"/g)]
        .map((m) => m[1]!)
        .sort();
      expect([...GOOGLE_WORKSPACE_RESOURCE_TYPES].sort()).toEqual(declared);
    },
  );
});
