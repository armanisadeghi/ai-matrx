// features/flashcards/components/create/createDeckHref.ts
//
// The one address of the Create deck page, plus the redirect used by the
// retired routes (`/new/from-source`, `/new/import`): every query the old link
// carried (a document id, a topic) is kept, so it arrives as a picked Source.

export const CREATE_DECK_HREF = "/education/flashcards/new";

type Search = Record<string, string | string[] | undefined>;

export function createDeckHref(search: Search = {}, extra: Record<string, string> = {}): string {
  const qs = new URLSearchParams();
  for (const [key, value] of Object.entries(search)) {
    if (Array.isArray(value)) value.forEach((v) => qs.append(key, v));
    else if (value !== undefined) qs.set(key, value);
  }
  for (const [key, value] of Object.entries(extra)) qs.set(key, value);
  const s = qs.toString();
  return s ? `${CREATE_DECK_HREF}?${s}` : CREATE_DECK_HREF;
}
