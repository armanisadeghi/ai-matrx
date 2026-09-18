/**
 * 🚨 N6 (VERIFY-U-P1-R5) — THE WORDS FOR A PARTY, COVERED AGAINST THE LIVE DATA.
 *
 * `crm.party` held 1,892 rows when this was written: 460 `party_kind = person`
 * and 1,432 `organization` — read live from Supabase project
 * `brsgrqvjdzwihsvnfqkf` on 2026-09-18, `select party_kind, count(*) … group by
 * 1`. There is no third value and no null. Every one of those 1,892 records was
 * labelled "Person".
 *
 * This guard is over the CLASS, not the instance: it asserts the resolver covers
 * every kind the closed vocabulary declares (so adding one to `PARTY_KINDS`
 * without a word here fails), that an unknown or absent kind reads the honest
 * generic and NEVER "Person", and that the platform `visibility` enum — all four
 * live values — has a plain-English sentence.
 */
import { PARTY_KINDS } from "../types";
import {
  GENERIC_PARTY_WORDS,
  PARTY_KIND_WORDS,
  isKnownPartyKind,
  partyKindWord,
  partyKindWordPlural,
} from "../party-words";
import { DESCRIBED_VISIBILITIES, visibilityWords } from "@/lib/record-words";

/** What the live table actually holds, so a drift here is visible in review. */
const LIVE_PARTY_KINDS = ["organization", "person"] as const;
const LIVE_VISIBILITIES = ["personal", "internal", "link", "public"] as const;

describe("the party words cover every live kind", () => {
  it("the closed vocabulary still matches the live column", () => {
    expect([...PARTY_KINDS].sort()).toEqual([...LIVE_PARTY_KINDS].sort());
  });

  it("every declared kind has a singular and a plural word", () => {
    for (const kind of PARTY_KINDS) {
      const words = PARTY_KIND_WORDS[kind];
      expect(words.singular.length).toBeGreaterThan(0);
      expect(words.plural.length).toBeGreaterThan(0);
      expect(partyKindWord(kind)).toBe(words.singular);
      expect(partyKindWordPlural(kind)).toBe(words.plural);
    }
  });

  it("says Person for a person and Company for an organization", () => {
    expect(partyKindWord("person")).toBe("Person");
    expect(partyKindWord("organization")).toBe("Company");
    expect(partyKindWordPlural("person")).toBe("People");
    expect(partyKindWordPlural("organization")).toBe("Companies");
  });

  it("an unknown or absent kind reads the generic word, never Person", () => {
    for (const unknown of [null, undefined, "", "trust", "estate", 7, {}]) {
      expect(partyKindWord(unknown)).toBe(GENERIC_PARTY_WORDS.singular);
      expect(partyKindWord(unknown)).not.toBe("Person");
      expect(isKnownPartyKind(unknown)).toBe(false);
    }
  });
});

describe("a record's visibility in plain English", () => {
  it("describes every value the live enum can hold", () => {
    for (const value of LIVE_VISIBILITIES) {
      expect(DESCRIBED_VISIBILITIES).toContain(value);
      const sentence = visibilityWords(value);
      expect(sentence).toBeTruthy();
      // The enum label itself is never the answer.
      expect(sentence).not.toBe(value);
    }
  });

  it("is absent for an absent value and announces itself for an unknown one", () => {
    expect(visibilityWords(null)).toBeNull();
    expect(visibilityWords("")).toBeNull();
    expect(visibilityWords("shared_with_partners")).toMatch(
      /Not described in plain words yet/,
    );
    expect(visibilityWords("shared_with_partners")).toContain("shared_with_partners");
  });
});
