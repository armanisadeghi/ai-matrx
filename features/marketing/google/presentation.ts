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
  connections: Pick<GoogleConnectionSummary, "id" | "health">[] = [],
): GoogleConnectionResource[] {
  const connectionHealth = new Map(
    connections.map((connection) => [connection.id, connection.health]),
  );
  const selected = new Map<string, GoogleConnectionResource>();

  for (const resource of resources) {
    const identity = `${resource.resource_type}:${resource.resource_ref}`;
    const current = selected.get(identity);
    if (!current) {
      selected.set(identity, resource);
      continue;
    }

    const currentIsConnected =
      connectionHealth.get(current.connection_id) === "connected";
    const candidateIsConnected =
      connectionHealth.get(resource.connection_id) === "connected";
    if (!currentIsConnected && candidateIsConnected) {
      selected.set(identity, resource);
    }
  }

  return [...selected.values()];
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
