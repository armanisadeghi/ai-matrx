/**
 * @jest-environment node
 *
 * A PORTAL SAVE NEVER OVERWRITES A COLLEAGUE (lane 10 VIEWS-AND-FIELDS, sublane VWF, 2026-10-02).
 *
 * THE USE CASE: Cedar Ridge Physical Therapy opens a client portal. Maya Okafor, a patient, opens her
 * visit and starts writing "Running ten minutes late" in her note. Meanwhile the front desk updates
 * the same record. Before this lane her save went with `p_expected_version: null` — last-write-wins —
 * and silently replaced the desk's change. Now:
 *   · the page reads the version with the record, and the save is sent against it;
 *   · the desk's change since is refused by the door (PT409) and the editor says "Changed by someone else";
 *   · a version that could not be read is refused before anything is sent ("Could not check for changes");
 *   · after Reload (the page read again) her save lands.
 *
 * Driven through the real `features/portals/service.ts` and the real server action against a fake
 * `custom` schema that enforces versions exactly as `custom.record_update` does.
 */

export {};

const ORG = "3b1c2a54-9d0e-4f6a-8b7c-1d2e3f4a5b6c";
const SLUG = "cedar-ridge-pt";
const VISIT = "7a1f0c2e-5b3d-4e8f-9a6b-0c1d2e3f4a5b";

type Stored = { document: Record<string, unknown>; version: number };
const store = { record: { document: { visit_day: "Tuesday", client_note: "" }, version: 3 } as Stored, sent: [] as Array<Record<string, unknown>> };

function rpc(fn: string, args: Record<string, unknown>) {
  if (fn === "portal_me") {
    return { data: { signed_in: true, user_id: "u-maya", external: true, portals: [{ slug: SLUG, organization_id: ORG }] }, error: null };
  }
  if (fn === "record_headers") {
    return { data: [{ id: VISIT, version: store.record.version }], error: null };
  }
  if (fn === "record_update") {
    store.sent.push(args);
    const expected = args.p_expected_version as number | null;
    if (expected !== null && expected !== store.record.version) {
      return { data: null, error: { code: "PT409", message: "Someone else changed this record since you read it.", hint: "Read it again." } };
    }
    store.record = { document: { ...store.record.document, ...(args.p_patch as object) }, version: store.record.version + 1 };
    return { data: store.record.version, error: null };
  }
  return { data: null, error: { code: "PGRST202", message: fn } };
}

jest.mock("server-only", () => ({}), { virtual: true });
jest.mock("next/cache", () => ({ revalidatePath: jest.fn() }));
jest.mock("@/utils/supabase/server", () => ({
  createClient: async () => ({ schema: () => ({ rpc: async (fn: string, args: Record<string, unknown>) => rpc(fn, args ?? {}) }) }),
}));
jest.mock("@/utils/supabase/adminClient", () => ({ createAdminClient: () => ({ schema: () => ({ rpc: async () => ({ data: null, error: null }) }) }) }));
jest.mock("@/utils/supabase/claimsUser", () => ({ getClaimsUser: async () => ({ data: { user: { id: "u-maya" } } }) }));

/** The desk writes straight to the store. */
function deskWrites(patch: Record<string, unknown>) {
  store.record = { document: { ...store.record.document, ...patch }, version: store.record.version + 1 };
}

beforeEach(() => {
  jest.resetModules();
  store.record = { document: { visit_day: "Tuesday", client_note: "" }, version: 3 };
  store.sent = [];
});

/** `PORTAL_UNDER_TEST=<suffix>` loads `service<suffix>` / `actions<suffix>` beside the real ones (the red proof). */
const UNDER = process.env.PORTAL_UNDER_TEST ?? "";

async function load() {
  const service = (await import(`@/features/portals/service${UNDER}`)) as typeof import("@/features/portals/service");
  const actions = (await import(`@/app/(portal)/portal/c/[slug]/r/[recordId]/actions${UNDER}`)) as {
    savePortalField: (slug: string, recordId: string, key: string, value: string, version: number | null) => Promise<Record<string, unknown>>;
  };
  // The page reads the version with the record; before lane VWF there was no such read.
  const portalRecordVersion = service.portalRecordVersion ?? (async () => store.record.version);
  return { service: { portalRecordVersion }, savePortalField: actions.savePortalField };
}

describe("Cedar Ridge PT client portal · a save never overwrites the front desk", () => {
  it("the save is sent against the version the page read, and the desk's change since is refused", async () => {
    const { service, savePortalField } = await load();
    const seen = await service.portalRecordVersion({ organizationId: ORG, recordId: VISIT });
    expect(seen).toBe(3);
    deskWrites({ visit_day: "Thursday" });

    const outcome = await savePortalField(SLUG, VISIT, "client_note", "Running ten minutes late", seen);

    expect(outcome).toMatchObject({ ok: false, conflict: "changed" });
    expect(store.record.document).toEqual({ visit_day: "Thursday", client_note: "" });
    expect(store.sent.every((a) => a.p_expected_version === 3)).toBe(true);
  });

  it("after Reload her save lands, and the answer carries the version it made", async () => {
    const { service, savePortalField } = await load();
    deskWrites({ visit_day: "Thursday" });
    const seen = await service.portalRecordVersion({ organizationId: ORG, recordId: VISIT }); // Reload

    const outcome = await savePortalField(SLUG, VISIT, "client_note", "Running ten minutes late", seen);

    expect(outcome).toEqual({ ok: true, version: 5 });
    expect(store.record.document).toEqual({ visit_day: "Thursday", client_note: "Running ten minutes late" });
  });

  it("a version that could not be read is refused before anything is sent — never last-write-wins", async () => {
    const { savePortalField } = await load();

    const outcome = await savePortalField(SLUG, VISIT, "client_note", "Running ten minutes late", null);

    expect(outcome).toMatchObject({ ok: false, conflict: "unread" });
    expect(store.sent).toEqual([]);
    expect(store.record.document.client_note).toBe("");
  });
});
