/**
 * Surface manifest — Connected sources (`matrx-user/connected-sources`).
 *
 * /connected-sources: what is inside the accounts the person connected
 * (Google files they picked, and — once connected — Microsoft drive, mail,
 * calendar and Teams chats), walked live by the server. The rows are NOT in our
 * database; they live in the provider and are read with the person's delegated
 * token on every page.
 *
 * Read half: `connected_accounts` says which sources exist, which are connected
 * and what each cannot reach; `browsing` names the account on screen;
 * `source_list` is the visible page as ONE XML bundle (~4,000 chars) and
 * `sources` the same rows in full; `browse_summary` is the server's measured
 * sentence (how much it read and whether there is more); `load_error` reports a
 * failed read instead of an empty list.
 *
 * Write half: none, on purpose. Every row belongs to someone else's account and
 * this page only reads it — there is nothing of ours to create, rename or
 * archive, and connecting or disconnecting an account is a Settings →
 * Integrations action a person takes.
 *
 * Emitter: `features/connected-sources/browse/surface.ts`, mounted by
 * `BrowseEverything` (outer provider) and `EntityListPage surface=…` (list).
 */

import type {
  SurfaceManifest,
  SurfaceScopePayload,
  SurfaceValue,
  SurfaceValueGroup,
} from "@/features/surfaces/types";
import { mergeBaselineValues, pickBaseline } from "./_baseline.manifest";

export const CONNECTED_SOURCES_SURFACE_NAME = "matrx-user/connected-sources";

const groups: SurfaceValueGroup[] = [
  {
    key: "accounts",
    label: "Accounts",
    sortOrder: 100,
    description: "Which sources exist, which are connected, and the account on screen.",
  },
  {
    key: "sources",
    label: "Sources",
    sortOrder: 200,
    description: "The items the chosen account holds, as the list shows them.",
  },
];

const SOURCE_SHAPE =
  "{ id, external_id, kind, title, subtitle, author, modified_at, created_at, size_bytes, url }";

const surfaceSpecific: SurfaceValue[] = [
  {
    name: "connected_accounts",
    label: "Connected accounts",
    description:
      "Every source this page can browse, as an array of { adapter, title, connected, accounts: [{ connection_id, email }], cannot_reach, unavailable_reason }. adapter is the key (google_picked_files, onedrive_drive, outlook_mail, outlook_calendar, teams_chat); cannot_reach is the provider limit in one sentence; unavailable_reason says what to do when connected is false. Absent while the list of accounts loads; [] when the server offers none.",
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 1500,
    sortOrder: 100,
    group: "accounts",
  },
  {
    name: "browsing",
    label: "Account on screen",
    description:
      "The account the list is walking: { adapter, source_title, connection_id, email }. Absent when no account is chosen.",
    valueType: "object",
    alwaysAvailable: false,
    typicalCharCount: 150,
    sortOrder: 110,
    group: "accounts",
  },
  {
    name: "source_list",
    label: "Source list",
    description:
      'The page of items on screen as one XML bundle: <sources account search total shown?> with one <source id kind from when> per row whose text is the item title, plus a <subtitle> child when it has one. Rows are read live from the provider in the provider\'s own order. Absent while the page loads; <sources total="0"/> when nothing matches.',
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 2500,
    inlineUpTo: 4000,
    sortOrder: 200,
    group: "sources",
  },
  {
    name: "sources",
    label: "Sources (full rows)",
    description: `The same page of items with every field, as an array of ${SOURCE_SHAPE}. kind is file, folder, email, email_thread, calendar_event, chat, chat_message, document, spreadsheet or presentation. url opens the item where it lives (null when the provider gives none). Absent while loading; [] when the page is empty.`,
    valueType: "array",
    alwaysAvailable: false,
    typicalCharCount: 5000,
    sortOrder: 210,
    group: "sources",
  },
  {
    name: "browse_summary",
    label: "Browse summary",
    description:
      "The server's measured sentence about the last page: how many items it read, how many matched, and whether the account holds more than was walked. Absent until the first page answers.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 250,
    sortOrder: 220,
    group: "sources",
  },
  {
    name: "search_query",
    label: "Search",
    description:
      "What is typed in the search box (matched by the server against item titles). Empty string when nothing is typed or no account is open.",
    valueType: "string",
    alwaysAvailable: true,
    typicalCharCount: 20,
    sortOrder: 230,
    group: "sources",
  },
  {
    name: "load_error",
    label: "Load error",
    description:
      "The sentence the person sees when the accounts or the items could not be read (the provider refused, a scope is missing, the server failed). Absent when everything loaded — never read an absent list as empty while this is set.",
    valueType: "string",
    alwaysAvailable: false,
    typicalCharCount: 200,
    sortOrder: 240,
    group: "sources",
  },
];

export const connectedSourcesManifest: SurfaceManifest = {
  surfaceName: CONNECTED_SOURCES_SURFACE_NAME,
  client: "matrx-user",
  executionMode: "python-stream",
  description:
    "Connected sources (/connected-sources): the accounts the person connected and the items inside the one on screen, read live from the provider.",
  readiness: "partial",
  readinessNote:
    "Built 2026-09-27 (page-pass). Not yet proven live with surface:probe; read-only by design (no write targets).",
  label: "Connected sources",
  urlPattern: "/connected-sources",
  intro: `<surface_intro>
You are on Connected sources at /connected-sources. It shows what is inside the accounts the person connected — Google files they picked, and Microsoft drive, mail, calendar and Teams chats once Microsoft is connected — read live from the provider, never copied into AI Matrx.
connected_accounts lists every source and what it cannot reach; browsing is the account on screen; source_list is the visible page (condensed) and sources the same rows in full; browse_summary says how much the server read and whether more exists; load_error, when present, is why nothing could be read.
This page is read-only: you cannot connect, disconnect, rename or delete anything here. To connect an account, send the person to /settings/integrations. To open an item, give the person its url.
</surface_intro>`,
  groups,
  values: mergeBaselineValues(pickBaseline("selection", "context"), surfaceSpecific),
  writeTargets: [],
};

/** One entry of `connected_accounts`. */
export interface ConnectedAccountScopeEntry {
  adapter: string;
  title: string;
  connected: boolean;
  accounts: { connection_id: string; email: string | null }[];
  cannot_reach: string | null;
  unavailable_reason: string | null;
}

/** One entry of `sources`. */
export interface ConnectedSourceScopeEntry {
  id: string;
  external_id: string;
  kind: string;
  title: string;
  subtitle: string | null;
  author: string | null;
  modified_at: string | null;
  created_at: string | null;
  size_bytes: number | null;
  url: string | null;
}

/** Type-safe payload helper; required keys mirror `alwaysAvailable: true`. */
export function createConnectedSourcesScope(values: {
  search_query: string;
  selection?: string;
  context?: Record<string, unknown>;
  connected_accounts?: ConnectedAccountScopeEntry[];
  browsing?: {
    adapter: string;
    source_title: string;
    connection_id: string;
    email: string | null;
  };
  source_list?: string;
  sources?: ConnectedSourceScopeEntry[];
  browse_summary?: string;
  load_error?: string;
}): SurfaceScopePayload {
  return values as unknown as SurfaceScopePayload;
}
