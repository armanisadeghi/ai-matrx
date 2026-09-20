import { expect, type BrowserContext, type Page } from "@playwright/test";

export type BrowserPreflight = {
  verified_at: string;
  identity: "admin@admin.com";
  route: string;
  review_id: string;
  stable_worker: string;
  run_id: string;
  instruction_hash: string;
  checklist_hash: string;
  fixture: { id: string; owner_id: string; owner_email: "admin@admin.com"; proof: string };
};

/**
 * Proves the actual authenticated browser context before a queue claim.  The
 * email comes from the app's authenticated /api/whoami response, never an
 * operator-supplied label.
 */
export async function verifyAdminBrowserPreflight(
  page: Page,
  baseUrl: string,
  expectedRoute: string,
  run: Pick<BrowserPreflight, "review_id" | "stable_worker" | "run_id" | "instruction_hash" | "checklist_hash">,
  fixture: BrowserPreflight["fixture"],
): Promise<BrowserPreflight> {
  const destination = new URL(expectedRoute, baseUrl).toString();
  // A cold core-profile compile routinely exceeds one minute on this checkout.
  // The managed preview watchdog is the outer bound; the browser gets four.
  await page.goto(destination, { waitUntil: "domcontentloaded", timeout: 240_000 });
  await expect(page).toHaveURL(new RegExp(`^${escapeRegExp(destination)}(?:[?#]|$)`));
  const response = await page.request.get(new URL("/api/whoami", baseUrl).toString());
  await expect(response).toBeOK();
  const identity = (await response.json()) as { email?: unknown };
  if (identity.email !== "admin@admin.com") {
    throw new Error("Browser preflight requires an authenticated admin@admin.com session");
  }
  if (fixture.owner_email !== "admin@admin.com" || !fixture.id.trim() ||
      !/^[0-9a-f]{8}-[0-9a-f-]{27}$/i.test(fixture.owner_id) || !fixture.proof.trim()) {
    throw new Error("Disposable fixture proof must identify the actual admin owner and fixture");
  }
  return { verified_at: new Date().toISOString(), identity: "admin@admin.com", route: expectedRoute, ...run, fixture };
}

/** Authentication is an HTTP check; a slow target compile is not a login failure. */
export async function authenticateAdminDevLogin(context: BrowserContext, loginUrl: string, baseUrl: string): Promise<void> {
  const response = await context.request.get(loginUrl, { maxRedirects: 0, timeout: 15_000 });
  if (response.status() !== 307) throw new Error(`Dev login must return 307, got ${response.status()}`);
  const location = response.headers()["location"];
  if (!location || new URL(location, baseUrl).origin !== new URL(baseUrl).origin) throw new Error("Dev login redirect left the managed local origin");
  const whoami = await context.request.get(new URL("/api/whoami", baseUrl).toString(), { timeout: 15_000 });
  await expect(whoami).toBeOK();
  const identity = (await whoami.json()) as { email?: unknown };
  if (identity.email !== "admin@admin.com") throw new Error("Dev login did not authenticate admin@admin.com");
}

/** A visible trigger, a popup, and the final destination are all required. */
export async function expectVisiblePopupDestination(
  page: Page,
  trigger: string,
  expectedDestination: RegExp,
): Promise<{ trigger: string; url: string }> {
  const locator = page.locator(trigger);
  await expect(locator).toBeVisible();
  const [popup] = await Promise.all([page.waitForEvent("popup"), locator.click()]);
  await popup.waitForLoadState("domcontentloaded");
  await expect(popup).toHaveURL(expectedDestination);
  return { trigger, url: popup.url() };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
