import { condensedList, parseLibraryViewValue } from "../librarySurface";
import {
  parseCopyDecksValue,
  parseCreateDeckSuggestionsValue,
} from "../communitySurface";
import { parseUpdateSuggestionsValue } from "../suggestionsSurface";
import type { DeckSuggestionRow, PublicDeck } from "../types";

jest.mock("@/features/surfaces/runtime/surface-writeback", () => ({
  refuseSurfaceWrite: (m: string) => {
    throw new Error(m);
  },
}));

const vocab = { subtype: ["quiz", "flashcards"], status: ["ready"], visibility: ["private"] };

describe("library_view", () => {
  it("reads every key", () => {
    expect(
      parseLibraryViewValue(
        { tab: "mine", kinds: ["assessment"], formats: ["quiz"], sort_by: "title", sort_direction: "ASC", search_query: " bio ", page: 2 },
        vocab,
      ),
    ).toEqual({
      tab: "mine",
      filters: { kind: ["assessment"], subtype: ["quiz"] },
      sort: "title",
      direction: "asc",
      search: "bio",
      page: 2,
    });
  });
  it("[] clears a filter", () => {
    expect(parseLibraryViewValue({ kinds: [] }, vocab).filters).toEqual({ kind: [] });
  });
  it("refuses unknown keys, tabs, formats, sorts and pages", () => {
    expect(() => parseLibraryViewValue({ foo: 1 }, vocab)).toThrow(/does not accept foo/);
    expect(() => parseLibraryViewValue({ tab: "orgs" }, vocab)).toThrow(/tab must be one of/);
    expect(() => parseLibraryViewValue({ formats: ["podcast"] }, vocab)).toThrow(/"podcast"/);
    expect(() => parseLibraryViewValue({ kinds: ["deck"] }, vocab)).toThrow(/"deck"/);
    expect(() => parseLibraryViewValue({ sort_by: "due" }, vocab)).toThrow(/sort_by/);
    expect(() => parseLibraryViewValue({ page: 0 }, vocab)).toThrow(/page/);
    expect(() => parseLibraryViewValue({}, vocab)).toThrow(/at least one key/);
    expect(() => parseLibraryViewValue([], vocab)).toThrow(/must be an object/);
  });
});

const deck = (id: string, name: string): PublicDeck => ({
  id,
  name,
  description: null,
  topic: null,
  difficulty: null,
  cardCount: 3,
  certified: false,
  certifiedNote: null,
  humanVerified: false,
  updatedAt: "2026-09-27T00:00:00Z",
});
const decks = [deck("d1", "Biology"), deck("d2", "Chemistry")];

describe("copy_decks", () => {
  it("takes ids or { id }", () => {
    expect(parseCopyDecksValue(["d1", { id: "d2" }], decks, true).map((d) => d.id)).toEqual(["d1", "d2"]);
  });
  it("refuses signed out, unknown and repeated ids", () => {
    expect(() => parseCopyDecksValue(["d1"], decks, false)).toThrow(/signed in/);
    expect(() => parseCopyDecksValue(["zz"], decks, true)).toThrow(/not a deck the page is showing/);
    expect(() => parseCopyDecksValue(["d1", "d1"], decks, true)).toThrow(/more than once/);
  });
});

describe("create_deck_suggestions", () => {
  it("reads deck_id + body", () => {
    expect(
      parseCreateDeckSuggestionsValue([{ deck_id: "d1", body: " Fix card 2 " }], decks, true),
    ).toEqual([{ deck: decks[0], body: "Fix card 2" }]);
  });
  it("refuses empty or long bodies and unknown decks", () => {
    expect(() => parseCreateDeckSuggestionsValue([{ deck_id: "d1", body: " " }], decks, true)).toThrow(/non-empty/);
    expect(() => parseCreateDeckSuggestionsValue([{ deck_id: "d1", body: "x".repeat(4001) }], decks, true)).toThrow(/limit/);
    expect(() => parseCreateDeckSuggestionsValue([{ deck_id: "no", body: "x" }], decks, true)).toThrow(/not a deck/);
    expect(() => parseCreateDeckSuggestionsValue([{ deck_id: "d1", body: "x" }], decks, false)).toThrow(/signed in/);
  });
});

const row = (id: string, status: string): DeckSuggestionRow => ({
  id,
  status,
  body: "b",
  created_at: "2026-09-27T00:00:00Z",
  custom_fields: {},
  owner_id: "o",
  resolved_at: null,
  resource_id: "d1",
  resource_type: "fc_set",
  suggested_by: "u",
});

describe("update_suggestions", () => {
  const rows = [row("s1", "open"), row("s2", "open"), row("s3", "accepted")];
  it("answers open suggestions", () => {
    expect(
      parseUpdateSuggestionsValue([{ id: "s1", status: "accepted" }, { id: "s2", status: "Declined" }], rows).map((p) => p.status),
    ).toEqual(["accepted", "declined"]);
  });
  it("refuses answered, unknown, repeated, bad status, and not-loaded", () => {
    expect(() => parseUpdateSuggestionsValue([{ id: "s3", status: "declined" }], rows)).toThrow(/already accepted/);
    expect(() => parseUpdateSuggestionsValue([{ id: "zz", status: "declined" }], rows)).toThrow(/not a suggestion/);
    expect(() => parseUpdateSuggestionsValue([{ id: "s1", status: "accepted" }, { id: "s1", status: "declined" }], rows)).toThrow(/more than once/);
    expect(() => parseUpdateSuggestionsValue([{ id: "s1", status: "open" }], rows)).toThrow(/accepted" or "declined/);
    expect(() => parseUpdateSuggestionsValue([{ id: "s1", status: "accepted" }], null)).toThrow(/not loaded/);
  });
});

describe("library_list stays inline", () => {
  it("never passes the 4000-char list tier, even with long, fully studied rows", () => {
    // Only the fields toLibraryListRow reads.
    const long = Array.from({ length: 25 }, (_, i) => ({
      id: `00000000-0000-0000-0000-${String(i).padStart(12, "0")}`,
      title: "A very long study item title that keeps going and going past sixty characters",
      kind: "assessment",
      subtype: "practice_test",
      is_owner: false,
      item_count: 30,
      studied_count: 30,
      accuracy_pct: 0.87,
      due_count: 12,
      last_studied_at: "2026-09-27T10:00:00Z",
    })) as unknown as Parameters<typeof condensedList>[0];
    const list = condensedList(long);
    expect(JSON.stringify(list).length).toBeLessThanOrEqual(4000);
    expect(list.length).toBeGreaterThan(15);
    expect(list[0]).toEqual({
      id: "00000000-0000-0000-0000-000000000000",
      title: "A very long study item title that keeps going and going pas…",
      format: "practice_test",
      items: 30,
      due: 12,
      accuracy_pct: 87,
      last_studied: "2026-09-27",
      mine: false,
    });
  });
});
