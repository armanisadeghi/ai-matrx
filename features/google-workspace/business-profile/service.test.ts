import {
  googleBusinessProfileReviewService,
  type BusinessProfileAccountsPreview,
  type BusinessProfileLocationsPreview,
  type BusinessProfileReviewsPreview,
} from "./service";

const postGoogleBackend = jest.fn();
jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
}));

const accountRequest = {
  connection_id: "connection-harbor",
  page_token: "accounts-2",
};
const locationRequest = {
  connection_id: "connection-harbor",
  account_name: "accounts/harbor-dental",
  page_token: "locations-2",
};
const reviewRequest = {
  connection_id: "connection-harbor",
  account_name: "accounts/harbor-dental",
  location_name: "locations/downtown",
  page_token: "reviews-2",
};
const accounts: BusinessProfileAccountsPreview = {
  connection_id: "connection-harbor",
  account_label: "Harbor Dental",
  accounts: [
    {
      name: "accounts/harbor-dental",
      accountName: "Harbor Dental",
      type: "LOCATION_GROUP",
      role: "OWNER",
    },
  ],
  page_token: "accounts-2",
  next_page_token: "accounts-3",
  state: "incomplete",
};
const locations: BusinessProfileLocationsPreview = {
  connection_id: "connection-harbor",
  account_label: "Harbor Dental",
  account_name: "accounts/harbor-dental",
  locations: [
    {
      name: "locations/downtown",
      title: "Harbor Dental Downtown",
      metadata: {
        mapsUri:
          "https://www.google.com/maps/place/?q=place_id:harbor-dental-downtown",
      },
    },
  ],
  page_token: "locations-2",
  next_page_token: null,
  state: "terminal",
};
const reviews: BusinessProfileReviewsPreview = {
  connection_id: "connection-harbor",
  account_label: "Harbor Dental",
  account_name: "accounts/harbor-dental",
  location_name: "locations/downtown",
  reviews: [
    {
      reviewId: "review-harbor-1",
      name: "accounts/harbor-dental/locations/downtown/reviews/review-harbor-1",
      reviewer: { displayName: "Morgan Lee", isAnonymous: false },
      starRating: "FIVE",
      comment: "The check-in was kind and quick.",
      createTime: "2026-02-03T15:00:00Z",
      reviewReply: {
        comment: "Thank you for visiting.",
        updateTime: "2026-02-04T15:00:00Z",
      },
    },
  ],
  average_rating: 4.8,
  total_review_count: 43,
  page_token: "reviews-2",
  next_page_token: null,
  state: "terminal",
};

describe("Business Profile reviewer provider boundary", () => {
  beforeEach(() => postGoogleBackend.mockReset());
  it("sends the exact accounts request with organization context and preserves its response", async () => {
    postGoogleBackend.mockResolvedValue({ json: async () => accounts });
    await expect(
      googleBusinessProfileReviewService.previewAccounts(
        accountRequest,
        "org-harbor",
      ),
    ).resolves.toEqual(accounts);
    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-integrations/business-profile/accounts/preview",
      accountRequest,
      expect.stringContaining("Business Profile"),
      "org-harbor",
    );
  });
  it("sends the exact locations request with organization context and preserves its response", async () => {
    postGoogleBackend.mockResolvedValue({ json: async () => locations });
    await expect(
      googleBusinessProfileReviewService.previewLocations(
        locationRequest,
        "org-harbor",
      ),
    ).resolves.toEqual(locations);
    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-integrations/business-profile/locations/preview",
      locationRequest,
      expect.stringContaining("Business Profile"),
      "org-harbor",
    );
  });
  it("sends the exact reviews request with organization context and preserves its response", async () => {
    postGoogleBackend.mockResolvedValue({ json: async () => reviews });
    await expect(
      googleBusinessProfileReviewService.previewReviews(
        reviewRequest,
        "org-harbor",
      ),
    ).resolves.toEqual(reviews);
    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-integrations/business-profile/reviews/preview",
      reviewRequest,
      expect.stringContaining("Business Profile"),
      "org-harbor",
    );
  });
  it("rejects a page whose echoed request does not match the selected location", async () => {
    postGoogleBackend.mockResolvedValue({
      json: async () => ({ ...reviews, location_name: "locations/other" }),
    });
    await expect(
      googleBusinessProfileReviewService.previewReviews(
        reviewRequest,
        "org-harbor",
      ),
    ).rejects.toThrow("invalid review page");
  });
  it.each([
    ["string metadata", "not-an-object"],
    ["array metadata", []],
    ["non-string maps URI", { mapsUri: 42 }],
  ])("rejects malformed location %s", async (_label, metadata) => {
    postGoogleBackend.mockResolvedValue({
      json: async () => ({
        ...locations,
        locations: [{ ...locations.locations[0], metadata }],
      }),
    });
    await expect(
      googleBusinessProfileReviewService.previewLocations(
        locationRequest,
        "org-harbor",
      ),
    ).rejects.toThrow("invalid location page");
  });
});
