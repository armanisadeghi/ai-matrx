// features/applets/lib/applet-state.ts — THE ONE ANSWER to "what state is this Applet in?"
//
// An Applet's state lives in three stored fields and is said in ONE place. Every surface that names it —
// the /applets list (badge, facet, row label), the manage header, the overview, the builder card and its
// preview strip, the Code library badge — calls `appletState(row)`, so one row can never read "Live" in
// one place, "Published" in another and "Draft" in a third.
//
//   archived  — `deleted_at` is set. THE archive mechanism (the list's Archived filter, the row menu's
//               Archive/Restore, /trash). There is no second one: status 'archived' was retired
//               (2026-10-08) and the database refuses it (`aga_apps_status_check`).
//   suspended — an admin stopped it (status 'suspended').
//   published — live at its public link: status 'published' AND `published_to_web`, written together by
//               the one publication transition (`appletPublicationPatch`). A guest can run it only then
//               (`get_aga_public_data` needs both).
//   in_use    — "Use it" for My organization: status 'published' and NOT on the web. Using an Applet and
//               putting it on the web are separate choices (audit9 B8): her organization opens it (row
//               security, the access ladder's Organization level); strangers do not.
//   draft      — everything else (a draft still opens for her organization; it is just not in use yet).
//
// The version a person sees is `content_version` (the saved content version), never `version` (the
// row's revision token, which moves on every write — opening the builder, publishing, a setting).

import type { BadgeTone } from "@ai-matrx/design-system/controls";

export type AppletStateKind = "archived" | "suspended" | "published" | "in_use" | "draft";

export interface AppletStateFields {
  status: string | null | undefined;
  published_to_web: boolean | null | undefined;
  deleted_at?: string | null | undefined;
}

export interface AppletState {
  kind: AppletStateKind;
  /** The one word every surface shows. */
  label: "Archived" | "Suspended" | "Published" | "In use" | "Draft";
  tone: BadgeTone;
  /** Live at its public link — the Publish/Unpublish toggle reads this. */
  live: boolean;
}

const STATES: Record<AppletStateKind, AppletState> = {
  archived: { kind: "archived", label: "Archived", tone: "neutral", live: false },
  suspended: { kind: "suspended", label: "Suspended", tone: "destructive", live: false },
  published: { kind: "published", label: "Published", tone: "success", live: true },
  in_use: { kind: "in_use", label: "In use", tone: "success", live: false },
  draft: { kind: "draft", label: "Draft", tone: "neutral", live: false },
};

export function appletState(row: AppletStateFields): AppletState {
  if (row.deleted_at) return STATES.archived;
  if (row.status === "suspended") return STATES.suspended;
  if (row.status === "published") return row.published_to_web === true ? STATES.published : STATES.in_use;
  return STATES.draft;
}

/** Who opens an Applet that is in use: her organization, or anyone with the link (the web). */
export type AppletAudience = "organization" | "web";

/** The two choices, in the order "Use it" and Sharing offer them — My organization first, the default. */
export const APPLET_AUDIENCES: readonly AppletAudience[] = ["organization", "web"] as const;

export const APPLET_AUDIENCE_LABELS: Record<AppletAudience, string> = {
  organization: "My organization",
  web: "Anyone with the link",
};

/** Who opens it today: the web when published to it, else her organization (row security). */
export function appletAudience(row: AppletStateFields): AppletAudience {
  return appletState(row).live ? "web" : "organization";
}

/**
 * What "Use it" says BEFORE it acts, for the audience she picked. It always names the tables it creates;
 * only the web choice says strangers can open it.
 */
export function appletUseConsequence(input: { name: string; slug: string | null | undefined; audience: AppletAudience; tablesToMake?: readonly string[] }): {
  title: string;
  description: string;
} {
  const tables = input.tablesToMake ?? [];
  const made =
    tables.length === 0 ? "" : ` First it adds ${tables.length === 1 ? "the table" : `${tables.length} tables:`} ${tables.join(", ")}.`;
  const who =
    input.audience === "web"
      ? `Anyone with the link can open it${input.slug ? ` at aimatrx.com/applets/${input.slug}` : ""}, without signing in.`
      : "People in your organization can open it. Nobody else can.";
  return { title: `Use ${input.name}?`, description: `${who}${made}` };
}

/**
 * The archive confirm on a page that holds no list (Settings › Danger): it names where the Applet
 * comes back from, never "this list" (audit A1).
 */
export function archiveAppletFromPageSentence(name: string): string {
  return `This archives "${name}" and stops it for everyone. Restore it from Applets → Filters → Archived.`;
}

/** "v3" — the saved content version; null while nothing has been built yet. */
export function appletVersionLabel(contentVersion: number | null | undefined): string | null {
  return typeof contentVersion === "number" && contentVersion > 0 ? `v${contentVersion}` : null;
}

/**
 * The state word on a Versions row. The CURRENT version is the Applet itself, so it says the Applet's
 * state (`appletState`); a snapshot's own `status` was frozen when it was saved and only describes an
 * older version, so it is shown for those rows alone.
 */
export function appletVersionStatusLabel(
  isCurrent: boolean,
  applet: AppletStateFields,
  snapshotStatus: string | null | undefined,
): string | null {
  if (isCurrent) return appletState(applet).label;
  return snapshotStatus ? snapshotStatus.charAt(0).toUpperCase() + snapshotStatus.slice(1) : null;
}

/**
 * What Publish (the manage header) and "Use it" (the builder) say BEFORE they act — a publication
 * reaches strangers, and "Use it" also creates tables, so the click names both first.
 */
export function publishConsequence(input: { name: string; slug: string | null | undefined; tablesToMake?: readonly string[] }): {
  title: string;
  description: string;
} {
  const where = input.slug ? `aimatrx.com/applets/${input.slug}` : "its public link";
  const tables = input.tablesToMake ?? [];
  const made =
    tables.length === 0
      ? ""
      : ` It first creates ${tables.length === 1 ? "the table" : `${tables.length} tables:`} ${tables.join(", ")}.`;
  return {
    title: `Publish ${input.name}?`,
    description: `Anyone with the link can open it at ${where}, without signing in.${made}`,
  };
}
