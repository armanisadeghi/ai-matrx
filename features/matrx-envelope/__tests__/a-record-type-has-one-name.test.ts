/**
 * ONE RECORD TYPE, ONE NAME (G6A follow-up, 2026-10-02): an action card named
 * its type from the server catalogue ("Update Conversation") while the
 * reference picker called the same type "Chat". The card's noun catalog
 * (`matrxDirectiveNouns`, the package's `nouns` seam) now answers the picker's
 * display name, so every card, confirm and tally reads the word the picker
 * shows. This checks EVERY catalog noun and alias.
 */
jest.mock("@/components/dialogs/confirm/ConfirmDialogHost", () => ({ confirm: jest.fn() }));
jest.mock("@/components/agent-copy/CopyButtons", () => ({ CopyButtons: () => null }));

import { matrxDirectiveNouns } from "@/features/matrx-envelope/directiveHost";
import {
  CATALOG_ALIASES,
  CATALOG_NOUNS,
  CATALOG_NOUN_DISPLAY,
} from "@/features/matrx-envelope/catalog-nouns.generated";
import { referenceTypeDisplayLabel } from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

describe("a record type has one name on a card and in the picker", () => {
  const nouns = [
    ...new Set([
      ...Object.keys(CATALOG_NOUNS),
      ...Object.keys(CATALOG_NOUN_DISPLAY),
      ...Object.keys(CATALOG_ALIASES),
    ]),
  ].sort();

  it("covers the catalog", () => {
    expect(nouns.length).toBeGreaterThan(50);
  });

  it("every noun's card label is the picker's display name", () => {
    const mismatches = nouns
      .map((noun) => {
        const canonical = (CATALOG_ALIASES as Record<string, string>)[noun] ?? noun;
        const card = matrxDirectiveNouns(noun)?.label ?? null;
        const picker = referenceTypeDisplayLabel(canonical);
        return card === picker ? null : `${noun}: card "${card}" ≠ picker "${picker}"`;
      })
      .filter(Boolean);
    expect(mismatches).toEqual([]);
  });
});
