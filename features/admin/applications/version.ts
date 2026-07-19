// features/admin/applications/version.ts
//
// Version comparison for the Applications hub — the ONE place that decides
// whether an installed instance is running below the `min_supported_app_version`
// published in app_config. Shared by the Overview cards and the Installations
// table so both surfaces can never disagree about the same fleet.
//
// Instances that have not reported a version yet (app_version null/blank, and
// anything that is not plain `major.minor.patch`) are deliberately NOT counted
// as below-minimum: "unknown" is its own state and must never be laundered
// into a false compliance failure.

/** Plain `major.minor.patch` — the shape app_config and clients both publish. */
const SEMVER_RE = /^(\d+)\.(\d+)\.(\d+)$/;

export function parseSemver(
  value: string | null | undefined,
): [number, number, number] | null {
  if (!value) return null;
  const match = SEMVER_RE.exec(value.trim());
  if (!match) return null;
  return [Number(match[1]), Number(match[2]), Number(match[3])];
}

/**
 * -1 when `a < b`, 0 when equal, 1 when `a > b`.
 * Returns null when either side is missing or unparseable — callers must
 * handle "unknown" explicitly rather than defaulting it to a comparison.
 */
export function compareSemver(
  a: string | null | undefined,
  b: string | null | undefined,
): -1 | 0 | 1 | null {
  const left = parseSemver(a);
  const right = parseSemver(b);
  if (!left || !right) return null;
  for (let i = 0; i < 3; i += 1) {
    const l = left[i] as number;
    const r = right[i] as number;
    if (l < r) return -1;
    if (l > r) return 1;
  }
  return 0;
}

/** How an instance's reported version relates to the published minimum. */
export type VersionStanding = "ok" | "below" | "unknown";

export function versionStanding(
  appVersion: string | null | undefined,
  minSupported: string | null | undefined,
): VersionStanding {
  const cmp = compareSemver(appVersion, minSupported);
  if (cmp === null) return "unknown";
  return cmp < 0 ? "below" : "ok";
}
