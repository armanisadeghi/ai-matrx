// The guard for "a global shortcut is labelled Personal / <the admin who made it>".
//
// The admin All-Shortcuts directory merges TWO sources that overlap and
// disagree about the same row:
//   1. `globalQuery.shortcuts` — the authoritative global read, which labels
//      every row it returns `system`.
//   2. `agx_list_non_global_shortcuts_for_admin_m` — whose name is a promise it
//      no longer keeps. Its WHERE still defines non-global the pre-flip way
//      (`NOT (created_by IS NULL AND organization_id IS NULL AND …)`), so now
//      that every global row is owned by the SYSTEM organization, EVERY global
//      shortcut satisfies it. And its scope CASE tests
//      `created_by IS NOT NULL → 'user'` BEFORE the organization, while
//      `mandate.vw_shortcut`'s trigger does `COALESCE(NEW.created_by, v_actor)`.
//
// So a global shortcut an admin had just saved came back from source 2 labelled
// `user`, and because it was written into the merge map SECOND it overwrote the
// correct row. Verified on production v0.4.1593: Scope read exactly
// "Personal / admin@admin.com".
//
// The rule this pins: **the global read wins.** A row it already claimed is
// global by definition, and a list of non-global rows cannot overrule it —
// regardless of what that function's stale WHERE decides to return.

type Row = { id: string; label: string; scopeType: string; scopeName: string };

/** The merge exactly as `useShortcutDirectory` performs it in admin mode. */
function mergeAdminRows(globalRows: Row[], nonGlobalRows: Row[]): Row[] {
  const merged = new Map<string, Row>();
  for (const row of nonGlobalRows) merged.set(row.id, row);
  for (const row of globalRows) merged.set(row.id, row);
  return Array.from(merged.values()).sort((a, b) =>
    a.label.localeCompare(b.label),
  );
}

const SHORTCUT_ID = "b0dd8020-4961-40ab-90bb-e0511c815d04"; // the walked row

// What the global read says about it — correct.
const asGlobal: Row = {
  id: SHORTCUT_ID,
  label: "ZZ-WALK6C-SHORTCUT",
  scopeType: "system",
  scopeName: "System",
};

// What the "non-global" RPC says about the SAME row — wrong, because the
// storage trigger stamped a creator onto a global write.
const asPersonal: Row = {
  id: SHORTCUT_ID,
  label: "ZZ-WALK6C-SHORTCUT",
  scopeType: "user",
  scopeName: "admin@admin.com",
};

const someonesRealPersonal: Row = {
  id: "aaaaaaaa-0000-0000-0000-000000000001",
  label: "A real personal shortcut",
  scopeType: "user",
  scopeName: "someone@example.com",
};

describe("admin shortcut directory scope precedence", () => {
  it("THE REGRESSION: writing non-global last relabels a global row as personal", () => {
    // The pre-fix order, pinned so it cannot come back unnoticed.
    const preFix = new Map<string, Row>();
    for (const row of [asGlobal]) preFix.set(row.id, row);
    for (const row of [asPersonal]) preFix.set(row.id, row);
    expect(preFix.get(SHORTCUT_ID)!.scopeType).toBe("user");
    expect(preFix.get(SHORTCUT_ID)!.scopeName).toBe("admin@admin.com");
  });

  it("the global read wins when the two sources disagree", () => {
    const rows = mergeAdminRows([asGlobal], [asPersonal]);
    const row = rows.find((r) => r.id === SHORTCUT_ID)!;
    expect(row.scopeType).toBe("system");
    expect(row.scopeName).toBe("System");
    expect(row.scopeName).not.toContain("@"); // never a person
  });

  it("keeps the row exactly once — precedence, not duplication", () => {
    expect(mergeAdminRows([asGlobal], [asPersonal])).toHaveLength(1);
  });

  it("leaves a genuinely non-global row alone", () => {
    const rows = mergeAdminRows([asGlobal], [asPersonal, someonesRealPersonal]);
    expect(rows).toHaveLength(2);
    const personal = rows.find((r) => r.id === someonesRealPersonal.id)!;
    expect(personal.scopeType).toBe("user");
    expect(personal.scopeName).toBe("someone@example.com");
  });

  it("still shows non-global rows the global read never returned", () => {
    const rows = mergeAdminRows([], [someonesRealPersonal]);
    expect(rows).toHaveLength(1);
    expect(rows[0].scopeType).toBe("user");
  });
});
