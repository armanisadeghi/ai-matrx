import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import {
  googleDirectoryReviewService,
  validateDirectoryPreview,
  type DirectoryPreview,
  type DirectoryReadRequest,
} from "./service";
import { eligibleDirectoryConnections } from "./DirectoryReview";

const postGoogleBackend = jest.fn();
jest.mock("@/features/marketing/google/service", () => ({
  postGoogleBackend: (...args: unknown[]) => postGoogleBackend(...args),
}));

const connection = (
  overrides: Partial<GoogleConnectionSummary> = {},
): GoogleConnectionSummary => ({
  id: "connection-harbor",
  owner_type: "user",
  owner_user_id: "reviewer-harbor",
  organization_id: null,
  provider: "google",
  provider_subject: "subject-harbor",
  account_email: "reviewer@mail.invalid",
  account_name: "Harbor Dental reviewer",
  scopes: [GOOGLE_SCOPE.directoryReadonly],
  status: "connected",
  last_verified_at: null,
  last_error: null,
  created_at: "2026-01-01T00:00:00Z",
  updated_at: "2026-01-01T00:00:00Z",
  metadata: {},
  credential_present: true,
  credential_stable: true,
  health: "connected",
  capability_health: {},
  ...overrides,
});

const preview = {
  status: "next_page_available",
  source: "google_workspace_directory",
  account_label: "Harbor Dental Workspace",
  next_page_available: true,
  unavailable_reason: null,
  people: [
    {
      resource_name: "people/harbor-operations",
      display_name: "Morgan Reyes",
      emails: ["morgan@harbordental.invalid"],
      organization_title: "Operations Director",
      organization_department: "Operations",
      manager: "Taylor Kim",
      source_types: ["DOMAIN_PROFILE", "DOMAIN_CONTACT"],
      account_label: "Harbor Dental Workspace",
    },
  ],
} satisfies DirectoryPreview;

describe("Google Directory provider boundary", () => {
  beforeEach(() => postGoogleBackend.mockReset());

  it("offers only the current actor's connected personal account with the exact Directory scope", () => {
    expect(
      eligibleDirectoryConnections(
        [
          connection(),
          connection({ id: "foreign", owner_user_id: "reviewer-riverside" }),
          connection({
            id: "organization",
            owner_type: "organization",
            owner_user_id: null,
            organization_id: "org-harbor",
          }),
          connection({ id: "missing-scope", scopes: ["openid"] }),
          connection({ id: "reauth", health: "needs_reauth" }),
        ],
        "reviewer-harbor",
      ).map((item) => item.id),
    ).toEqual(["connection-harbor"]);
  });

  it("sends the generated request unchanged with explicit organization context", async () => {
    postGoogleBackend.mockResolvedValue({ json: async () => preview });
    const request = {
      connection_id: "connection-harbor",
    } satisfies DirectoryReadRequest;

    await expect(
      googleDirectoryReviewService.preview(request, "org-harbor"),
    ).resolves.toEqual(preview);
    expect(postGoogleBackend).toHaveBeenCalledWith(
      "/google-integrations/directory/people/preview",
      request,
      "Unable to preview Google Directory people.",
      "org-harbor",
    );
  });

  it.each([
    [{ ...preview, source: "contacts" }, "invalid preview"],
    [{ ...preview, account_label: "" }, "invalid preview"],
    [{ ...preview, next_page_available: false }, "invalid page status"],
    [
      {
        ...preview,
        people: [{ ...preview.people[0], source_types: ["PROFILE"] }],
      },
      "invalid preview",
    ],
    [
      {
        ...preview,
        people: [{ ...preview.people[0], emails: [4] }],
      },
      "invalid preview",
    ],
    [
      {
        ...preview,
        status: "ready",
        next_page_available: true,
      },
      "invalid page status",
    ],
    [
      {
        ...preview,
        status: "workspace_directory_unavailable",
        unavailable_reason: "Directory disabled.",
      },
      "invalid page status",
    ],
    [
      {
        ...preview,
        people: [{ ...preview.people[0], account_label: "Other account" }],
      },
      "invalid page status",
    ],
    [
      {
        ...preview,
        people: [{ ...preview.people[0], source_types: [] }],
      },
      "invalid preview",
    ],
    [
      {
        ...preview,
        people: [
          { ...preview.people[0], resource_name: "contacts/harbor-operations" },
        ],
      },
      "invalid preview",
    ],
    [
      {
        ...preview,
        people: Array.from({ length: 51 }, (_, index) => ({
          ...preview.people[0],
          resource_name: `people/harbor-${index}`,
        })),
      },
      "invalid preview",
    ],
  ])("rejects malformed Directory wire data %#", (payload, message) => {
    expect(() => validateDirectoryPreview(payload)).toThrow(message);
  });

  it("accepts the neutral unavailable result without requiring people", () => {
    expect(
      validateDirectoryPreview({
        status: "workspace_directory_unavailable",
        source: "google_workspace_directory",
        account_label: "Personal Google account",
        next_page_available: false,
        unavailable_reason: "provider-specific-reason",
        people: [],
      }),
    ).toEqual({
      status: "workspace_directory_unavailable",
      source: "google_workspace_directory",
      account_label: "Personal Google account",
      next_page_available: false,
      unavailable_reason: "provider-specific-reason",
      people: [],
    });
  });
});
