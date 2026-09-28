/**
 * Provision pass wave 4 — marketing call sites send their declared offered
 * values BY NAME, only ADDING keys, and omit every absent fact.
 */
import { compactOfferValues } from "@/features/marketing/lib/offer-values";
import {
  allInOneOfferValues,
  imagePromptOfferValues,
  pageImageOfferValues,
} from "@/features/marketing/lib/page-image-offer-values";
import { videoMetadataOfferValues } from "@/features/marketing/lib/video-metadata-offer-values";
import {
  endowmentLocationOfferValues,
  listingPresenceMarkdown,
} from "@/features/marketing/local/endowment-offer-values";
import type { ListingMatrixRow } from "@/features/marketing/types";

describe("compactOfferValues", () => {
  it("drops undefined, null, blank strings, NaN and empty arrays", () => {
    expect(
      compactOfferValues({
        a: undefined,
        b: null,
        c: "  ",
        d: Number.NaN,
        e: [],
        f: "kept",
        g: 0,
        h: ["x"],
      }),
    ).toEqual({ f: "kept", g: 0, h: ["x"] });
  });
});

describe("image provisions", () => {
  const pageFacts = {
    page_url: "https://greenrecycling.example/services/e-waste",
    page_path: "/services/e-waste",
    page_target_keyword: "e-waste recycling orange county",
    image_description: "Technician sorting circuit boards into bins",
    alt_text: "Technician sorting e-waste",
    placement: "",
  };

  it("image_prompt: only real facts, native numbers", () => {
    expect(
      imagePromptOfferValues({
        ...pageFacts,
        width_px: 1600,
        height_px: 900,
      }),
    ).toEqual({
      page_url: pageFacts.page_url,
      page_path: pageFacts.page_path,
      page_target_keyword: pageFacts.page_target_keyword,
      image_description: pageFacts.image_description,
      alt_text: pageFacts.alt_text,
      width_px: 1600,
      height_px: 900,
    });
    expect(imagePromptOfferValues(undefined)).toEqual({});
  });

  it("page_image: carries the ordered spec + style, never the keyword", () => {
    const out = pageImageOfferValues(pageFacts, "SPEC", "Hero / Banner");
    expect(out).toEqual({
      image_spec: "SPEC",
      style: "Hero / Banner",
      page_url: pageFacts.page_url,
      page_path: pageFacts.page_path,
      alt_text: pageFacts.alt_text,
    });
    // Unstyled order: style omitted, not sent empty.
    expect(pageImageOfferValues(undefined, "SPEC", "")).toEqual({
      image_spec: "SPEC",
    });
  });

  it("all_in_one: its declared subset only", () => {
    expect(
      Object.keys(allInOneOfferValues({ ...pageFacts, width_px: 1 })).sort(),
    ).toEqual(
      [
        "alt_text",
        "image_description",
        "page_path",
        "page_target_keyword",
        "page_url",
      ].sort(),
    );
  });
});

describe("marketing.video_metadata", () => {
  it("sends list + integer natively and omits absent facts", () => {
    expect(
      videoMetadataOfferValues({
        video_url: "https://www.youtube.com/watch?v=abc123",
        provider: "youtube",
        provider_video_id: "abc123",
        embedded_on_paths: ["/about", "/services"],
        view_count: 5120,
        channel_title: undefined,
        existing_title: "",
        site_name: "Green Recycling",
      }),
    ).toEqual({
      video_url: "https://www.youtube.com/watch?v=abc123",
      provider: "youtube",
      provider_video_id: "abc123",
      embedded_on_paths: ["/about", "/services"],
      view_count: 5120,
      site_name: "Green Recycling",
    });
  });
});

describe("marketing.local_endowment", () => {
  const location = {
    street_address: "1200 Main St",
    locality: "Irvine",
    region: "CA",
    postal_code: "92614",
    country_code: "US",
    description: null,
    categories: ["Recycling center", "E-waste recycling"],
    website_url: "https://greenrecycling.example",
    phone: null,
    status: "active",
  };
  const matrix = [
    {
      publisher: { name: "Google Business Profile" },
      listing: { status: "live", listing_url: "https://g.page/green" },
    },
    { publisher: { name: "Yelp" }, listing: null },
  ] as unknown as ListingMatrixRow[];

  it("maps the location row to declared names, omitting nulls", () => {
    expect(endowmentLocationOfferValues(location, matrix)).toEqual({
      street_address: "1200 Main St",
      locality: "Irvine",
      region: "CA",
      postal_code: "92614",
      country_code: "US",
      categories: ["Recycling center", "E-waste recycling"],
      website_url: "https://greenrecycling.example",
      location_status: "active",
      listing_presence:
        "- Google Business Profile: live (https://g.page/green)\n- Yelp: not listed",
    });
  });

  it("omits listing_presence with no publishers", () => {
    expect(listingPresenceMarkdown([])).toBeUndefined();
  });
});
