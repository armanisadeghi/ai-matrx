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
  GOOGLE_GMAIL_READ_SCOPES,
  GOOGLE_SCOPE,
  GOOGLE_WORKSPACE_FILE_SCOPES,
} from "@/lib/googleScopes";
import type { OverlayId } from "@/features/overlays/catalogue";
import type { ConnectorId } from "./types";

/**
 * THE FIRST USEFUL THING A CONNECTED ROW OFFERS (PLAN §2's promise: "every
 * connected row offers its first useful action"). A row declares ONE of three
 * shapes and the dialog renders it; there is no fourth, and `null` is gone.
 *
 * 🚨 WHY IT IS NO LONGER A NULLABLE `{ label, href }` (lane F-51, escalated from
 * U-W2). Calendar's first useful action is OPENING THE AGENDA — a catalogued
 * window, not a page — and an href-or-nothing field left it as `firstAction:
 * null`, so the one row whose first action was already built offered nothing.
 * Four other rows were `null` too, and nothing anywhere could tell a deliberate
 * "nothing exists yet" from a row somebody forgot: that is what `kind: "none"`
 * with its written reason fixes, and what
 * `__tests__/every-connected-product-offers-its-first-action.test.ts` censuses
 * over the whole config.
 */
/**
 * Context keys a `kind: "overlay"` action's window reads out of the overlay's
 * `data` as an IDENTITY it cannot function without — never a preference the
 * window can do without. Extend this union only alongside a resolver for the
 * new key in `ConnectorConsentDialog`'s `resolveFirstActionData` (lane F-55,
 * Cursor Bugbot thread 4043109495, PR 228, commit 9e31d18a).
 */
export type ConnectorFirstActionContextKey = "organizationId";

export type ConnectorFirstAction =
  /** A page the person goes to. */
  | { kind: "route"; label: string; href: string }
  /**
   * A catalogued overlay the surface opens IN PLACE — the one door to a window
   * that has no route of its own (`features/overlays/catalogue.ts`).
   *
   * 🚨 `needs` names every context key the window's BODY reads off overlay
   * data as an identity (e.g. Tasks import needs the organization it writes
   * into) — never assume the dialog's ambient context happens to match what
   * the window needs. F-51 gave this action only `overlayId`, so the Tasks
   * row dispatched `openOverlay({ overlayId })` with no data at all: the
   * window's `organizationId` prop came back `null` and its body refused to
   * load. `needs` is how the dialog knows to build that data and refuses to
   * render the button at all when a needed value is unavailable (Law 4:
   * never open a window that can do nothing), instead of only guessing it
   * will be there. Omit when the window carries no data at all — e.g. the
   * agenda, whose subject is the signed-in person, not anything the caller
   * supplies.
   */
  | {
      kind: "overlay";
      label: string;
      overlayId: OverlayId;
      needs?: readonly ConnectorFirstActionContextKey[];
    }
  /** Nothing to offer YET, and the row says why in writing. Never a bare null. */
  | { kind: "none"; because: string };

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
  firstAction: ConnectorFirstAction;
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
  [GOOGLE_SCOPE.gmailReadonly]:
    "Search and read messages in the Google account you choose. No changes or sends",
  [GOOGLE_SCOPE.gmailModify]:
    "Google permits reading, composing, sending, and changing Gmail. AI Matrx uses this grant only for changes you choose on an opened message",
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
 * The original product rows follow PLAN §2; Gmail changes adds a separate
 * internal-test row. `drive_files`, `docs`, `sheets` and `slides` are four server
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
        kind: "route",
        label: "Pick your first file",
        href: "/user-settings/integrations",
      },
    },
    {
      key: "gmail",
      name: "Gmail",
      promise: "Send emails you have reviewed. This sending permission cannot read your inbox.",
      group: WORKSPACE_GROUP,
      icon: Mail,
      capabilityKeys: ["gmail_send"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.gmailSend],
      attachableResourceTypes: [],
      stopsOnRevoke: "any reviewed email from being sent as this account",
      // A person does not start a Gmail send from a screen: an agent drafts one
      // and it waits in the approval queue, which is empty the moment this row is
      // switched on, so sending them there would be a door onto nothing. Revisit
      // when a compose surface exists (lane F-51 escalated it to the chair).
      firstAction: {
        kind: "none",
        because:
          "Nothing to open yet — a Gmail send begins with an agent's draft, not with a screen a person visits.",
      },
    },
    {
      key: "gmail_read",
      name: "Gmail reading",
      promise:
        "Search and open messages when you ask. If you separately register this mailbox for outreach, matched replies are saved in CRM.",
      group: WORKSPACE_GROUP,
      icon: Mail,
      capabilityKeys: ["gmail_read"],
      scopes: GOOGLE_GMAIL_READ_SCOPES,
      attachableResourceTypes: [],
      stopsOnRevoke: "mailbox searches and message opening here",
      firstAction: {
        kind: "route",
        label: "Search your Gmail",
        href: "/gmail-read-review",
      },
    },
    {
      key: "gmail_modify",
      name: "Gmail changes",
      promise:
        "Change an opened message only when you choose Archive, Restore to inbox, Read, Unread, Star, or a label action. No automatic changes or Gmail Snooze.",
      group: WORKSPACE_GROUP,
      icon: Mail,
      capabilityKeys: ["gmail_modify"],
      scopes: [...GOOGLE_IDENTITY_SCOPES, GOOGLE_SCOPE.gmailModify],
      attachableResourceTypes: [],
      stopsOnRevoke: "changes to messages in this Gmail account",
      firstAction: {
        kind: "route",
        label: "Open Gmail",
        href: "/gmail-read-review",
      },
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
      // The agenda is a catalogued window with no route of its own, and it is the
      // whole point of connecting Calendar (PLAN §4.6). No `needs`: the agenda's
      // subject is the signed-in person and their window knob, so its opener
      // (`useOpenGoogleAgenda`) dispatches `openOverlay` with no data at all —
      // confirmed against its window body, which takes no organization/project
      // prop (`GoogleAgendaWindow`, `features/window-panels/windows/
      // google-calendar/`).
      firstAction: {
        kind: "overlay",
        label: "Open your agenda",
        overlayId: "googleAgendaWindow",
      },
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
      // The Google Contacts import window (`features/overlays/openers/
      // googleImportWindows.tsx`, `useOpenGoogleContactsImport`) is the real
      // door — the same shape Tasks' row already uses for its own import.
      // `/crm/import` is the NATIVE CSV/vCard wizard (`app/(core)/crm/
      // import/page.tsx`); routing here sent a person who just connected
      // Google Contacts to the wrong wizard (R27, common-docs/projects/
      // google-native/REGISTER.md; F-51 first-action sweep). Its body
      // (`GoogleContactsImportPanel`, wrapped by `GoogleContactsImportWindow`)
      // reads `organizationId` off overlay data the same way Tasks' does —
      // `needs` is how this button carries it.
      firstAction: {
        kind: "overlay",
        label: "Import a contact",
        overlayId: "googleContactsImportWindow",
        needs: ["organizationId"],
      },
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
      // The Google Tasks import window (`features/overlays/openers/
      // googleImportWindows.tsx`) was already built and the row offered no way in.
      // Its body reads `organizationId` off overlay data and refuses to load
      // without it (`GoogleTasksImportPanel`) — `needs` is how this button
      // carries the same organization the typed opener
      // (`useOpenGoogleTasksImport`, see `TasksHeaderControls`) always passes.
      firstAction: {
        kind: "overlay",
        label: "Import your tasks",
        overlayId: "googleTasksImportWindow",
        needs: ["organizationId"],
      },
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
        kind: "route",
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
        kind: "route",
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
      // U-M2 closed the gap F-51 left open here: Tag Manager's first action is THE
      // `SiteTrackingPanel` — the site's Integrations settings section and the
      // `siteTrackingWindow` (`?panels=site_tracking:<siteId>`) mount the same component.
      //
      // 🚨 IT IS A ROUTE AND NOT AN OVERLAY BECAUSE THE DOOR NEEDS A SITE, AND THIS
      // SURFACE HAS NONE. Tasks and Contacts declare `needs: ["organizationId"]` because
      // the consent dialog genuinely holds the active organization; nothing here holds a
      // `siteId`, so an overlay action would either open an empty frame or — with `siteId`
      // added to `needs` — resolve as missing and render no control at all, which is the
      // row offering nothing again. A tracking verdict is per site, and picking one for the
      // person would be a guess about which of their sites they meant.
      //
      // So the row goes to the surface a site is actually chosen from. There is no flat site
      // list any more (`/marketing/sites` permanently redirects here): a website belongs to a
      // client, so the roster is the door and each client carries its own Websites section
      // whose rows open the tracking panel. The label says PICK, because that is what this
      // link lands on — it does not promise one site's tracking and deliver a roster
      // (V-27 NEW-1).
      firstAction: {
        kind: "route",
        label: "Pick a site to check",
        href: "/marketing/brands",
      },
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
      // 🚨 THE BINDING SURFACE EXISTS NOW (U-M3), so this row stops saying it does not.
      // `BrandChannelPanel` binds the client's owned channel IN PLACE — the brand Analytics
      // route mounts it and the `brandChannelWindow` wraps the same component
      // (`?panels=brand_channel:<brandId>`) — which is exactly the door F-51 said was
      // missing when Search Console and Analytics had one and YouTube did not.
      //
      // Like Tag Manager above it is a ROUTE, for the same reason and a different id: the
      // panel's subject is a BRAND, and this surface holds no `brandId` to hand an overlay
      // action. The client roster is where a brand is chosen, and its Analytics section is
      // where the channel is bound (V-27 NEW-1).
      firstAction: {
        kind: "route",
        label: "Pick a client to bind its channel",
        href: "/marketing/brands",
      },
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
