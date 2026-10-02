/**
 * One record type, ONE name — singular AND plural.
 *
 * THE DEFECT (G8B review, 2026-10-02, nightly clone): the type was "Chat" in
 * the chooser and on every card, but its search said "Search
 * conversations…" — the list read the registry's plural, not the display rule.
 * Census: every type the picker can offer, plus file / url / scope.
 */
import { CATALOG_NOUN_DISPLAY } from "@/features/matrx-envelope/catalog-nouns.generated";
import { listableTokens, tryGetEntityInfo } from "@/features/scopes/registry/entityRegistry";
import { referenceTypeLabel } from "@/features/scopes/utils/referenceCell";
import {
  referenceTypeDisplayLabel,
  referenceTypeDisplayPlural,
} from "@/features/matrx-envelope/components/reference-picker/referencePickerTypes";

const tokens = [
  ...new Set<string>(["file", "url", "scope", ...listableTokens(), ...Object.keys(CATALOG_NOUN_DISPLAY)]),
];

describe("a type's plural comes from its display name", () => {
  it("Chat is Chats", () => {
    expect(referenceTypeDisplayLabel("conversation")).toBe("Chat");
    expect(referenceTypeDisplayPlural("conversation")).toBe("Chats");
  });

  it("no type whose display name differs from the registry's says the registry's plural", () => {
    const leaks: string[] = [];
    for (const token of tokens) {
      const display = referenceTypeDisplayLabel(token);
      const registryPlural = tryGetEntityInfo(token)?.labelPlural;
      if (!registryPlural) continue;
      if (display.toLowerCase() === referenceTypeLabel(token).toLowerCase()) continue;
      if (referenceTypeDisplayPlural(token) === registryPlural) {
        leaks.push(`${token}: "${display}" but "${registryPlural}"`);
      }
    }
    expect(tokens.length).toBeGreaterThan(20);
    expect(leaks).toEqual([]);
  });
});
