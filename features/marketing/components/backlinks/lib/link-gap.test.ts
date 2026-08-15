import {
  authorityTone,
  linkGapReviewLabel,
  matchCountLabel,
  parseMatrxAuthority,
  prospectHeadline,
  seededCompetitorLabel,
  spamToneForScore,
  UNMEASURED_LABEL,
} from "./link-gap";

describe("Matrx Authority Score explanation", () => {
  it("reads every component with its contribution and why", () => {
    const authority = parseMatrxAuthority({
      matrx_authority: {
        value: 62,
        band: "solid",
        confidence: "medium",
        why: "A real publication with a modest audience.",
        components: [
          {
            key: "referring_domains",
            label: "Sites linking to them",
            raw: 1840,
            normalized: 0.7,
            contribution: 28,
            why: "Plenty of other sites vouch for them.",
          },
          { key: "spam", label: "Spam signals", raw: 4, contribution: -2 },
        ],
        missing: ["traffic"],
      },
    });
    expect(authority.value).toBe(62);
    expect(authority.band).toBe("solid");
    expect(authority.components).toHaveLength(2);
    expect(authority.components[0].contribution).toBe(28);
    expect(authority.components[1].why).toBeNull();
    expect(authority.missing).toEqual(["traffic"]);
  });

  it("never invents a score from a missing or malformed block", () => {
    expect(parseMatrxAuthority(null).value).toBeNull();
    expect(parseMatrxAuthority({}).value).toBeNull();
    expect(parseMatrxAuthority({ matrx_authority: "n/a" }).value).toBeNull();
    expect(
      parseMatrxAuthority({ matrx_authority: { value: "62" } }).value,
    ).toBeNull();
  });

  it("drops component entries with no key instead of rendering blanks", () => {
    const authority = parseMatrxAuthority({
      matrx_authority: { components: [{ label: "Orphan" }, "junk"] },
    });
    expect(authority.components).toEqual([]);
  });
});

describe("THE UNMEASURED RULE", () => {
  it("gives an unmeasured score its own tone — never the worst one", () => {
    expect(authorityTone(null)).toBe("unmeasured");
    expect(authorityTone(0)).toBe("weak");
    expect(authorityTone(45)).toBe("solid");
    expect(authorityTone(88)).toBe("strong");
  });

  it("says not-measured rather than zero or a bare dash", () => {
    expect(UNMEASURED_LABEL).toBe("Not measured");
  });

  it("treats an unknown spam score as unknown, not clean", () => {
    expect(spamToneForScore(null)).toBe("unknown");
    expect(spamToneForScore(0)).toBe("clean");
    expect(spamToneForScore(35)).toBe("watch");
    expect(spamToneForScore(80)).toBe("toxic");
  });
});

describe("prospect vocabulary", () => {
  it("prefers the stored reason and falls back to the plain fact", () => {
    expect(
      prospectHeadline({
        displayDomain: "example.com",
        matchCount: 3,
        priorityReason: "  Links to three rivals from an editorial roundup. ",
      }),
    ).toBe("Links to three rivals from an editorial roundup.");
    expect(
      prospectHeadline({
        displayDomain: "example.com",
        matchCount: 3,
        priorityReason: null,
      }),
    ).toBe("example.com links to 3 of your competitors and not to you.");
  });

  it("pluralizes the primary sort in the user's words", () => {
    expect(matchCountLabel(1)).toBe("Links to 1 of your competitor");
    expect(matchCountLabel(4)).toBe("Links to 4 of your competitors");
  });

  it("labels review states in the words a human reads", () => {
    expect(linkGapReviewLabel("approved")).toBe("Approved");
    expect(linkGapReviewLabel("snoozed")).toBe("Later");
    // An unknown state is treated as still awaiting a decision — never blank.
    expect(linkGapReviewLabel("something_new")).toBe("Waiting on you");
    expect(linkGapReviewLabel(null)).toBe("Waiting on you");
  });

  it("says how a seeded competitor qualified, and when the user chose it", () => {
    expect(
      seededCompetitorLabel({
        entity_role: "business",
        business_overlap: "direct",
        market_overlap: "same",
        explicitly_enabled: false,
      }),
    ).toBe("direct overlap · same market · business");
    expect(
      seededCompetitorLabel({
        entity_role: null,
        business_overlap: null,
        market_overlap: null,
        explicitly_enabled: true,
      }),
    ).toBe("You included it");
  });
});
