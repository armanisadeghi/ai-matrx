/**
 * Provenance for the four surface MIRROR tables — WHO ran a manifest sync and
 * WHERE it ran from.
 *
 * Columns: `ui.ui_surface_{value,agent_role,write_target,client_tool}
 * .synced_by / .synced_from` (migration `ui_surface_mirror_provenance.sql`).
 *
 * THE RULE THIS FILE EXISTS TO KEEP: `synced_from` states only what the running
 * channel can actually PROVE, and when it can prove nothing it says so in the
 * value. There is no git command here, no `require("package.json")`, and no
 * invented build number — a stamp that guesses is worse than one that admits
 * ignorance, because an admin deciding whether to delete a stale row would act
 * on the guess. `local` and `sha-unknown` are therefore first-class answers,
 * not failures.
 */

/** Every stamp starts with this, so a mirror row's origin is greppable. */
export const MIRROR_SYNC_PREFIX = "manifest-sync";

/** The two channels that may write a mirror row. */
export type MirrorSyncChannel = "api" | "sql";

/** Short, human-comparable form of a commit sha. */
function shortSha(sha: string): string {
  return sha.trim().slice(0, 7);
}

/**
 * The stamp for the admin ENDPOINT (`/api/admin/surfaces/sync-manifests`).
 *
 * Runtime identity, best first:
 *   1. `VERCEL_GIT_COMMIT_SHA` — the exact commit this deployment was built
 *      from; the strongest fact available, and the one an agent reading a
 *      stale row wants ("which branch's code declared this?").
 *   2. `VERCEL_DEPLOYMENT_ID` — no commit, but still a unique deployment an
 *      operator can look up.
 *   3. `local` — neither is set, which on this platform means a developer's
 *      dev server. Recorded plainly, because "a row synced from someone's
 *      laptop" is exactly the provenance a reviewer needs to see.
 */
export function apiSyncedFrom(
  env: NodeJS.ProcessEnv = process.env,
): string {
  const sha = env.VERCEL_GIT_COMMIT_SHA?.trim();
  if (sha) return `${MIRROR_SYNC_PREFIX}:api:${shortSha(sha)}`;
  const deployment = env.VERCEL_DEPLOYMENT_ID?.trim();
  if (deployment) return `${MIRROR_SYNC_PREFIX}:api:deploy-${deployment}`;
  return `${MIRROR_SYNC_PREFIX}:api:local`;
}

/**
 * The stamp for the SQL emitter (`scripts/emit-surface-sync-sql.ts`), which
 * runs in a checkout and therefore can read the working tree's commit — the
 * caller passes what it read, and passes nothing when git was unavailable.
 * There is no session behind this channel, so `synced_by` stays NULL: the SQL
 * is applied by whoever runs it, and inventing an actor here would be a lie the
 * drift report then repeats.
 */
export function sqlSyncedFrom(sha: string | null | undefined): string {
  const trimmed = sha?.trim();
  return trimmed
    ? `${MIRROR_SYNC_PREFIX}:sql:${shortSha(trimmed)}`
    : `${MIRROR_SYNC_PREFIX}:sql:sha-unknown`;
}

/** The pair stamped onto every mirror row a sync writes. */
export interface MirrorSyncProvenance {
  /** auth user id, or null for a channel with no session (the SQL emitter). */
  syncedBy: string | null;
  /** Channel + build identity. Never empty — see the rule at the top. */
  syncedFrom: string;
}
