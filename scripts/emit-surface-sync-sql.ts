/**
 * One-off: emit the SQL to mirror ALL_MANIFESTS into ui.ui_surface_value.
 *
 * Prints, to stdout:
 *   1. A guard SELECT listing any manifest surfaces missing a ui_surface row.
 *   2. An upsert for every SurfaceValue across every registered manifest.
 *
 * Used to sync the DB when the authenticated /api/admin/surfaces/sync-manifests
 * endpoint isn't reachable (e.g. from CI / an agent shell). The endpoint
 * remains the canonical path; this is a faithful SQL mirror of its upsert.
 */

import { getAllManifests } from "@/features/surfaces/manifests/registry";

function sqlString(s: string): string {
  return `'${s.replace(/'/g, "''")}'`;
}

function main() {
  const manifests = getAllManifests();
  const surfaceNames = manifests.map((m) => m.surfaceName);

  const rows: string[] = [];
  for (const m of manifests) {
    for (const v of m.values) {
      rows.push(
        `(${sqlString(m.surfaceName)}, ${sqlString(v.name)}, ${sqlString(
          v.label,
        )}, ${sqlString(v.description)}, ${sqlString(v.valueType)}, ${
          v.alwaysAvailable
        }, ${v.typicalCharCount}, ${v.sortOrder ?? 1000})`,
      );
    }
  }

  console.log("-- Guard: manifest surfaces missing a ui_surface row");
  console.log(
    `SELECT s.name FROM (VALUES ${surfaceNames
      .map((n) => `(${sqlString(n)})`)
      .join(", ")}) AS s(name) LEFT JOIN ui.ui_surface u ON u.name = s.name WHERE u.name IS NULL;`,
  );
  console.log("");
  console.log("-- Upsert all manifest values");
  console.log(
    `INSERT INTO ui.ui_surface_value (surface_name, name, label, description, value_type, always_available, typical_char_count, sort_order) VALUES`,
  );
  console.log(rows.join(",\n"));
  console.log(
    `ON CONFLICT (surface_name, name) DO UPDATE SET label = EXCLUDED.label, description = EXCLUDED.description, value_type = EXCLUDED.value_type, always_available = EXCLUDED.always_available, typical_char_count = EXCLUDED.typical_char_count, sort_order = EXCLUDED.sort_order, updated_at = now();`,
  );
}

main();
