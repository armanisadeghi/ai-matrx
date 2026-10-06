import type { components } from "@ai-matrx/agents/generated/api-types";
import { postGoogleBackend } from "@/features/marketing/google/service";

export type BusinessProfileAccountsRequest =
  components["schemas"]["BusinessProfileAccountsRequest"];
export type BusinessProfileAccountsPreview =
  components["schemas"]["BusinessProfileAccountsPreview"];
export type BusinessProfileLocationsRequest =
  components["schemas"]["BusinessProfileLocationsRequest"];
export type BusinessProfileLocationsPreview =
  components["schemas"]["BusinessProfileLocationsPreview"];
export type BusinessProfileReviewsRequest =
  components["schemas"]["BusinessProfileReviewsRequest"];
export type BusinessProfileReviewsPreview =
  components["schemas"]["BusinessProfileReviewsPreview"];
type BusinessProfileAccount = components["schemas"]["BusinessProfileAccount"];
type BusinessProfileLocation = components["schemas"]["BusinessProfileLocation"];
type BusinessProfileLocationMetadata =
  components["schemas"]["BusinessProfileLocationMetadata"];
type BusinessProfileReview = components["schemas"]["BusinessProfileReview"];

export interface BusinessProfileReviewService {
  previewAccounts(
    request: BusinessProfileAccountsRequest,
    organizationId: string,
  ): Promise<BusinessProfileAccountsPreview>;
  previewLocations(
    request: BusinessProfileLocationsRequest,
    organizationId: string,
  ): Promise<BusinessProfileLocationsPreview>;
  previewReviews(
    request: BusinessProfileReviewsRequest,
    organizationId: string,
  ): Promise<BusinessProfileReviewsPreview>;
}

const accountsPath = "/google-integrations/business-profile/accounts/preview";
const locationsPath = "/google-integrations/business-profile/locations/preview";
const reviewsPath = "/google-integrations/business-profile/reviews/preview";

function record(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function text(value: unknown): value is string {
  return typeof value === "string";
}
function optionalText(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || text(value);
}
function state(value: unknown): value is "incomplete" | "terminal" {
  return value === "incomplete" || value === "terminal";
}
function samePageToken(
  actual: unknown,
  expected: string | null | undefined,
): boolean {
  return (actual ?? null) === (expected ?? null);
}
function validateBase(
  value: Record<string, unknown>,
  connectionId: string,
  pageToken: string | null | undefined,
): boolean {
  return (
    value.connection_id === connectionId &&
    text(value.account_label) &&
    state(value.state) &&
    optionalText(value.page_token) &&
    optionalText(value.next_page_token) &&
    samePageToken(value.page_token, pageToken)
  );
}

function isAccount(value: unknown): value is BusinessProfileAccount {
  return (
    record(value) &&
    text(value.name) &&
    optionalText(value.accountName) &&
    optionalText(value.type) &&
    optionalText(value.role)
  );
}
function isLocationMetadata(
  value: unknown,
): value is BusinessProfileLocationMetadata {
  return record(value) && optionalText(value.mapsUri);
}
function isLocation(value: unknown): value is BusinessProfileLocation {
  return (
    record(value) &&
    text(value.name) &&
    optionalText(value.title) &&
    (value.metadata == null || isLocationMetadata(value.metadata))
  );
}
function isReview(value: unknown): value is BusinessProfileReview {
  return (
    record(value) &&
    text(value.reviewId) &&
    optionalText(value.name) &&
    optionalText(value.starRating) &&
    optionalText(value.comment) &&
    optionalText(value.createTime) &&
    optionalText(value.updateTime) &&
    (value.reviewer == null ||
      (record(value.reviewer) &&
        optionalText(value.reviewer.displayName) &&
        optionalText(value.reviewer.profilePhotoUrl) &&
        (value.reviewer.isAnonymous == null ||
          typeof value.reviewer.isAnonymous === "boolean"))) &&
    (value.reviewReply == null ||
      (record(value.reviewReply) &&
        text(value.reviewReply.comment) &&
        optionalText(value.reviewReply.updateTime)))
  );
}
function isAccountsPreview(
  value: unknown,
): value is BusinessProfileAccountsPreview {
  return (
    record(value) &&
    text(value.connection_id) &&
    text(value.account_label) &&
    state(value.state) &&
    optionalText(value.page_token) &&
    optionalText(value.next_page_token) &&
    Array.isArray(value.accounts) &&
    value.accounts.every(isAccount)
  );
}
function isLocationsPreview(
  value: unknown,
): value is BusinessProfileLocationsPreview {
  return (
    record(value) &&
    text(value.connection_id) &&
    text(value.account_label) &&
    text(value.account_name) &&
    state(value.state) &&
    optionalText(value.page_token) &&
    optionalText(value.next_page_token) &&
    Array.isArray(value.locations) &&
    value.locations.every(isLocation)
  );
}
function isReviewsPreview(
  value: unknown,
): value is BusinessProfileReviewsPreview {
  return (
    record(value) &&
    text(value.connection_id) &&
    text(value.account_label) &&
    text(value.account_name) &&
    text(value.location_name) &&
    state(value.state) &&
    optionalText(value.page_token) &&
    optionalText(value.next_page_token) &&
    Array.isArray(value.reviews) &&
    value.reviews.every(isReview)
  );
}

/** Reject a response which is not the exact transient page requested. */
export function validateAccountsPreview(
  value: unknown,
  request: BusinessProfileAccountsRequest,
): BusinessProfileAccountsPreview {
  if (
    !isAccountsPreview(value) ||
    !validateBase(value, request.connection_id, request.page_token) ||
    !Array.isArray(value.accounts)
  ) {
    throw new Error("Business Profile returned an invalid account page.");
  }
  return value;
}
export function validateLocationsPreview(
  value: unknown,
  request: BusinessProfileLocationsRequest,
): BusinessProfileLocationsPreview {
  if (
    !isLocationsPreview(value) ||
    !validateBase(value, request.connection_id, request.page_token) ||
    value.account_name !== request.account_name ||
    !Array.isArray(value.locations)
  ) {
    throw new Error("Business Profile returned an invalid location page.");
  }
  return value;
}
export function validateReviewsPreview(
  value: unknown,
  request: BusinessProfileReviewsRequest,
): BusinessProfileReviewsPreview {
  if (
    !isReviewsPreview(value) ||
    !validateBase(value, request.connection_id, request.page_token) ||
    value.account_name !== request.account_name ||
    value.location_name !== request.location_name ||
    !Array.isArray(value.reviews)
  ) {
    throw new Error("Business Profile returned an invalid review page.");
  }
  return value;
}

export const googleBusinessProfileReviewService: BusinessProfileReviewService =
  {
    async previewAccounts(request, organizationId) {
      const response = await postGoogleBackend(
        accountsPath,
        request,
        "Unable to preview Business Profile accounts.",
        organizationId,
      );
      return validateAccountsPreview(await response.json(), request);
    },
    async previewLocations(request, organizationId) {
      const response = await postGoogleBackend(
        locationsPath,
        request,
        "Unable to preview Business Profile locations.",
        organizationId,
      );
      return validateLocationsPreview(await response.json(), request);
    },
    async previewReviews(request, organizationId) {
      const response = await postGoogleBackend(
        reviewsPath,
        request,
        "Unable to preview Business Profile reviews.",
        organizationId,
      );
      return validateReviewsPreview(await response.json(), request);
    },
  };
