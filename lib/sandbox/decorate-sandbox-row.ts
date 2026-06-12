/**
 * Single point of normalization between a raw `sandbox_instances` row and
 * the `SandboxInstance` shape the FE consumes.
 *
 * Why this exists:
 *   The orchestrator returns a `proxy_url` on every fresh `SandboxResponse`,
 *   but we deliberately don't persist it (the URL is recomputable from
 *   `${MATRX_<tier>_ORCHESTRATOR_URL}/sandboxes/<sandbox_id>/proxy`). For
 *   weeks the Next.js routes silently dropped that field on the floor —
 *   `await fetch().json() as SandboxInstance[]` made TS happy because the
 *   hand-rolled `SandboxInstance` lied about the DB shape, and `strict:false`
 *   meant the lie was never caught.
 *
 *   Funneling every route through this helper closes that loophole:
 *     - The input type is the DB Row (the source of truth from `pnpm types`).
 *     - The return type is `SandboxInstance` (Row + decorations).
 *     - If the DB drops a column, the Row type changes and every downstream
 *       reference to the dropped column fails to compile.
 *     - If a new decoration is added to `SandboxInstanceDecorations`, every
 *       `decorateSandboxRow()` call site fails until it's filled in.
 *
 * Server-only — never import from a Client Component.
 */

import type {
  SandboxInstance,
  SandboxInstanceRow,
  SandboxStatus,
  SandboxStopReason,
  SandboxConfig,
  SandboxTier,
} from "@/types/sandbox";
import { buildSandboxProxyUrl } from "./orchestrator-routing";

/**
 * Promote a raw Supabase row into a `SandboxInstance`:
 *   - narrow stringly-typed columns (status, stop_reason) to their unions
 *   - parse the JSONB `config` slot into our domain shape
 *   - resolve the effective tier (top-level column wins, `config.tier` is
 *     the legacy fallback for rows written before the column existed)
 *   - attach orchestrator-derived `proxy_url`
 */
export function decorateSandboxRow(row: SandboxInstanceRow): SandboxInstance {
  const config = (row.config as SandboxConfig | null) ?? null;
  // DB column wins; fall back to `config.tier` so legacy rows that pre-date
  // the dedicated column still route to the right orchestrator. Stringly-
  // typed `row.tier` (`string | null`) gets narrowed to the union here —
  // an unknown value would land as `null` rather than corrupt routing.
  const persistedTier =
    row.tier === "ec2" || row.tier === "hosted" ? row.tier : null;
  const configTier =
    config?.tier === "ec2" || config?.tier === "hosted" ? config.tier : null;
  const tier: SandboxTier | null = persistedTier ?? configTier ?? null;
  if (tier === null) {
    console.error(
      `[decorateSandboxRow] sandbox row ${row.id} (sandbox_id: ${row.sandbox_id}) has no tier set ` +
        "in either the dedicated column or config.tier. " +
        "This sandbox was created before tier tracking existed or was created without an explicit tier. " +
        "Update the row to 'ec2' or 'hosted' to suppress this error.",
    );
  }

  return {
    ...row,
    // The unions below are Postgres CHECK-constrained on the backend, so
    // narrowing via cast is safe; the cast is the *only* trust boundary
    // and lives here so consumers don't have to repeat it everywhere.
    status: row.status as SandboxStatus,
    stop_reason: row.stop_reason as SandboxStopReason | null,
    config,
    tier,
    proxy_url: buildSandboxProxyUrl(row.sandbox_id, tier),
  };
}
