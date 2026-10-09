/**
 * Person brands: kind handling, link-in-bio parsing on a REAL captured page
 * (linktr.ee/melrobbins, 2026-10-09), and the creation flow's order and
 * failure handling.
 */

import fixture from "../__fixtures__/linktree-melrobbins.json";
import {
  brandKindCopy,
  brandKindOf,
  isBrandSelf,
  isPersonBrand,
  arrangeBrandNav,
  brandNavLabel,
  BRAND_KIND_COPY,
} from "../brand-kind";
import { extractPresenceLinks, isLinkInBioUrl, likelyWebsite, ownSiteLinks, urlsInText } from "../link-in-bio";
import {
  classifyStartInput,
  createPersonBrand,
  discoverPresence,
  planPersonBrand,
  type SeedProfile,
} from "../person-brand-flow";
import type { CreateBrandInput, CreatePropertyInput, MarketingBrand } from "../../types";

const seed: SeedProfile = {
  profileId: "11111111-1111-4111-8111-111111111111",
  platform: "instagram",
  platformUserId: "1234567",
  handle: "melrobbins",
  displayName: "Mel Robbins",
  bio: "Bestselling Author of The LET THEM Theory and Host of The Mel Robbins Podcast",
  avatarUrl: null,
  avatarFileId: null,
  externalUrl: "https://linktr.ee/melrobbins",
  profileUrl: "https://www.instagram.com/melrobbins",
  followers: 1000,
  isBusiness: false,
};

describe("brand kind — one switch, company by default", () => {
  it("reads unknown, null and missing kinds as company", () => {
    expect(brandKindOf(null)).toBe("company");
    expect(brandKindOf({ kind: null })).toBe("company");
    expect(brandKindOf("organization")).toBe("company");
    expect(brandKindOf({ kind: "person" })).toBe("person");
    expect(isPersonBrand("person")).toBe(true);
  });

  it("is self only for the person's own signed-in user on a person brand", () => {
    expect(isBrandSelf({ kind: "person", person_user_id: "u1" }, "u1")).toBe(true);
    expect(isBrandSelf({ kind: "person", person_user_id: "u1" }, "u2")).toBe(false);
    expect(isBrandSelf({ kind: "company", person_user_id: "u1" }, "u1")).toBe(false);
    expect(isBrandSelf({ kind: "person", person_user_id: null }, null)).toBe(false);
  });

  it("words every room for both kinds, and person rooms fit one line", () => {
    for (const kind of ["company", "person"] as const) {
      expect(Object.keys(BRAND_KIND_COPY[kind].rooms).sort()).toEqual(
        Object.keys(BRAND_KIND_COPY.company.rooms).sort(),
      );
    }
    for (const room of Object.values(BRAND_KIND_COPY.person.rooms)) {
      expect(room.description.length).toBeLessThanOrEqual(60);
    }
    expect(brandKindCopy({ kind: "person" }).rooms.competitors.name).toBe("Peers");
    expect(brandKindCopy(null).rooms.competitors.name).toBe("Competitors");
  });
});

describe("person brand wording — every screen reads the one config", () => {
  const person = BRAND_KIND_COPY.person;
  const company = BRAND_KIND_COPY.company;

  it("words the overview, strategy, peers and audience for a person", () => {
    expect(person.overview).toMatchObject({ factsTitle: "About", mapTitle: "Content map" });
    expect(person.overview.factsTitle).not.toBe(company.overview.factsTitle);
    expect(person.strategy.noun).toBe("strategy");
    expect(company.strategy.noun).toBe("brand strategy");
    expect([person.rivals.title, person.rivals.one, person.rooms.competitors.name]).toEqual(["Peers", "Peer", "Peers"]);
    expect(person.audience.noun).toBe("audience profile");
    expect(company.audience.noun).toBe("persona");
  });

  it("no person-brand string says competitor, persona, business or brand strategy", () => {
    // Values only: object keys (rooms.competitors) are identifiers, not words on screen.
    const strings: string[] = [];
    JSON.stringify(
      { ...person, offeringsLine: person.offeringsLine("X"), emptyLine: person.rivals.emptyLine("X") },
      (_key, value) => {
        if (typeof value === "string") strings.push(value);
        return value;
      },
    );
    const text = strings.join(" | ").toLowerCase();
    expect(text).not.toMatch(/competitor|persona|business|brand strategy|topical/);
  });

  it("the Competitors sidebar row reads Peers on a person brand only", () => {
    const row = { slug: "intelligence", subPath: "competitors", name: "Competitors" };
    expect(brandNavLabel("person", row)).toBe("Peers");
    expect(brandNavLabel("company", row)).toBe("Competitors");
    expect(brandNavLabel("person", { slug: "email", name: "Email" })).toBe("Email");
  });

  const groups = [
    { label: "Properties", modes: [{ slug: "websites", group: "Properties" }, { slug: "locations", group: "Properties" }] },
    { label: "Marketing", modes: [{ slug: "seo", group: "Marketing" }, { slug: "email", group: "Marketing" }] },
  ];
  const slugs = (g: { modes: { slug: string }[] }[]) => g.flatMap((x) => x.modes.map((m) => m.slug));

  it("a company's sidebar is untouched", () => {
    expect(slugs(arrangeBrandNav(groups, "company", false))).toEqual(["websites", "locations", "seo", "email"]);
  });

  it("a person without a website loses Locations and parks Websites and SEO under More", () => {
    const out = arrangeBrandNav(groups, "person", false);
    expect(slugs(out)).toEqual(["email", "websites", "seo"]);
    expect(out[out.length - 1].label).toBe("More");
  });

  it("a person with a website keeps Websites and SEO in place, still without Locations", () => {
    const out = arrangeBrandNav(groups, "person", true);
    expect(slugs(out)).toEqual(["websites", "seo", "email"]);
    expect(out.map((g) => g.label)).not.toContain("More");
  });
});

describe("website suggestions — their own site, never press", () => {
  const who = { handle: "jeffnippard", name: "Jeff Nippard" };
  it("keeps links whose host carries their handle or name", () => {
    expect(
      ownSiteLinks(
        [
          "https://www.usf.edu/news/jeff-nippard-study",
          "https://www.gq.com/story/jeff-nippard-workout",
          "https://www.sciencedirect.com/science/article/pii/S1",
          "https://jeffnippard.com/programs",
          "https://www.jeffnippard.com/blog",
          "https://macrofactorapp.com",
        ],
        who,
      ),
    ).toEqual(["https://jeffnippard.com"]);
  });
  it("offers nothing when no host carries their name", () => {
    expect(ownSiteLinks(["https://www.gq.com/story/x", "https://usf.edu"], who)).toEqual([]);
    expect(ownSiteLinks(["https://jeffnippard.com"], { handle: "jn", name: "" })).toEqual([]);
  });
  it("discovery offers only own-site candidates", async () => {
    const jeff: SeedProfile = { ...seed, handle: "jeffnippard", displayName: "Jeff Nippard", bio: "Science-Based Bodybuilding", externalUrl: "https://linktr.ee/jeffnippard" };
    const out = await discoverPresence(jeff, {
      scrape: async () => "https://jeffnippard.com/ https://www.usf.edu/news/x https://www.gq.com/story/jeff https://www.sciencedirect.com/a",
    });
    expect(out.siteCandidates).toEqual(["https://jeffnippard.com"]);
  });
});

describe("link-in-bio parsing — real Linktree capture", () => {
  it("knows hub hosts", () => {
    expect(isLinkInBioUrl("https://linktr.ee/melrobbins")).toBe(true);
    expect(isLinkInBioUrl("beacons.ai/someone")).toBe(true);
    expect(isLinkInBioUrl("https://melrobbins.com")).toBe(false);
  });

  it("finds every social account on the page and drops the seed", () => {
    const found = extractPresenceLinks(fixture, { ignore: [{ platform: "instagram", handle: "melrobbins" }] });
    const keys = found.accounts.map((a) => `${a.platform}:${a.handle}`);
    expect(keys).toEqual(
      expect.arrayContaining(["facebook:melrobbins", "youtube:melrobbins", "threads:melrobbins"]),
    );
    expect(keys).not.toContain("instagram:melrobbins");
    // Linktree's own footer, assets and blog never read as accounts or links.
    expect(found.links.some((l) => l.includes("linktr.ee"))).toBe(false);
    expect(found.links.filter((l) => /ogp\.me|mzstatic|gstatic|googleapis|w3\.org|schema\.org|sjv\.io|pxf\.io|thanks\.is|\.png|\.woff2/.test(l))).toEqual([]);
    // Outbound links survive as website candidates.
    expect(found.links).toEqual(expect.arrayContaining(["https://puregeniusprotein.com/mtt", "https://melrob.co/tt-letthem"]));
  });

  it("reads the same page as HTML-escaped JSON (how the scraper stream carries it)", () => {
    const escaped = JSON.stringify(JSON.stringify(fixture)).replace(/\//g, "\\/");
    const found = extractPresenceLinks([{ data: { results: [{ html: escaped }] } }]);
    expect(found.accounts.map((a) => a.platform)).toEqual(
      expect.arrayContaining(["facebook", "instagram", "youtube", "threads"]),
    );
  });

  it("undoes escapes and trailing punctuation in text", () => {
    expect(urlsInText("see https:\\/\\/x.com\\/melrobbins, and https://tiktok.com/@mel.")).toEqual([
      "https://x.com/melrobbins",
      "https://tiktok.com/@mel",
    ]);
  });

  it("guesses a website only when the host carries their handle or name", () => {
    expect(likelyWebsite(["https://open.spotify.com/show/x", "https://melrobbins.com/podcast"], { handle: "melrobbins" })).toBe(
      "https://melrobbins.com",
    );
    expect(likelyWebsite(["https://puregeniusprotein.com/mtt"], { handle: "melrobbins", name: "Mel Robbins" })).toBeNull();
    // Real Linktree link: Mel's vanity short-link domain is not her website.
    expect(likelyWebsite(["https://melrob.co/tt-letthem"], { handle: "melrobbins", name: "Mel Robbins" })).toBeNull();
  });
});

describe("person brand creation flow", () => {
  it("reads the hub from the bio link and merges what it finds", async () => {
    const scrape = jest.fn(async () => fixture);
    const d = await discoverPresence(seed, { scrape });
    expect(scrape).toHaveBeenCalledWith("https://linktr.ee/melrobbins");
    expect(d.hub).toBe("https://linktr.ee/melrobbins");
    expect(d.hubError).toBeNull();
    expect(d.accounts.map((a) => a.platform)).toEqual(expect.arrayContaining(["facebook", "youtube", "threads"]));
  });

  it("a scheme-less stored bio link (TikTok's real 'Linktr.ee/melrobbins') is read as a full https address", async () => {
    const scrape = jest.fn(async () => fixture);
    const d = await discoverPresence({ ...seed, platform: "tiktok", externalUrl: "Linktr.ee/melrobbins" }, { scrape });
    expect(scrape).toHaveBeenCalledWith("https://linktr.ee/melrobbins");
    expect(d.accounts.map((a) => a.platform)).toEqual(expect.arrayContaining(["instagram", "youtube", "facebook", "threads"]));
  });

  it("a hub that cannot be read is said, and the bio still counts", async () => {
    const d = await discoverPresence(
      { ...seed, bio: "Coach. Also on https://www.tiktok.com/@melrobbins" },
      { scrape: async () => { throw new Error("blocked"); } },
    );
    expect(d.hubError).toBe("blocked");
    expect(d.accounts).toEqual([{ platform: "tiktok", handle: "melrobbins", url: "https://www.tiktok.com/@melrobbins" }]);
  });

  it("a plain website bio link is the website, and nothing is scraped", async () => {
    const scrape = jest.fn();
    const d = await discoverPresence({ ...seed, externalUrl: "https://www.melrobbins.com/start" }, { scrape });
    expect(scrape).not.toHaveBeenCalled();
    expect(d.website).toBe("https://melrobbins.com");
  });

  it("a short link in the bio (Mel Robbins' real Instagram bio: apple.co) is never guessed as the website", async () => {
    const scrape = jest.fn();
    const d = await discoverPresence({ ...seed, externalUrl: "https://apple.co/3AcqwBa" }, { scrape });
    expect(scrape).not.toHaveBeenCalled();
    expect(d.website).toBeNull();
    expect(d.links).toEqual([]);
  });

  it("plans a person brand: seed first, every account owned by the person", () => {
    const plan = planPersonBrand({
      organizationId: "org",
      name: "",
      seed,
      chosen: [{ platform: "youtube", handle: "melrobbins", url: "https://www.youtube.com/@melrobbins" }],
      website: null,
      selfUserId: null,
    });
    expect(plan.brand).toMatchObject({ kind: "person", name: "Mel Robbins", description: seed.bio, personUserId: null });
    expect(plan.properties.map((p) => [p.kind, p.handle, p.ownerKind])).toEqual([
      ["instagram", "melrobbins", "person"],
      ["youtube", "melrobbins", "person"],
    ]);
  });

  it("a company started from a handle owns its accounts and makes no person", async () => {
    const plan = planPersonBrand({ kind: "company", organizationId: "org", name: "Acme Pilates", seed, chosen: [], website: null, selfUserId: "u1" });
    expect(plan.brand.kind).toBe("company");
    expect(plan.brand.personUserId).toBeNull();
    expect(plan.properties[0].ownerKind).toBe("company");
    const resolvePerson = jest.fn();
    const out = await createPersonBrand(plan, seed, {
      resolvePerson,
      createBrand: async (i: CreateBrandInput) => ({ id: "b1", ...i }) as unknown as MarketingBrand,
      createProperty: async () => ({ id: "p1" }),
      createSite: async () => ({ id: "s1" }),
    });
    expect(resolvePerson).not.toHaveBeenCalled();
    expect(out.partyId).toBeNull();
  });

  it("creates person → brand → properties in order, and a failed account never undoes the brand", async () => {
    const calls: string[] = [];
    const plan = planPersonBrand({
      organizationId: "org",
      name: "Mel Robbins",
      seed,
      chosen: [{ platform: "threads", handle: "melrobbins", url: "https://www.threads.com/@melrobbins" }],
      website: "melrobbins.com",
      selfUserId: "u1",
    });
    const props: CreatePropertyInput[] = [];
    const out = await createPersonBrand(plan, seed, {
      resolvePerson: async () => {
        calls.push("party");
        return "party-1";
      },
      createBrand: async (input) => {
        calls.push("brand");
        expect(input).toMatchObject({ kind: "person", personPartyId: "party-1", personUserId: "u1", websiteUrl: "https://melrobbins.com" });
        return { id: "brand-1" } as MarketingBrand;
      },
      createProperty: async (input) => {
        calls.push(`property:${input.kind}`);
        props.push(input);
        if (input.kind === "threads") throw new Error("duplicate");
        return { id: `prop-${input.kind}` };
      },
      createSite: async (input) => {
        calls.push("site");
        // The confirmed website becomes the brand's website property, under the new brand.
        expect(input).toMatchObject({ brandId: "brand-1", domain: "melrobbins.com", rootUrl: "https://melrobbins.com/" });
        return { id: "site-1" };
      },
    });
    expect(calls).toEqual(["party", "brand", "property:instagram", "property:threads", "site"]);
    expect(out.siteId).toBe("site-1");
    expect(props.every((p) => p.ownerPartyId === "party-1" && p.brandId === "brand-1")).toBe(true);
    expect(out.properties).toEqual([
      expect.objectContaining({ platform: "instagram", propertyId: "prop-instagram", error: null }),
      expect.objectContaining({ platform: "threads", propertyId: null, error: "duplicate" }),
    ]);
  });

  it("a website that cannot be saved is said, and the brand still stands", async () => {
    const plan = planPersonBrand({ organizationId: "org", name: "Mel Robbins", seed, chosen: [], website: "melrobbins.com", selfUserId: null });
    const out = await createPersonBrand(plan, seed, {
      resolvePerson: async () => "party-1",
      createBrand: async () => ({ id: "brand-1" }) as MarketingBrand,
      createProperty: async () => ({ id: "p" }),
      createSite: async () => {
        throw new Error("site refused");
      },
    });
    expect(out.brand.id).toBe("brand-1");
    expect(out.siteId).toBeNull();
    expect(out.siteError).toBe("site refused");
  });

  it("no website given means no site is created", async () => {
    const plan = planPersonBrand({ organizationId: "org", name: "Mel Robbins", seed, chosen: [], website: null, selfUserId: null });
    const createSite = jest.fn();
    const out = await createPersonBrand(plan, seed, {
      resolvePerson: async () => "party-1",
      createBrand: async () => ({ id: "brand-1" }) as MarketingBrand,
      createProperty: async () => ({ id: "p" }),
      createSite,
    });
    expect(createSite).not.toHaveBeenCalled();
    expect(out.siteId).toBeNull();
  });

  it("tells a handle, a social profile URL and a website apart", () => {
    expect(classifyStartInput("@melrobbins")).toBe("handle");
    expect(classifyStartInput("melrobbins")).toBe("handle");
    expect(classifyStartInput("https://www.instagram.com/melrobbins/")).toBe("social");
    expect(classifyStartInput("tiktok.com/@melrobbins")).toBe("social");
    expect(classifyStartInput("melrobbins.com")).toBe("website");
    expect(classifyStartInput("  ")).toBe("empty");
  });
});
