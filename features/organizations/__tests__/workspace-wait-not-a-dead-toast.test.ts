/**
 * "STILL LOADING — TRY AGAIN" IS NOT A REMEDY.
 *
 * Expert Book Challenge wall W39 (2026-09-12): the guided start refused Start
 * with the red toast "Your workspace is still loading — try again in a
 * moment", for more than half a minute on a warm page, and only a reload
 * cured it.
 *
 * The class is an ACTION handler that reads the app-context organization once
 * and bails. It is wrong in both of the states a null organization can mean:
 * during bootstrap the answer was milliseconds away and it refused; after
 * bootstrap with nothing selected it says "still loading" about something
 * that is never coming — a screen that lies (law 4), and a retry loop with no
 * exit.
 *
 * THE FIX IS `awaitEffectiveOrganizationId()` (features/organizations/
 * awaitWorkspace.ts): the action WAITS, bounded, and when the wait settles
 * with nothing the person is told the truth and given the remedy.
 *
 * This guard pins both halves:
 *   1. The primitive actually waits — an organization that lands AFTER the
 *      press is still used, which is exactly what the old handler could not
 *      do. (Red before the fix: there was no primitive to wait with.)
 *   2. No surface under `features/` or `app/` tells a person that the
 *      workspace or organization is still loading and to try the action
 *      again. A new offender fails here with its path.
 */

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const REPO_ROOT = join(__dirname, "..", "..", "..");

// ── 1. The primitive waits ──────────────────────────────────────────────────

let organizationId: string | null = null;
let admissionResolve: (() => void) | null = null;

jest.mock("@/lib/redux/store-singleton", () => ({
  getStoreSingleton: () => ({
    getState: () => ({
      appContext: {
        organization_id: organizationId,
        personal_organization_id: null,
      },
    }),
  }),
}));

jest.mock("@/lib/api/organization-admission", () => ({
  waitForOrganizationAdmission: () =>
    new Promise<string>((resolve) => {
      admissionResolve = () => resolve("ready");
    }),
}));

describe("awaitEffectiveOrganizationId", () => {
  beforeEach(() => {
    organizationId = null;
    admissionResolve = null;
  });

  it("uses a workspace that arrives AFTER the press, instead of refusing", async () => {
    const { awaitEffectiveOrganizationId } = await import("../awaitWorkspace");
    const pending = awaitEffectiveOrganizationId();
    // The bootstrap lands a moment after the person pressed the button —
    // precisely the race that produced W39.
    await Promise.resolve();
    organizationId = "6f0e3a2c-0000-4000-8000-000000000001";
    admissionResolve?.();
    await expect(pending).resolves.toEqual({
      status: "ready",
      organizationId: "6f0e3a2c-0000-4000-8000-000000000001",
    });
  });

  it("answers honestly, with a remedy and no retry, when none arrives", async () => {
    jest.useFakeTimers();
    const { awaitEffectiveOrganizationId } = await import("../awaitWorkspace");
    const pending = awaitEffectiveOrganizationId();
    await Promise.resolve();
    jest.advanceTimersByTime(10_000);
    const result = await pending;
    jest.useRealTimers();
    expect(result.status).toBe("unavailable");
    const reason = result.status === "unavailable" ? result.reason : "";
    expect(reason).toMatch(/avatar/i);
    expect(reason).not.toMatch(/still loading/i);
    expect(reason).not.toMatch(/in a moment/i);
  });
});

// ── 2. Nobody re-grows the dead toast ───────────────────────────────────────

/**
 * Out of this class, with the reason. `ResearchTopicSelect` gates on the SITE
 * RECORD's organization, not the app-context bootstrap, so waiting on
 * admission would file the topic in the wrong workspace. Its sentence is a
 * separate (milder) defect owned by the marketing surfaces.
 */
const OUT_OF_CLASS = [
  "features/marketing/content-plan/components/ResearchTopicSelect.tsx",
  // The fix itself — its doc comment QUOTES the toast it removed.
  "features/organizations/awaitWorkspace.ts",
];

/** A sentence that tells a person to retry because the workspace is loading. */
const DEAD_RETRY =
  /(workspace|organization)[^"'`\n]{0,80}(still loading|resolved yet)[^"'`\n]{0,120}(try|again|in a moment)/i;

function filesUnder(relativePath: string): string[] {
  const absolute = join(REPO_ROOT, relativePath);
  return readdirSync(absolute).flatMap((entry) => {
    if (entry === "node_modules" || entry === "__tests__") return [];
    const child = join(relativePath, entry);
    if (statSync(join(REPO_ROOT, child)).isDirectory()) return filesUnder(child);
    if (/\.test\.tsx?$/.test(entry)) return [];
    return /\.(ts|tsx)$/.test(entry) ? [child] : [];
  });
}

describe("no surface tells a person the workspace is still loading", () => {
  it("has no dead retry toast anywhere under features/ or app/", () => {
    const offenders = [...filesUnder("features"), ...filesUnder("app")]
      .filter((file) => !OUT_OF_CLASS.includes(file))
      .filter((file) => DEAD_RETRY.test(readFileSync(join(REPO_ROOT, file), "utf8")));
    expect(offenders).toEqual([]);
  });
});
