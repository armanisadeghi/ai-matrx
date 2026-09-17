// features/connectors/provider-config.ts
//
// THE CONNECTOR PRIMITIVE'S CONFIG LAYER — a provider declares what it offers;
// no component below this file knows which provider it is rendering.
//
// Why this shape (common-docs/projects/google-native/PLAN.md §5.2): Google is
// the FIRST of ~80 connectors, and every part of the first Google moment — the
// prompt card, the consent dialog, the per-capability health rows, the
// reconnect-only-what-is-missing button — is generic. A provider registers its
// products, each product's one-sentence promise, its grant bundle, its group,
// the SERVER capability keys it covers, and the resource types it makes
// attachable. Adding the next provider is a config row and an adapter, never a
// second card, dialog, or health component.
//
// 🚨 Two things are deliberately NOT in here:
//   1. Rollout state. Whether a product is live for this account comes from the
//      SERVER capability catalog at request time (`ConnectorCapabilityRollout`
//      below). A client constant would freeze a flip that must land with no
//      rebuild (PLAN §2: "It flips live from the server capability catalog with
//      no rebuild").
//   2. Anything that reads or writes. That is the provider ADAPTER
//      (`features/connectors/google-adapter.ts` for Google) — the one file per
//      provider allowed to name the provider's own services.
//
// The copy in `promise` is FINAL, user-facing, and quoted verbatim from PLAN §2.
// Do not "improve" it here; it was written for the person, not for the scope.

import type { LucideIcon } from "lucide-react";
import {
  BarChart3,
  CalendarDays,
  Contact,
  FileSpreadsheet,
  ListChecks,
  Mail,
  Search,
  Tag,
  MonitorPlay,
} from "lucide-react";
import {
  GOOGLE_IDENTITY_SCOPES,
  GOOGLE_SCOPE,
  GOOGLE_WORKSPACE_FILE_SCOPES,
} from "@/lib/googleScopes";
import type { ConnectorId } from "./types";

export interface ConnectorProduct {
  /** Stable, provider-scoped key. Never renamed — it addresses stored state. */
  key: string;
  /** Today's product name, in the provider's own words. */
  name: string;
  /**
   * ONE plain sentence saying exactly what AI Matrx will be able to do. Final
   * user-facing copy. It states the boundary too ("We never read your inbox"),
   * because the boundary is the reason a person says yes.
   */
  promise: string;
  /** Group key; must exist in the provider's `groups`. */
  group: string;
  icon: LucideIcon;
  /**
   * Every SERVER capability key this row covers. The row is togglable only
   * when the server says every one of them is available to this account.
   */
  capabilityKeys: readonly string[];
  /**
   * The grant bundle requested when this row is switched on. The hub matches it
   * against `capabilityKeys` and refuses anything outside the selection, so a
   * bundle that has drifted is a refusal, never a silent over-request.
   */
  scopes: readonly string[];
  /** Resource types this product makes attachable to a chat or a record. */
  attachableResourceTypes: readonly string[];
  /** Short clause completing "Revoking this account stops …". */
  stopsOnRevoke: string;
  /** The first useful thing to do once it is connected. No dead ends. */
  firstAction: { label: string; href: string } | null;
}

export interface ConnectorProductGroup {
  key: string;
  label: string;
  /** One line naming who this half is for. */
  hint: string;
}

export interface ConnectorProviderConfig {
  id: string;
  name: string;
  /**
   * The connectors-registry entry whose local brand mark represents the
   * provider. Artwork stays canonical — `ConnectorMark` renders it.
   */
  markConnectorId: ConnectorId;
  /** Scopes every consent carries so the account can be identified. */
  identityScopes: readonly string[];
  /** Prompt card copy (PLAN §2, verbatim). */
  prompt: { title: string; body: string; cta: string };
  /** Consent dialog copy (PLAN §2, verbatim). */
  dialog: { title: string; subtitle: string; cta: string };
  groups: readonly ConnectorProductGroup[];
  products: readonly ConnectorProduct[];
  /** Provider scope → what it lets us do, in plain words. */
  scopeLanguage: Readonly<Record<string, string>>;
  /** Where a person manages every account of this provider. */
  settingsHref: string;
}

/**
 * Every Google scope in plain words. The dialog's info affordance shows
 * Google's own scope string next to this sentence — the person sees both, and
 * neither stands in for the other.
 */
const GOOGLE_SCOPE_LANGUAGE: Record<string, string> = {
  [GOOGLE_SCOPE.openid]: "Confirm who you are with Google",
  [GOOGLE_SCOPE.email]: "Your email address",
  [GOOGLE_SCOPE.profile]: "Your name and profile picture",
  [GOOGLE_SCOPE.userinfoEmail]: "Your email address",
  [GOOGLE_SCOPE.userinfoProfile]: "Your name and profile picture",
  [GOOGLE_SCOPE.driveFile]:
    "Open, create and edit the Google files you pick — nothing else in your Drive",
  [GOOGLE_SCOPE.gmailSend]:
    "Send an email as you, after you have reviewed it. No inbox access",
  [GOOGLE_SCOPE.webmastersReadonly]:
    "Read Search Console performance for sites you own",
  [GOOGLE_SCOPE.analyticsReadonly]: "Read your Google Analytics reports",
  [GOOGLE_SCOPE.youtubeReadonly]:
    "Read your channel's videos and details. No uploads, no edits",
  [GOOGLE_SCOPE.youtubeAnalyticsReadonly]:
    "Read your channel's performance reports",
  [GOOGLE_SCOPE.contactsReadonly]: "Read your Google Contacts",
  [GOOGLE_SCOPE.calendarEventsOwnedReadonly]:
    "Read events on calendars you own. No changes to your calendar",
  [GOOGLE_SCOPE.tasksReadonly]: "Read your Google Tasks lists",
  [GOOGLE_SCOPE.tagManagerReadonly]:
    "Read your Tag Manager accounts, containers and tags",
};

/** Plain words for one provider scope, or the scope itself when unmapped. */
export function scopeLanguage(
  provider: ConnectorProviderConfig,
  scope: string,
): string {
  return provider.scopeLanguage[scope] ?? scope;
}

const WORKSPACE_GROUP = "workspace";
const MARKETING_GROUP = "marketing";

/**
 * GOOGLE — the first provider config.
 *
 * Product rows follow PLAN §2 exactly: nine rows, two groups, one sentence
 * each. `drive_files`, `docs`, `sheets` and `slides` are four server
 * capabilities and ONE row, because "Docs, Sheets & Drive files" is one decision
 * for the person and one `drive.file` grant at Google.
 *
 * 🚨 EVERY KEY THE SERVER DECLARES IS CLAIMED BY A ROW, and
 * `__tests__/capability-keys-are-the-servers-keys.test.ts` re-reads
 * `capabilities.py` and fails on any key or eligible resource type this config
 * does not carry — the census the two server-code censuses already had and the
 * key set, which decides what a person may switch on, did not (V13-3).
 */
export const GOOGLE_CONNECTOR_PROVIDER: ConnectorProviderConfig = {
  id: "google",
  name: "Google",
  markConnectorId: "google-workspace",
  identityScopes: GOOGLE_IDENTITY_SCOPES,
  prompt: {
    title: "Get more done with Google",
    body: "Work with your Docs, Sheets, Gmail, Calendar and Search Console from here — you choose exactly what to connect.",
    cta: "Connect Google",
  },
  dialog: {
    title: "Choose what to connect",
    subtitle: "You can change this any time in Settings → Connectors.",
    cta: "Connect selected",
  },
  groups: [
    {
      key: WORKSPACE_GROUP,
      label: "Workspace",
      hint: "The files, mail and calendar your team works in every day.",
    },
    {
      key: MARKETING_GROUP,
      label: "Marketing",
      hint: "How your sites and channels are actually performing.",
    },
  ],
  products: [
    {
      key: "workspace_files",
      name: "Docs, Sheets & Drive files",
      promise:
        "Open, create and edit only the files you pick. We never see the rest of your Drive.",
      group: WORKSPACE_GROUP,
      icon: FileSpreadsheet,
      // 🚨 FOUR SERVER CAPABILITIES, ONE ROW. `slides` was missing until
      // 2026-09-17 (VERIFY-U-P2-R4, V13-3): the catalog ships it as
      // `available`, one live connection had already recorded a `slides.read`
      // success and one `google_presentation` resource was registered, and the
      // person could not see, grant or withdraw it anywhere. It belongs HERE
      // rather than in a tenth row: PLAN §8/§9 put Slides under the same
      // `drive.file` grant as a flips-on-later capability, never a product
      // offered on its own, and §2's nine rows are final copy. So its health,
      // its scope disclosure and its revoke consequence render on this row.
      capabilityKeys: ["drive_files", "docs", "sheets", "slides"],
      scopes: GOOGLE_WORKSPACE_FILE_SCOPES,
      attachableResourceTypes: [
        "google_document",
        "google_spreadsheet",
        "google_presentation",
      ],
      stopsOnRevoke: "the Docs and Sheets you picked from opening here",
      firstAction: {
        label: "Pick your first file",
        href: "/user-settings/integrations",
      },
    },
    {
      key: "gmail",
      name: "Gmail",
      promise: "Send emails you have reviewed. We never read your inbox.",
      group: WORKSPACE_GROUP,
      icon: Mail,
      capabilityKeys: ["gmail_send"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.gmailSend],
      attachableResourceTypes: [],
      stopsOnRevoke: "any reviewed email from being sent as this account",
      firstAction: null,
    },
    {
      key: "calendar",
      name: "Calendar",
      promise: "See your own upcoming events. We never change your calendar.",
      group: WORKSPACE_GROUP,
      icon: CalendarDays,
      capabilityKeys: ["calendar"],
      scopes: [
        ...GOOGLE_IDENTITY_SCOPES,
        GOOGLE_SCOPE.calendarEventsOwnedReadonly,
      ],
      attachableResourceTypes: [],
      stopsOnRevoke: "your agenda from showing here",
      firstAction: null,
    },
    {
      key: "contacts",
      name: "Contacts",
      promise:
        "Bring a contact you choose into your People. We never edit Google Contacts.",
      group: WORKSPACE_GROUP,
      icon: Contact,
      capabilityKeys: ["contacts"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.contactsReadonly],
      attachableResourceTypes: [],
      stopsOnRevoke: "importing a contact from this Google account",
      firstAction: { label: "Import a contact", href: "/crm/import" },
    },
    {
      key: "tasks",
      name: "Tasks",
      promise:
        "Bring tasks you choose into your tasks. We never change Google Tasks.",
      group: WORKSPACE_GROUP,
      icon: ListChecks,
      capabilityKeys: ["tasks"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.tasksReadonly],
      attachableResourceTypes: [],
      stopsOnRevoke: "importing tasks from this Google account",
      firstAction: null,
    },
    {
      key: "search_console",
      name: "Search Console",
      promise: "See how your sites perform in Google Search. Read-only.",
      group: MARKETING_GROUP,
      icon: Search,
      capabilityKeys: ["search_console"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.webmastersReadonly],
      attachableResourceTypes: ["search_console_property"],
      stopsOnRevoke: "Search Console data from refreshing on your sites",
      firstAction: {
        label: "Bind a site",
        href: "/marketing/connections/google",
      },
    },
    {
      key: "analytics",
      name: "Analytics",
      promise: "See your website analytics. Read-only, no settings changed.",
      group: MARKETING_GROUP,
      icon: BarChart3,
      capabilityKeys: ["analytics"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.analyticsReadonly],
      attachableResourceTypes: ["analytics_property"],
      stopsOnRevoke: "Analytics numbers from refreshing on your sites",
      firstAction: {
        label: "Bind a property",
        href: "/marketing/connections/google",
      },
    },
    {
      key: "tag_manager",
      name: "Tag Manager",
      promise: "See which tags are installed on your sites. Read-only.",
      group: MARKETING_GROUP,
      icon: Tag,
      capabilityKeys: ["tag_manager"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.tagManagerReadonly],
      attachableResourceTypes: [],
      stopsOnRevoke: "your tracking health line from updating",
      firstAction: null,
    },
    {
      key: "youtube",
      name: "YouTube",
      promise:
        "See your channel's videos and performance. We never publish or change anything.",
      group: MARKETING_GROUP,
      icon: MonitorPlay,
      // Two server capabilities, one row: reading the channel and reading its
      // reports are one decision for the person, and Google's bounded consent
      // for `youtube_analytics` carries both scopes.
      capabilityKeys: ["youtube", "youtube_analytics"],
      scopes: [
        ...GOOGLE_IDENTITY_SCOPES,
        GOOGLE_SCOPE.youtubeReadonly,
        GOOGLE_SCOPE.youtubeAnalyticsReadonly,
      ],
      attachableResourceTypes: ["youtube_channel"],
      stopsOnRevoke: "your channel's videos and reports from loading here",
      firstAction: null,
    },
  ],
  scopeLanguage: GOOGLE_SCOPE_LANGUAGE,
  settingsHref: "/user-settings/integrations",
};

export function productByKey(
  provider: ConnectorProviderConfig,
  key: string,
): ConnectorProduct | undefined {
  return provider.products.find((product) => product.key === key);
}

export function productsInGroup(
  provider: ConnectorProviderConfig,
  groupKey: string,
): ConnectorProduct[] {
  return provider.products.filter((product) => product.group === groupKey);
}

/** Product scopes minus identity — the part that changes a capability. */
export function productGrantScopes(
  provider: ConnectorProviderConfig,
  product: ConnectorProduct,
): string[] {
  const identity = new Set<string>(provider.identityScopes);
  return product.scopes.filter((scope) => !identity.has(scope));
}
