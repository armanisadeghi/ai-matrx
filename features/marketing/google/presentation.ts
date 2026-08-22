import type {
  GoogleConnectionResource,
  GoogleConnectionSummary,
} from "@/features/marketing/google/types";

export interface GoogleResourceSummary {
  searchConsoleCount: number;
  analyticsCount: number;
  youtubeChannels: GoogleConnectionResource[];
}

/** Keep account choices unambiguous when display names repeat. */
export function googleConnectionLabel(
  connection: Pick<GoogleConnectionSummary, "account_name" | "account_email">,
): string {
  const name = connection.account_name?.trim();
  const email = connection.account_email?.trim();
  if (name && email && name.toLocaleLowerCase() !== email.toLocaleLowerCase()) {
    return `${name} · ${email}`;
  }
  return name || email || "Google account";
}

/** Present one provider resource once even when multiple valid connections discover it. */
export function uniqueGoogleResourcesByProviderIdentity(
  resources: GoogleConnectionResource[],
): GoogleConnectionResource[] {
  const seen = new Set<string>();
  return resources.filter((resource) => {
    const identity = `${resource.resource_type}:${resource.resource_ref}`;
    if (seen.has(identity)) return false;
    seen.add(identity);
    return true;
  });
}

/**
 * Summarize only resource kinds owned by the Marketing connection inventory.
 * Picker-selected Docs and Sheets must never be presented as YouTube channels.
 */
export function summarizeGoogleResourcesByConnection(
  resources: GoogleConnectionResource[],
): Map<string, GoogleResourceSummary> {
  const summaries = new Map<string, GoogleResourceSummary>();
  for (const resource of resources) {
    const summary = summaries.get(resource.connection_id) ?? {
      searchConsoleCount: 0,
      analyticsCount: 0,
      youtubeChannels: [],
    };
    if (resource.resource_type === "search_console_property") {
      summary.searchConsoleCount += 1;
    } else if (resource.resource_type === "analytics_property") {
      summary.analyticsCount += 1;
    } else if (resource.resource_type === "youtube_channel") {
      summary.youtubeChannels.push(resource);
    }
    summaries.set(resource.connection_id, summary);
  }
  return summaries;
}
