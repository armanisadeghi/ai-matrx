// features/make/gallery/publicGallery.ts — LANE MAKE-HOME (v6), wave 4b: the public gallery's pure half.
//
// Arman, 2026-10-02: the template gallery is public and indexed. Every published platform template
// has a public page at /templates/<slug> (lane CHAIR-GALLERY, 2026-10-05: the spec's own readable id,
// unique and stable across versions) — the same page signed in or out. Signed in, "Use this template"
// installs there; a guest signs up and returns to it. Catalogue-id and version-id addresses redirect.
//
// THE DOOR (one source, G3): the same catalogue door the signed-in gallery reads, `custom.templates`,
// asked for platform templates only. A signed-out read reaches it only when the database lets the
// anonymous caller in. Until then — or while the template family is not on this database at all —
// the read answers `closed` and the pages render an honest empty gallery; they never crash and never
// show a stitched-in second list.

import { signUpHref } from "@/utils/auth/auth-destination";

import { GALLERY_PAGE, type GalleryAnswer, type GalleryCard } from "./catalogue";

export const PUBLIC_GALLERY_PATH = "/templates";

/** One template's page: its readable address, else the catalogue id (which redirects to the address). */
export const publicTemplateHref = (card: Pick<GalleryCard, "slug" | "catalogue_id">) =>
  `${PUBLIC_GALLERY_PATH}/${encodeURIComponent(card.slug ?? card.catalogue_id)}`;

export const industryHref = (industry: string) => `${PUBLIC_GALLERY_PATH}/category/${encodeURIComponent(industry)}`;
export const jobHref = (job: string) => `${PUBLIC_GALLERY_PATH}/job/${encodeURIComponent(job)}`;

/** The query a guest carries through sign-up so the page installs the template on return. */
export const INSTALL_ON_RETURN = "install";

/** "Use this template" for a guest: sign up, then come back to this page and install. */
export const templateSignUpHref = (card: Pick<GalleryCard, "slug" | "catalogue_id">) =>
  signUpHref(`${publicTemplateHref(card)}?${INSTALL_ON_RETURN}=1`);

/** What a signed-out read of the catalogue answered. */
export type PublicRead =
  | { state: "open"; cards: GalleryCard[] }
  /** The door is not on this database, or refuses a caller with no session. */
  | { state: "closed"; reason: "absent" | "refused" };

interface DoorError {
  code?: string | null;
  message?: string | null;
}

/**
 * Absent (PostgREST cannot find the function / schema, Postgres has no such function) and refused
 * (no execute grant, or the door's own "Sign in" refusal) are the two states a signed-out visitor
 * meets before the family is public. Anything else is a real failure: null here, and the caller throws.
 */
export function closedReason(error: DoorError): "absent" | "refused" | null {
  const code = error.code ?? "";
  if (code === "PGRST202" || code === "42883" || code === "PGRST106" || code === "3F000") return "absent";
  if (code === "42501") return "refused";
  return null;
}

/** The platform's published templates only: an organization's own saved templates are never public. */
export function publicCards(cards: readonly GalleryCard[]): GalleryCard[] {
  return cards.filter((c) => c.scope === "platform" && !c.owner_organization_id);
}

type Rpc = (offset: number) => PromiseLike<{ data: unknown; error: DoorError | null }>;

/** Reads every platform card, page by page, and classifies a closed door. */
export async function readPublicCatalogueWith(rpc: Rpc): Promise<PublicRead> {
  const cards: GalleryCard[] = [];
  let offset = 0;
  for (;;) {
    const { data, error } = await rpc(offset);
    if (error) {
      const reason = closedReason(error);
      if (reason) return { state: "closed", reason };
      throw new Error(`The template catalogue could not be read: ${error.message ?? error.code ?? "unknown error"}`);
    }
    const answer = data as GalleryAnswer;
    cards.push(...answer.cards);
    offset += GALLERY_PAGE;
    if (answer.cards.length < GALLERY_PAGE || offset >= answer.total) break;
  }
  return { state: "open", cards: publicCards(cards) };
}

export const platformFilter = (offset: number) => ({ scope: "platform", limit: GALLERY_PAGE, offset, thumb: true });

/** One sentence for a page's description: the template's persona, else its business. */
export function templateDescription(card: Pick<GalleryCard, "persona" | "business" | "name">): string {
  const text = card.persona ?? card.business ?? card.name;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
