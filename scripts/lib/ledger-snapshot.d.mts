/**
 * Types for `ledger-snapshot.mjs`.
 *
 * The module itself is plain JavaScript ON PURPOSE — it is imported by a git hook, which
 * must run in milliseconds on a checkout whose `node_modules` may be mid-install (this
 * repo's `tsx` shim has been broken for days). This file is how the TypeScript callers
 * (`apply-migration.ts`, `refresh-ledger-snapshot.ts`) still get checked against it.
 */
export interface LedgerRow {
  source: string;
  filename: string;
  checksum: string;
  applied_at: string;
}

export interface LedgerSnapshot {
  note?: string;
  generated_at: string | null;
  files: Record<string, LedgerRow>;
}

export interface GrandfatheredRow {
  ledgered: string;
  applied_at: string;
  tree: string;
}

export interface Refusal {
  relPath: string;
  ledgered: string;
  got: string | null;
  why: string;
}

export const REPO_ROOT: string;
export const MIGRATIONS_REL: string;
export const SNAPSHOT_REL: string;
export const SNAPSHOT_PATH: string;
export const GUARDED_DIRS: readonly string[];
export const REFUSAL_SENTENCE: string;
export const TRAILER_KEY: string;
export const GRANDFATHERED: Record<string, GrandfatheredRow>;

export function sha256(bytes: string | Uint8Array): string;
export function isGuardedPath(relPath: string): boolean;
export function readSnapshot(
  path?: string,
): { ok: true; snapshot: LedgerSnapshot } | { ok: false; why: string };
export function emptySnapshot(): LedgerSnapshot;
export function writeSnapshot(snapshot: LedgerSnapshot, path?: string): void;
export function recordAppliedRow(
  row: {
    relPath: string;
    source: string;
    filename: string;
    checksum: string;
    appliedAt?: string | null;
  },
  path?: string,
): string | null;
export function messageAllows(
  message: string | null | undefined,
  relPath: string,
  newChecksum: string,
): boolean;
export function judge(
  candidates: readonly { relPath: string; bytes: Uint8Array | null }[],
  snapshot: LedgerSnapshot,
  message: string | null,
): Refusal[];
export function formatRefusals(
  refusals: readonly Refusal[],
  opts: { where: string; verdict?: string },
): string;
export function trailerLine(relPath: string, newChecksum: string): string;
export function receiptPath(gitDir: string): string;
