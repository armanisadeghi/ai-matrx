"use client";

/**
 * features/cms/services/starterKitClient.ts
 *
 * WF-7: the /cms admin's client for aidream's DIRECT starter-kit route
 * (`POST /content-plan/cms-sites/{cms_site_id}/starter-kit` — no plan pairing
 * required, unlike the Setup view's bridge sibling). The kit seeds the site
 * shell: shell-only global CSS (theme tokens stay LIVE data on theme_config),
 * header + footer components, and navigation. Ownership + the agent-write
 * policy are enforced server-side; a refusal surfaces verbatim.
 */
import { callApi } from "@/lib/api/call-api";
import type { AppDispatch } from "@/lib/redux/store";

export interface StarterKitOutcome {
  dryRun: boolean;
  operation: string;
  globalCssChars: number;
  globalCssReplacedChars: number;
  navigationSeeded: boolean;
  componentCount: number;
  replacedComponentCount: number;
  notes: string[];
}

/**
 * Thrown when the kit refuses a non-empty site without `force` — the caller
 * re-prompts with a destructive confirm instead of showing a dead error.
 */
export class StarterKitNotEmptyError extends Error {
  constructor(
    message: string,
    readonly componentCount: number,
    readonly globalCssChars: number,
  ) {
    super(message);
    this.name = "StarterKitNotEmptyError";
  }
}

export async function installStarterKit(
  dispatch: AppDispatch,
  cmsSiteId: string,
  options: { force?: boolean; dryRun?: boolean } = {},
): Promise<StarterKitOutcome> {
  const result = await dispatch(
    callApi({
      path: "/content-plan/cms-sites/{cms_site_id}/starter-kit",
      method: "POST",
      pathParams: { cms_site_id: cmsSiteId },
      body: { force: options.force === true, dry_run: options.dryRun === true },
    }),
  );
  if (result.error) {
    // Bridge 4xx bodies ride in serverDetail as {error, message, details}.
    const server =
      result.error.serverDetail && typeof result.error.serverDetail === "object"
        ? (result.error.serverDetail as Record<string, unknown>)
        : {};
    const message =
      (typeof server.message === "string" && server.message) ||
      result.error.message ||
      "The starter-kit call failed.";
    if (/not empty/i.test(message)) {
      const details =
        server.details && typeof server.details === "object"
          ? (server.details as Record<string, unknown>)
          : {};
      throw new StarterKitNotEmptyError(
        message,
        typeof details.component_count === "number" ? details.component_count : 0,
        typeof details.global_css_chars === "number" ? details.global_css_chars : 0,
      );
    }
    throw new Error(message);
  }
  const data =
    result.data && typeof result.data === "object"
      ? (result.data as Record<string, unknown>)
      : {};
  const num = (key: string): number =>
    typeof data[key] === "number" ? (data[key] as number) : 0;
  return {
    dryRun: data.dry_run === true,
    operation: typeof data.operation === "string" ? data.operation : "",
    globalCssChars: num("global_css_chars"),
    globalCssReplacedChars: num("global_css_replaced_chars"),
    navigationSeeded: data.navigation_seeded === true,
    componentCount: Array.isArray(data.components) ? data.components.length : 0,
    replacedComponentCount: Array.isArray(data.replaced_component_ids)
      ? data.replaced_component_ids.length
      : 0,
    notes: Array.isArray(data.notes) ? data.notes.map(String) : [],
  };
}
