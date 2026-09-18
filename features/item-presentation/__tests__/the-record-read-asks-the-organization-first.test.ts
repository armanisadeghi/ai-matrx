/**
 * 🚨 VERIFY-R7-FIX-WAVE NEW-2 (seat-proven 2026-09-18) — the record-open PAGE
 * never asked the organization question at all. From a cold load of
 * `/detail/google_document/<id>`:
 *
 *   +4231ms  GET …/google_document?select=*&id=eq.…
 *   +4610ms  POST …/rpc/current_personal_org_id      ← the organization question
 *
 * — the read went out before anything asked which organization the person works
 * in, and when it came back empty the screen blamed the provider: "it may have
 * been moved, deleted, or isn't shared with you." Meanwhile the in-place opener
 * for the SAME record (`features/google-workspace/documents/openRecord.tsx`) was
 * organization-honest: two doors to one record, one of them lying.
 *
 * This proves the class fix, which rides the FINISHED registration
 * (`resolveItemDetailType`) rather than one loader:
 *
 *   1. ORDER — the organization question is asked BEFORE the read is issued;
 *   2. HONESTY — an empty read with nothing selected is explained by the missing
 *      selection and its remedy, never by a claim about the record;
 *   3. NOT A GATE — the read itself is never refused or held up, because
 *      `docs/official/db-rules.md` §6 forbids making access depend on the ACTIVE
 *      organization (RLS scopes the row to the viewer's memberships);
 *   4. REACH — it holds for a type whose `refineDetail` REPLACES the loader,
 *      which is exactly what both Google types do.
 */

// Referenced from inside a `jest.mock` factory, so both names carry the `mock`
// prefix the hoisting transform requires.
import {
  workspaceReady as mockWorkspaceReady,
  workspaceUnavailable as mockWorkspaceUnavailable,
} from "@/features/organizations/workspaceResolution";

const events: string[] = [];
let workspaceReady = true;
let rowFound = true;

jest.mock("@/features/organizations/awaitWorkspace", () => ({
  awaitOrganizationForRecordRead: async () => {
    events.push("organization-question");
    return workspaceReady
      ? mockWorkspaceReady("11111111-2222-3333-4444-555555555555")
      : mockWorkspaceUnavailable(
          "no-selection",
          "No organization is selected, so there was nothing to read this record from. Pick the one you are working in from the menu under your avatar and it will load.",
        );
  },
}));

jest.mock("@/utils/supabase/client", () => ({
  supabase: {
    schema: () => ({
      from: () => ({
        select: () => ({
          eq: () => ({
            abortSignal: () => ({
              maybeSingle: async () => {
                events.push("record-read");
                return { data: rowFound ? { id: "x" } : null, error: null };
              },
            }),
          }),
        }),
      }),
    }),
  },
}));

// The registry and the frame pull the whole item-presentation surface in; the
// contract under test is the loader the resolver hands back, so both are stood
// in for with the smallest honest shapes.
jest.mock("@/features/item-presentation/registry", () => ({
  getItemConfig: () => ({
    config: {
      label: "Google file",
      icon: () => null,
      detailSource: { schemaName: "workbench", table: "google_document", titleField: "name" },
    },
    recognized: true,
  }),
  entityTokenForItemType: () => null,
}));
jest.mock("@/features/item-presentation/ItemDetailFrame", () => ({
  ItemDetailFrame: () => null,
}));
jest.mock("@/features/item-presentation/sourceHealth", () => ({
  sourceHealthProducerFor: () => null,
}));

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { resolveItemDetailType } = require("@/features/item-presentation/detail") as {
  resolveItemDetailType: (type: string) => {
    load: ((id: string, signal: AbortSignal) => Promise<unknown>) | null;
  } | null;
};

describe("a record read asks the organization question first", () => {
  beforeEach(() => {
    events.length = 0;
    workspaceReady = true;
    rowFound = true;
  });

  it("asks the organization BEFORE issuing the read", async () => {
    const recordType = resolveItemDetailType("google_document_order");
    await recordType?.load?.("abc", new AbortController().signal);
    expect(events).toEqual(["organization-question", "record-read"]);
  });

  it("an empty read with NOTHING selected names the real cause, not the record", async () => {
    rowFound = false;
    workspaceReady = false;
    const recordType = resolveItemDetailType("google_document_honest");
    await expect(
      recordType?.load?.("abc", new AbortController().signal),
    ).rejects.toThrow(/No organization is selected/);
    // The read still happened — access never depends on the ACTIVE organization
    // (db-rules §6), so this explains the empty answer, it does not gate it.
    expect(events).toContain("record-read");
  });

  it("an empty read WITH an organization is still an honest not-found", async () => {
    rowFound = false;
    const recordType = resolveItemDetailType("google_document_missing");
    await expect(
      recordType?.load?.("abc", new AbortController().signal),
    ).resolves.toEqual({ notFound: true });
  });

  it("a found row is never held up by the question", async () => {
    workspaceReady = false;
    const recordType = resolveItemDetailType("google_document_found");
    await expect(
      recordType?.load?.("abc", new AbortController().signal),
    ).resolves.toEqual({ row: { id: "x" } });
  });

  it("holds for a registration whose refineDetail REPLACES the loader", async () => {
    jest.resetModules();
    const bespoke: string[] = [];
    jest.doMock("@/features/item-presentation/registry", () => ({
      getItemConfig: () => ({
        config: {
          label: "Google file",
          icon: () => null,
          detailSource: { schemaName: "workbench", table: "google_document" },
          refineDetail: (base: Record<string, unknown>) => ({
            ...base,
            load: async () => {
              bespoke.push("bespoke-read");
              return rowFound ? { row: { id: "x" } } : { notFound: true };
            },
          }),
        },
        recognized: true,
      }),
      entityTokenForItemType: () => null,
    }));
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const fresh = require("@/features/item-presentation/detail") as {
      resolveItemDetailType: (type: string) => {
        load: ((id: string, signal: AbortSignal) => Promise<unknown>) | null;
      } | null;
    };
    // The bespoke loader IS reached, and only after the question.
    await fresh
      .resolveItemDetailType("google_document_refined")
      ?.load?.("abc", new AbortController().signal);
    expect(events).toEqual(["organization-question"]);
    expect(bespoke).toEqual(["bespoke-read"]);

    // And its empty answer is explained the same way, without the registration
    // having written a line of it.
    events.length = 0;
    bespoke.length = 0;
    rowFound = false;
    workspaceReady = false;
    await expect(
      fresh
        .resolveItemDetailType("google_document_refined_honest")
        ?.load?.("abc", new AbortController().signal),
    ).rejects.toThrow(/No organization is selected/);
    expect(bespoke).toEqual(["bespoke-read"]);
  });
});
