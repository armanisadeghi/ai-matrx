import type { components } from "@ai-matrx/agents/generated/api-types";

import { postGoogleBackend } from "@/features/marketing/google/service";

export type DirectoryReadRequest =
  components["schemas"]["DirectoryReadRequest"];
export type DirectoryPreview = components["schemas"]["DirectoryPreview"];
export type DirectoryPersonPreview =
  components["schemas"]["DirectoryPersonPreview"];

export interface DirectoryReviewService {
  preview(
    request: DirectoryReadRequest,
    organizationId: string,
  ): Promise<DirectoryPreview>;
}

const DIRECTORY_PREVIEW_PATH =
  "/google-integrations/directory/people/preview";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isOptionalText(value: unknown): value is string | null | undefined {
  return value === undefined || value === null || typeof value === "string";
}

function isSourceType(
  value: unknown,
): value is DirectoryPersonPreview["source_types"][number] {
  return value === "DOMAIN_CONTACT" || value === "DOMAIN_PROFILE";
}

function isPerson(value: unknown): value is DirectoryPersonPreview {
  return (
    isRecord(value) &&
    typeof value.resource_name === "string" &&
    /^people\/[^/]+$/.test(value.resource_name) &&
    isOptionalText(value.display_name) &&
    (value.emails === undefined ||
      (Array.isArray(value.emails) &&
        value.emails.every((email) => typeof email === "string"))) &&
    isOptionalText(value.organization_title) &&
    isOptionalText(value.organization_department) &&
    isOptionalText(value.manager) &&
    Array.isArray(value.source_types) &&
    value.source_types.length > 0 &&
    value.source_types.every(isSourceType) &&
    typeof value.account_label === "string" &&
    value.account_label.length > 0
  );
}

/** Refuse malformed provider data before it reaches the reviewer table. */
export function validateDirectoryPreview(value: unknown): DirectoryPreview {
  if (
    !isRecord(value) ||
    (value.status !== "ready" &&
      value.status !== "next_page_available" &&
      value.status !== "workspace_directory_unavailable") ||
    value.source !== "google_workspace_directory" ||
    typeof value.account_label !== "string" ||
    value.account_label.length === 0 ||
    typeof value.next_page_available !== "boolean" ||
    !isOptionalText(value.unavailable_reason) ||
    !Array.isArray(value.people) ||
    value.people.length > 50 ||
    !value.people.every(isPerson)
  ) {
    throw new Error("Google Directory returned an invalid preview.");
  }
  const unavailable = value.status === "workspace_directory_unavailable";
  const hasNext = value.status === "next_page_available";
  if (
    value.next_page_available !== hasNext ||
    (unavailable &&
      (value.people.length !== 0 ||
        typeof value.unavailable_reason !== "string" ||
        value.unavailable_reason.trim().length === 0)) ||
    (!unavailable && value.unavailable_reason != null) ||
    value.people.some((person) => person.account_label !== value.account_label)
  ) {
    throw new Error("Google Directory returned an invalid page status.");
  }
  return {
    status: value.status,
    people: value.people,
    source: value.source,
    account_label: value.account_label,
    next_page_available: value.next_page_available,
    unavailable_reason: value.unavailable_reason ?? null,
  };
}

export const googleDirectoryReviewService: DirectoryReviewService = {
  async preview(request, organizationId) {
    const response = await postGoogleBackend(
      DIRECTORY_PREVIEW_PATH,
      request,
      "Unable to preview Google Directory people.",
      organizationId,
    );
    return validateDirectoryPreview(await response.json());
  },
};
