// features/connectors/registry.ts
//
// THE catalogue of connectors. Adding a provider is ONE entry here — the strip,
// and any future directory surface, read from this array and nothing else.
//
// Two rules for an entry:
//  1. `id` is generic to the provider and permanent. The display `name` carries
//     today's truth and may widen as the capability widens; the id never does.
//  2. `surfaces` is explicit. Only a connection that changes what a normal
//     conversation can do earns `"strip"`; everything else is `"directory"`.

import { SearchCheck } from "lucide-react";
import { GOOGLE_WORKSPACE_SETTINGS_HREF } from "@/features/google-workspace/connection";
import { marketingRoutes } from "@/features/marketing/lib/routes";
import { GmailMark, GoogleMark, NotionMark, lucideMark } from "./marks";
import type {
  ConnectorDefinition,
  ConnectorId,
  ConnectorSurface,
} from "./types";

export const CONNECTORS: ConnectorDefinition[] = [
  {
    id: "google-workspace",
    name: "Google Docs & Sheets",
    blurb: "Read and update docs and sheets you choose",
    logo: GoogleMark,
    surfaces: ["strip", "directory"],
    manageHref: GOOGLE_WORKSPACE_SETTINGS_HREF,
  },
  {
    id: "gmail",
    name: "Gmail",
    blurb: "Draft an email and send it after you review it",
    logo: GmailMark,
    surfaces: ["strip", "directory"],
    manageHref: GOOGLE_WORKSPACE_SETTINGS_HREF,
  },
  {
    id: "notion",
    name: "Notion",
    blurb: "Bring your Notion pages into a conversation",
    logo: NotionMark,
    surfaces: ["strip", "directory"],
    manageHref: "/user-settings/integrations",
  },
  {
    id: "google-search-console",
    name: "Google Search Console",
    blurb: "See how your site performs in Google Search",
    logo: lucideMark(SearchCheck),
    // Connectable today — just too specific to earn a slot under the input.
    surfaces: ["directory"],
    // Its OAuth grant and property management live on the marketing surface,
    // not the Workspace settings page.
    manageHref: marketingRoutes.connectionsGoogle(),
  },
];

/** Every connector allowed on one surface, in catalogue order. */
export function connectorsFor(
  surface: ConnectorSurface,
): ConnectorDefinition[] {
  return CONNECTORS.filter((connector) => connector.surfaces.includes(surface));
}

export function getConnector(id: ConnectorId): ConnectorDefinition | undefined {
  return CONNECTORS.find((connector) => connector.id === id);
}
