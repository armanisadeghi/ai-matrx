import type { Database } from "@/types/database.types";
import type { AppStatus } from "@/features/applets/types";
import { publishedToWebPatch } from "@/lib/row-access";

type AppletUpdate = Database["app"]["Tables"]["definition"]["Update"];

export interface AppletPublicationPatch {
  status: AppStatus;
  published_to_web: boolean;
  published_to_web_at: string | null;
  published_to_web_by: string | null;
  published_at: string | null;
}

type _PublicationPatchFitsDatabase =
  AppletPublicationPatch extends Pick<
    AppletUpdate,
    | "status"
    | "published_to_web"
    | "published_to_web_at"
    | "published_to_web_by"
    | "published_at"
  >
    ? true
    : false;
declare const publicationPatchFitsDatabase: _PublicationPatchFitsDatabase;
true satisfies typeof publicationPatchFitsDatabase;

/**
 * The one publication transition for Applets. A public link is live only
 * when status is `published` AND the app is published to the web, so callers
 * must never write either field independently when the user's intent is
 * Publish/Unpublish. `userId` names who flipped it (the database stamps it too).
 */
export function appletPublicationPatch(
  published: boolean,
  publishedAt = new Date().toISOString(),
  userId: string | null = null,
): AppletPublicationPatch {
  const web = publishedToWebPatch(published, userId);
  return published
    ? {
        status: "published",
        ...web,
        published_to_web_at: publishedAt,
        published_at: publishedAt,
      }
    : {
        status: "draft",
        ...web,
        published_at: null,
      };
}

/**
 * "Use it" / Sharing: who opens the Applet. Using it and putting it on the web are separate choices
 * (audit9 B8) — "organization" puts it in use with the web switch OFF (row security keeps it to her
 * organization); "web" is the publication transition above.
 */
export function appletAudiencePatch(
  audience: "organization" | "web",
  at = new Date().toISOString(),
  userId: string | null = null,
): AppletPublicationPatch {
  if (audience === "web") return appletPublicationPatch(true, at, userId);
  return { status: "published", ...publishedToWebPatch(false, userId), published_at: at };
}
