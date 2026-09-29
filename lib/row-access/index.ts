/**
 * THE ROW WORDS — the one client vocabulary and write shape for a record's two row controls on an
 * Organization or Public table (access ladder, common-docs/policies/access-ladder.md, Words table):
 *
 *   Shown to               Only me · My team · Everyone · Everyone on AI Matrx   (lists only, never a lock)
 *   Published to the web   on · off     (anyone, signed in or not, opens it at its address as a viewer)
 *   Indexed by search engines           (only meaningful once published to the web)
 *
 * A share without publishing is an Anyone link ("Anyone with the link", the Share dialog) — never a
 * row state. Private, Confidential and child records carry none of these columns (a database guard
 * refuses them), so a screen shows these controls only for a record whose table carries them: a
 * control is absent, never disabled, where it means nothing.
 *
 * Every surface that shows or writes a row's web state reads it from here, so the words cannot drift
 * between a pill, a panel, a list filter and a copy-for-AI payload. T-13 phase 5
 * (common-docs/projects/access-ladder/t13/PLAN.md) retired the old row column from client code.
 */
import type { Database } from "@/types/database.types";

export type ShownTo = Database["platform"]["Enums"]["shown_to"];

/** The four "Shown to" values, in the order a picker offers them. */
export const SHOWN_TO_VALUES: readonly ShownTo[] = [
  "only_me",
  "my_team",
  "everyone",
  "everyone_on_ai_matrx",
] as const;

export const SHOWN_TO_LABELS: Record<ShownTo, string> = {
  only_me: "Only me",
  my_team: "My team",
  everyone: "Everyone",
  everyone_on_ai_matrx: "Everyone on AI Matrx",
};

/** The control's own label, the published state's label, the action, and the indexing switch. */
export const SHOWN_TO_LABEL = "Shown to";
export const PUBLISHED_TO_WEB_LABEL = "Published to the web";
export const PUBLISH_TO_WEB_ACTION = "Publish to the web";
export const UNPUBLISH_FROM_WEB_ACTION = "Stop publishing to the web";
export const INDEXED_LABEL = "Indexed by search engines";

/**
 * "Everyone on AI Matrx" lists a record to every signed-in person on the platform, so the database
 * allows it only on a record published to the web (CHECK added by T-13 3.1). A picker offers it only
 * then.
 */
export function shownToChoices(publishedToWeb: boolean): readonly ShownTo[] {
  return publishedToWeb
    ? SHOWN_TO_VALUES
    : SHOWN_TO_VALUES.filter((v) => v !== "everyone_on_ai_matrx");
}

/** "Only me" etc.; null = the type's "Shown to by default" knob decides, named as such. */
export function shownToLabel(value: ShownTo | string | null | undefined): string {
  if (!value) return "Default for this type";
  return SHOWN_TO_LABELS[value as ShownTo] ?? value;
}

/** Compact web-state label for a pill / badge / table cell. */
export function publishedToWebLabel(publishedToWeb: boolean | null | undefined): string {
  return publishedToWeb ? PUBLISHED_TO_WEB_LABEL : "Not published";
}

/**
 * The write for "Publish to the web" / "Stop publishing": the switch and who flipped it when. The
 * database stamps `_at` / `_by` too; the client names them so the row it gets back is already true.
 */
export function publishedToWebPatch(
  on: boolean,
  userId: string | null,
): {
  published_to_web: boolean;
  published_to_web_at: string | null;
  published_to_web_by: string | null;
} {
  return {
    published_to_web: on,
    published_to_web_at: new Date().toISOString(),
    published_to_web_by: userId,
  };
}

/** The columns a list or card selects to show a row's two controls. */
export const ROW_ACCESS_COLUMNS = "shown_to, published_to_web" as const;
