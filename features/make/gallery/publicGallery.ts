// features/make/gallery/publicGallery.ts — LANE MAKE-HOME (v6), wave 4b: the public gallery's pure half.
//
// Arman, 2026-10-02: the template gallery is public and indexed. Every published platform template
// has a public page at /templates/<catalogue id> with "Use this template", which leads through
// sign-up to the install for that template (/make/templates/<id>). The address uses the catalogue id
// because it survives a new version; the install uses the version's id the page read.
//
// THE DOOR (one source, G3): the same catalogue door the signed-in gallery reads, `custom.templates`,
// asked for platform templates only. A signed-out read reaches it only when the database lets the
// anonymous caller in. Until then — or while the template family is not on this database at all —
// the read answers `closed` and the pages render an honest empty gallery; they never crash and never
// show a stitched-in second list.

import { signUpHref } from "@/utils/auth/auth-destination";

import { GALLERY_PAGE, type GalleryAnswer, type GalleryCard } from "./catalogue";

export const PUBLIC_GALLERY_PATH = "/templates";

export const publicTemplateHref = (catalogueId: string) => `${PUBLIC_GALLERY_PATH}/${encodeURIComponent(catalogueId)}`;

/** "Use this template": sign up, then land on the install for this exact template. */
export const templateSignUpHref = (card: Pick<GalleryCard, "id">) => signUpHref(`/make/templates/${card.id}`);

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

export const platformFilter = (offset: number) => ({ scope: "platform", limit: GALLERY_PAGE, offset });

/** One sentence for a page's description: the template's persona, else its business. */
export function templateDescription(card: GalleryCard): string {
  const text = card.persona ?? card.business ?? card.name;
  return text.length > 160 ? `${text.slice(0, 157).trimEnd()}…` : text;
}
