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
//               (`get_aga_public_data` needs both), so a half-written pair is NOT published.
//   draft      — everything else.
//
// The version a person sees is `content_version` (the saved content version), never `version` (the
// row's revision token, which moves on every write — opening the builder, publishing, a setting).

import type { BadgeTone } from "@ai-matrx/design-system/controls";

export type AppletStateKind = "archived" | "suspended" | "published" | "draft";

export interface AppletStateFields {
  status: string | null | undefined;
  published_to_web: boolean | null | undefined;
  deleted_at?: string | null | undefined;
}

export interface AppletState {
  kind: AppletStateKind;
  /** The one word every surface shows. */
  label: "Archived" | "Suspended" | "Published" | "Draft";
  tone: BadgeTone;
  /** Live at its public link — the Publish/Unpublish toggle reads this. */
  live: boolean;
}

const STATES: Record<AppletStateKind, AppletState> = {
  archived: { kind: "archived", label: "Archived", tone: "neutral", live: false },
  suspended: { kind: "suspended", label: "Suspended", tone: "destructive", live: false },
  published: { kind: "published", label: "Published", tone: "success", live: true },
  draft: { kind: "draft", label: "Draft", tone: "neutral", live: false },
};

export function appletState(row: AppletStateFields): AppletState {
  if (row.deleted_at) return STATES.archived;
  if (row.status === "suspended") return STATES.suspended;
  if (row.status === "published" && row.published_to_web === true) return STATES.published;
  return STATES.draft;
}

/** "v3" — the saved content version; null while nothing has been built yet. */
export function appletVersionLabel(contentVersion: number | null | undefined): string | null {
  return typeof contentVersion === "number" && contentVersion > 0 ? `v${contentVersion}` : null;
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
