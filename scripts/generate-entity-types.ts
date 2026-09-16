/**
 * generate-entity-types.ts — now a DRIFT GATE, not a generator (W5 swap).
 *
 * The entity-type vocabulary SHIPS IN `@ai-matrx/associations` (generated
 * inside the package at `aidream/apps/shared/associations` from live
 * `platform.entity_types`, released as a PATCH per the package's release
 * contract). This repo keeps NO local copy — every consumer imports
 * `@ai-matrx/associations` directly (the local re-export shim was deleted
 * 2026-09-10, DC-009).
 *
 * What this script does (both `pnpm gen:entity-types` and
 * `pnpm check:entity-types` — same gate, kept under both names so sync-types
 * keeps working unchanged; release.sh runs `check:entity-types`):
 *
 *   1. Reads the live registry (`entity_types_list()` RPC, paged).
 *   2. Diffs it against the INSTALLED package's `ENTITY_TYPE_METADATA` —
 *      token set AND per-token fields.
 *   3. Verifies `SCHEMA_DISPLAY` / `REFERENCE_CATEGORY_DISPLAY` parity.
 *   4. Verifies `ENTITY_OVERLAY` (features/scopes/registry/entityRegistry.ts)
 *      declares no database-owned metadata (titleColumn/contentRole).
 *
 * On drift it FAILS with the fix: regenerate the PACKAGE
 * (`pnpm gen:entity-types` inside aidream/apps/shared/associations), patch-
 * release it, then `pnpm up @ai-matrx/associations` here. There is no local
 * regeneration path any more — that would recreate the two-vocabularies
 * drift C9 exists to kill.
 *
 * Required env (loaded from .env.local automatically):
 *   NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_SECRET_KEY (sb_secret_*) — read-only access to the registry.
 *     — or NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY if the table is anon-readable.
 */

import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { config as loadEnv } from "dotenv";
import { readAllRows } from "@ai-matrx/data/db";
import {
  ENTITY_TYPE_METADATA,
  ENTITY_TYPE_TOKENS,
  SCHEMA_DISPLAY,
  REFERENCE_CATEGORY_DISPLAY,
  type EntityTypeMeta,
} from "@ai-matrx/associations";

loadEnv({ path: ".env.local" });
loadEnv({ path: ".env" });

const ENTITY_REGISTRY_PATH = join(
  __dirname,
  "..",
  "features",
  "scopes",
  "registry",
  "entityRegistry.ts",
);

/** One row of `platform.entity_types` (the columns this gate consumes). */
export interface EntityTypeSourceRow {
  token: string;
  schema_name: string;
  table_name: string;
  label: string;
  base_tier: number;
  is_component: boolean;
  is_module: boolean;
  is_listed: boolean;
  default_scopeable: boolean;
  category: string | null;
  reference_pickable: boolean;
  title_column: string | null;
  content_role: string | null;
  reference_category: string | null;
}

export function loadSupabase() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key =
    process.env.SUPABASE_SECRET_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return null;
  }
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function fetchEntityTypes(): Promise<EntityTypeSourceRow[]> {
  const supabase = loadSupabase();
  if (!supabase) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL and/or SUPABASE_SECRET_KEY / " +
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY in .env.local",
    );
  }
  // The client has no direct grant on `platform.*`; read the registry through
  // the public SECURITY-DEFINER RPC (migrations/entity_types_list_rpc.sql).
  // Paged: a `setof` RPC is subject to the same 1000-row PostgREST cap.
  const rows = await readAllRows<EntityTypeSourceRow>(
    ({ from, to }) =>
      supabase
        .rpc("entity_types_list", {}, { count: "exact" })
        .order("token", { ascending: true })
        .range(from, to) as PromiseLike<{
        data: EntityTypeSourceRow[] | null;
        error: { message: string } | null;
        count?: number | null;
      }>,
    { label: "entity_types_list()" },
  );
  if (rows.length === 0) {
    throw new Error("platform.entity_types returned no active rows — aborting.");
  }
  return [...rows].sort((a, b) => a.token.localeCompare(b.token, "en"));
}

/** The package meta a live row must equal, field for field. */
function rowToMeta(row: EntityTypeSourceRow): Omit<EntityTypeMeta, "token"> {
  return {
    schema: row.schema_name,
    table: row.table_name,
    label: row.label,
    baseTier: row.base_tier,
    isComponent: row.is_component,
    isModule: row.is_module,
    isListed: row.is_listed,
    scopeable: row.default_scopeable,
    category: row.category,
    referencePickable: row.reference_pickable,
    titleColumn: row.title_column,
    contentRole: row.content_role,
    referenceCategory: row.reference_category,
  };
}

const FIX =
  "\n    Fix: regenerate the PACKAGE vocabulary (aidream/apps/shared/associations →" +
  "\n         pnpm gen:entity-types), patch-release @ai-matrx/associations, then" +
  "\n         run `pnpm up @ai-matrx/associations` here. (No local regeneration" +
  "\n         path exists — the vocabulary ships in the package.)\n";

/**
 * THE SCRATCH PREFIX (DC-027 #8, 2026-09-15). Every live self-test that registers a scratch
 * relation names it `zz_<guard>_selftest_<run>` so it is recognisable and sorts last. A `zz_` row in
 * the live registry is a teardown that did not finish; a `zz_` token in the INSTALLED package is
 * that leftover already shipped to every client. Both happened: `check:staff-door --self-test` left
 * `zz_staff_door_selftest_mu0wnnb1_token` registered on 2026-09-14, aidream f1b781fb2 synced it,
 * and @ai-matrx/associations 0.9.15 published it — while this gate stayed GREEN, because a
 * leftover that is both live AND installed is perfectly "in sync". Parity cannot see it; this can.
 */
const SCRATCH_PREFIX = "zz_";

/** The named live-but-not-installed delta. Read from disk so it is one file to audit. */
interface EntityTypeAllowlist {
  readonly allowed?: ReadonlyArray<{ token: string; reason: string; added: string }>;
  readonly allowedFields?: ReadonlyArray<{
    token: string;
    field: string;
    reason: string;
    added: string;
  }>;
}
const ALLOWLIST: EntityTypeAllowlist = JSON.parse(
  readFileSync(join(import.meta.dirname ?? __dirname, "entity-types-allowlist.json"), "utf8"),
) as EntityTypeAllowlist;

export function findScratchRegistrations(
  liveRows: ReadonlyArray<Pick<EntityTypeSourceRow, "token" | "schema_name">>,
  installed: Readonly<Record<string, { schema: string }>>,
): { live: string[]; installed: string[] } {
  const isScratch = (token: string, schema: string) =>
    token.startsWith(SCRATCH_PREFIX) || schema.startsWith(SCRATCH_PREFIX);
  return {
    live: liveRows.filter((r) => isScratch(r.token, r.schema_name)).map((r) => `${r.token} → ${r.schema_name}`),
    installed: Object.entries(installed)
      .filter(([token, meta]) => isScratch(token, meta.schema))
      .map(([token, meta]) => `${token} → ${meta.schema}`),
  };
}

async function main(): Promise<void> {
  const rows = await fetchEntityTypes();

  // 0. No self-test scratch registration, live or shipped. Checked BEFORE parity, because a
  //    leftover that is live and installed at once passes parity by construction.
  const scratch = findScratchRegistrations(
    rows,
    ENTITY_TYPE_METADATA as unknown as Record<string, { schema: string }>,
  );
  if (scratch.live.length > 0 || scratch.installed.length > 0) {
    console.error(
      `\n  ✗ Self-test SCRATCH registrations (prefix "${SCRATCH_PREFIX}") are present — a guard's teardown did not finish.` +
        (scratch.live.length
          ? `\n    Live in platform.entity_types: ${scratch.live.join(", ")}` +
            "\n      If no self-test is running this minute, remove each through a migration applied with" +
            "\n      `pnpm db:apply` (delete the platform.entity_types row, then `drop schema if exists <schema> cascade`)."
          : "") +
        (scratch.installed.length
          ? `\n    Shipped in the installed @ai-matrx/associations: ${scratch.installed.join(", ")}` +
            "\n      After the live rows are gone: aidream/apps/shared/associations → pnpm gen:entity-types," +
            "\n      patch-release, then `pnpm up @ai-matrx/associations` here."
          : "") +
        "\n",
    );
    process.exit(1);
  }

  // 1. Token-set parity.
  const liveTokens = new Set(rows.map((r) => r.token));
  const installedTokens = new Set<string>(ENTITY_TYPE_TOKENS);
  const allMissing = [...liveTokens].filter((t) => !installedTokens.has(t));
  const extra = [...installedTokens].filter((t) => !liveTokens.has(t));

  // 1a. THE NAMED DELTA (ATTACK-6 findings 5 and 9c). The vocabulary ships in the
  // package and the package is `latest` — never pinned (THE LATEST LAW) — so a token
  // registered on production by ANY lane makes this gate red for EVERY release in this
  // repo until the package is regenerated and published. `release.sh:526` calls `fail`,
  // so that window is a stopped platform, not a stopped lane. A token listed in
  // scripts/entity-types-allowlist.json with a reason and a date is subtracted here and
  // ANNOUNCED; anything else still fails. A STALE entry fails too — see below — which is
  // what stops this file becoming a place tokens go to be forgotten.
  const allowed = new Map<string, { reason: string; added: string }>(
    (ALLOWLIST.allowed ?? []).map((a) => [a.token, { reason: a.reason, added: a.added }]),
  );
  const staleAllowed = [...allowed.keys()].filter(
    (t) => installedTokens.has(t) || !liveTokens.has(t),
  );
  if (staleAllowed.length > 0) {
    console.error(
      `\n  ✗ scripts/entity-types-allowlist.json is STALE — ${staleAllowed.length} entr` +
        `${staleAllowed.length === 1 ? "y is" : "ies are"} no longer a live delta: ` +
        `${staleAllowed.join(", ")}.` +
        "\n    Each of these is now either shipped in the installed package or no longer live," +
        "\n    so the waiver has nothing left to waive. Delete the entr" +
        `${staleAllowed.length === 1 ? "y" : "ies"} from that file.\n`,
    );
    process.exit(1);
  }
  const missing = allMissing.filter((t) => !allowed.has(t));
  const waived = allMissing.filter((t) => allowed.has(t));
  if (waived.length > 0) {
    // Nothing passes silently either: the waiver is as loud as the failure.
    console.log(
      `  ! ${waived.length} live token(s) are NOT in the installed @ai-matrx/associations ` +
        `and are allowed by name (scripts/entity-types-allowlist.json):`,
    );
    for (const t of waived) {
      const a = allowed.get(t)!;
      console.log(`      ${t}  [allowed ${a.added}] ${a.reason}`);
    }
  }

  if (missing.length > 0 || extra.length > 0) {
    console.error(
      `\n  ✗ Installed @ai-matrx/associations vocabulary (${installedTokens.size} tokens) ` +
        `is OUT OF SYNC with platform.entity_types (${liveTokens.size} live tokens).` +
        (missing.length ? `\n    Live but not installed: ${missing.join(", ")}` : "") +
        (extra.length ? `\n    Installed but not live: ${extra.join(", ")}` : "") +
        FIX,
    );
    process.exit(1);
  }

  // 2. Per-token field parity. A waived token has no installed metadata to compare —
  // that is what "not installed" means — so it is skipped here and nowhere else.
  const waivedSet = new Set(waived);
  // A FIELD delta is the same class as a token delta: the live row moved and the package
  // has not been republished yet. Same file, same reason-and-date, same staleness rule.
  const allowedFields = new Map<string, { reason: string; added: string }>(
    (ALLOWLIST.allowedFields ?? []).map((a) => [`${a.token}.${a.field}`, a]),
  );
  const usedFieldWaivers = new Set<string>();
  const drifted: string[] = [];
  for (const row of rows) {
    if (waivedSet.has(row.token)) continue;
    const meta = ENTITY_TYPE_METADATA[row.token as keyof typeof ENTITY_TYPE_METADATA];
    const want = rowToMeta(row);
    for (const [field, value] of Object.entries(want)) {
      const got = (meta as unknown as Record<string, unknown>)[field];
      if (got !== value) {
        const key = `${row.token}.${field}`;
        const waiver = allowedFields.get(key);
        if (waiver) {
          usedFieldWaivers.add(key);
          console.log(
            `  ! ${key} drifted (installed ${JSON.stringify(got)} vs live ` +
              `${JSON.stringify(value)}) and is allowed by name [allowed ${waiver.added}] ` +
              `${waiver.reason}`,
          );
          continue;
        }
        drifted.push(
          `${row.token}.${field}: installed ${JSON.stringify(got)} vs live ${JSON.stringify(value)}`,
        );
      }
    }
  }
  // Every drift at once. A gate that names one of twenty makes you run it twenty times.
  if (drifted.length > 0) {
    console.error(
      `\n  ✗ ${drifted.length} installed/live field drift(s) in @ai-matrx/associations:` +
        drifted.map((d) => `\n    ${d}`).join("") +
        FIX,
    );
    process.exit(1);
  }
  const staleFieldWaivers = [...allowedFields.keys()].filter((k) => !usedFieldWaivers.has(k));
  if (staleFieldWaivers.length > 0) {
    console.error(
      `\n  ✗ scripts/entity-types-allowlist.json is STALE — ${staleFieldWaivers.length} field ` +
        `waiver(s) no longer describe a drift: ${staleFieldWaivers.join(", ")}.` +
        "\n    The installed package and the live row agree again, so the waiver has nothing" +
        "\n    left to waive. Delete those entries.\n",
    );
    process.exit(1);
  }

  // 3. Display-map parity against their actual sources: SCHEMA_DISPLAY
  //    mirrors `platform.schemas` (entity_schemas_list) and
  //    REFERENCE_CATEGORY_DISPLAY mirrors `platform.reference_categories`
  //    (reference_categories_list) — the same RPCs the package generator
  //    reads. Existence-level check on every live key.
  const supabase = loadSupabase();
  if (supabase) {
    const schemas = await readAllRows<{ schema_name: string }>(
      ({ from, to }) =>
        supabase
          .rpc("entity_schemas_list", {}, { count: "exact" })
          .order("schema_name", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: { schema_name: string }[] | null;
          error: { message: string } | null;
          count?: number | null;
        }>,
      { label: "entity_schemas_list()" },
    );
    for (const s of schemas) {
      if (!(s.schema_name in SCHEMA_DISPLAY)) {
        console.error(
          `\n  ✗ Live platform.schemas row "${s.schema_name}" is missing from ` +
            `the installed SCHEMA_DISPLAY.` +
            FIX,
        );
        process.exit(1);
      }
    }
    const refCats = await readAllRows<{ slug: string }>(
      ({ from, to }) =>
        supabase
          .rpc("reference_categories_list", {}, { count: "exact" })
          .order("slug", { ascending: true })
          .range(from, to) as PromiseLike<{
          data: { slug: string }[] | null;
          error: { message: string } | null;
          count?: number | null;
        }>,
      { label: "reference_categories_list()" },
    );
    for (const c of refCats) {
      if (!(c.slug in REFERENCE_CATEGORY_DISPLAY)) {
        console.error(
          `\n  ✗ Live reference category "${c.slug}" is missing from the ` +
            `installed REFERENCE_CATEGORY_DISPLAY.` +
            FIX,
        );
        process.exit(1);
      }
    }
  }

  // 4. ENTITY_OVERLAY carries no database-owned metadata.
  const registrySource = readFileSync(ENTITY_REGISTRY_PATH, "utf8");
  const overlaySource = registrySource.match(
    /const ENTITY_OVERLAY:[\s\S]*?=\s*\{([\s\S]*?)\n\};\n\n\/\*\* Fallback icon/,
  )?.[1];
  if (overlaySource === undefined) {
    console.error(
      "\n  ✗ Could not locate ENTITY_OVERLAY in entityRegistry.ts; " +
        "the database-metadata duplication guard cannot run.\n",
    );
    process.exit(1);
  }
  const forbiddenOverlayField = overlaySource.match(
    /\b(titleColumn|contentRole)\s*:/,
  )?.[1];
  if (forbiddenOverlayField !== undefined) {
    console.error(
      `\n  ✗ ENTITY_OVERLAY declares database-owned "${forbiddenOverlayField}".\n` +
        "    Set title_column/content_role in platform.entity_types (then " +
        "regenerate the package); handwritten fallbacks are forbidden.\n",
    );
    process.exit(1);
  }

  console.log(
    `  ✓ Installed @ai-matrx/associations vocabulary matches the live registry ` +
      `(${rows.length} tokens).`,
  );
  console.log("  ✓ ENTITY_OVERLAY contains no database-owned metadata.");
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
