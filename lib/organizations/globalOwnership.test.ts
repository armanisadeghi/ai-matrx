// The guard for the write→read gap that made every global shortcut category
// invisible on production (2026-08-31, v0.4.1588).
//
// This walks the REAL production shape end to end: a `platform.categories` row
// owned by the system org → the legacy wire adapter → the redux converter →
// the shared scope rule every list on every surface filters with. Assertion 1
// pins the REGRESSION ITSELF (the raw row is not global, which is why 55 rows
// rendered as zero); assertion 2 pins the fix. Both go red against the pre-fix
// tree, where `toGlobalOwnershipWire` did not exist.

import {
  toGlobalOwnershipWire,
  toGlobalOwnershipWireList,
  toGlobalOwnershipRecord,
  fromGlobalOwnershipRecord,
} from "@/lib/organizations/globalOwnership";
import {
  platformCategoryToLegacyRow,
  coerceLegacyCategoryIsActive,
} from "@/app/api/agent-shortcut-categories/_lib/categoryRow";
import { categoryRowToDef } from "@/features/agents/redux/agent-shortcut-categories/converters";
import { matchesScope } from "@/features/agents/redux/shared/scope";

// The live values, read out of the platform DB on 2026-08-31.
const SYSTEM_ORG_ID = "39c38960-d30c-4840-b0c1-c9960de95582";
const TENANT_ORG_ID = "3e790542-fdaf-40b2-8bf3-658bf94fe67f";

// Shape of a real global row: `Text Operations`, dimension `shortcut`.
const systemOrgCategoryRow = {
  id: "78ee12ee-3a68-4541-9d7c-d856765a6311",
  name: "Text Operations",
  icon: null,
  color: null,
  placement_type: "ai-action",
  parent_id: null,
  position: 1,
  organization_id: SYSTEM_ORG_ID,
  created_at: "2026-06-28T00:09:38.051Z",
  updated_at: "2026-06-28T00:09:38.051Z",
  metadata: {
    is_active: true,
    description: "AI tools for explaining, summarizing, translating text",
    legacy_table: "shortcut_categories",
    enabled_features: ["general"],
  },
};

// Shape of a real user row: `E-commerce`, owned inside a tenant org.
const userCategoryRow = {
  ...systemOrgCategoryRow,
  id: "5fbc14ff-9b90-44a3-9cc0-01d73c84c51d",
  name: "E-commerce",
  organization_id: TENANT_ORG_ID,
  metadata: {
    ...systemOrgCategoryRow.metadata,
    user_id: "4cf62e4e-2679-484f-b652-034e697418df",
  },
};

const toDef = (row: typeof systemOrgCategoryRow) =>
  categoryRowToDef(
    coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(row)) as never,
  );

const toWiredDef = (row: typeof systemOrgCategoryRow) =>
  categoryRowToDef(
    toGlobalOwnershipWire(
      coerceLegacyCategoryIsActive(platformCategoryToLegacyRow(row)),
      SYSTEM_ORG_ID,
    ) as never,
  );

describe("global ownership on the wire", () => {
  it("THE REGRESSION: a raw system-org row does not read as global", () => {
    // This is exactly why the admin Categories list and both global shortcut
    // lists showed zero while 55 rows existed and were returned by PostgREST.
    const def = toDef(systemOrgCategoryRow);
    expect(def.organizationId).toBe(SYSTEM_ORG_ID);
    expect(matchesScope(def, { scope: "global", scopeId: null })).toBe(false);
  });

  it("a system-org row reads as global once it goes out through the wire rule", () => {
    const def = toWiredDef(systemOrgCategoryRow);
    expect(def.organizationId).toBeNull();
    expect(matchesScope(def, { scope: "global", scopeId: null })).toBe(true);
  });

  it("a real tenant org is left alone", () => {
    const def = toWiredDef(userCategoryRow);
    expect(def.organizationId).toBe(TENANT_ORG_ID);
    expect(matchesScope(def, { scope: "global", scopeId: null })).toBe(false);
    expect(
      matchesScope(def, { scope: "organization", scopeId: TENANT_ORG_ID }),
    ).toBe(true);
  });

  it("maps a list and leaves non-system rows identical by reference", () => {
    const tenantRow = { organization_id: TENANT_ORG_ID, id: "a" };
    const [globalOut, tenantOut] = toGlobalOwnershipWireList(
      [{ organization_id: SYSTEM_ORG_ID, id: "b" }, tenantRow],
      SYSTEM_ORG_ID,
    );
    expect(globalOut.organization_id).toBeNull();
    expect(tenantOut).toBe(tenantRow);
  });

  it("applies the same rule to camelCase records the thunks put in the store", () => {
    expect(
      toGlobalOwnershipRecord({ organizationId: SYSTEM_ORG_ID }, SYSTEM_ORG_ID)
        .organizationId,
    ).toBeNull();
    expect(
      toGlobalOwnershipRecord({ organizationId: TENANT_ORG_ID }, SYSTEM_ORG_ID)
        .organizationId,
    ).toBe(TENANT_ORG_ID);
  });

  it("puts the system org back for a write, because the column is NOT NULL", () => {
    expect(
      fromGlobalOwnershipRecord({ organizationId: null }, SYSTEM_ORG_ID)
        .organizationId,
    ).toBe(SYSTEM_ORG_ID);
    expect(
      fromGlobalOwnershipRecord({ organizationId: TENANT_ORG_ID }, SYSTEM_ORG_ID)
        .organizationId,
    ).toBe(TENANT_ORG_ID);
  });

  it("clears the PERSON on a system-org row, not just the organization", () => {
    // Storage stamps an actor over the client's deliberate null
    // (`COALESCE(NEW.created_by, v_actor)` in mandate.vw_shortcut's trigger),
    // and the client reads a person as "personal scope". A global shortcut an
    // admin just saved must not come back as that admin's own.
    const stamped = {
      organization_id: SYSTEM_ORG_ID,
      created_by: "87a6e699-3622-4869-8843-d0867456c0dd", // admin@admin.com
      label: "ZZ-GLOBAL",
    };
    const wired = toGlobalOwnershipWire(stamped, SYSTEM_ORG_ID);
    expect(wired.organization_id).toBeNull();
    expect(wired.created_by).toBeNull();
    expect(wired.label).toBe("ZZ-GLOBAL");

    // A tenant row keeps BOTH — the creator there is real ownership.
    const personal = { ...stamped, organization_id: TENANT_ORG_ID };
    expect(toGlobalOwnershipWire(personal, SYSTEM_ORG_ID)).toBe(personal);
  });

  it("classifies a stamped global shortcut as global, not personal", () => {
    const stampedRecord = {
      organizationId: SYSTEM_ORG_ID,
      userId: "87a6e699-3622-4869-8843-d0867456c0dd",
      projectId: null,
      taskId: null,
    };
    // THE REGRESSION: raw, it reads as that admin's personal shortcut.
    expect(matchesScope(stampedRecord, { scope: "global", scopeId: null })).toBe(
      false,
    );
    expect(matchesScope(stampedRecord, { scope: "user", scopeId: null })).toBe(
      true,
    );

    const fixed = toGlobalOwnershipRecord(stampedRecord, SYSTEM_ORG_ID);
    expect(matchesScope(fixed, { scope: "global", scopeId: null })).toBe(true);
    expect(matchesScope(fixed, { scope: "user", scopeId: null })).toBe(false);
  });

  it("round-trips: read as global, written back as the system org", () => {
    const read = toGlobalOwnershipRecord(
      { organizationId: SYSTEM_ORG_ID },
      SYSTEM_ORG_ID,
    );
    expect(
      fromGlobalOwnershipRecord(read, SYSTEM_ORG_ID).organizationId,
    ).toBe(SYSTEM_ORG_ID);
  });
});
