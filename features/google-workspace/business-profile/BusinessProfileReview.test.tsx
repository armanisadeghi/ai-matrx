/** @jest-environment jsdom */
import { act, StrictMode } from "react";
import { createRoot, type Root } from "react-dom/client";
import {
  BusinessProfileReviewBody,
  type BusinessProfileReviewContext,
} from "./BusinessProfileReview";
import type {
  BusinessProfileAccountsPreview,
  BusinessProfileLocationsPreview,
  BusinessProfileReviewsPreview,
  BusinessProfileReviewService,
} from "./service";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
globalThis.IS_REACT_ACT_ENVIRONMENT = true;
jest.mock("@/features/google-workspace/GoogleAccountSelect", () => ({
  GoogleAccountSelect: ({
    connections,
    onConnectionChange,
  }: {
    connections: GoogleConnectionSummary[];
    onConnectionChange: (id: string) => void;
  }) => (
    <div>
      {connections.map((connection) => (
        <button
          key={connection.id}
          type="button"
          onClick={() => onConnectionChange(connection.id)}
        >
          Choose {connection.account_email}
        </button>
      ))}
    </div>
  ),
}));
const connection = (id = "connection-harbor"): GoogleConnectionSummary => ({
  id,
  owner_type: "user",
  owner_user_id: "actor-harbor",
  organization_id: null,
  provider: "google",
  provider_subject: id,
  account_email: `${id}@mail.invalid`,
  account_name: "Harbor Dental reviewer",
  scopes: [GOOGLE_SCOPE.businessManage],
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
});
const accounts = (
  pageToken: string | null = null,
): BusinessProfileAccountsPreview => ({
  connection_id: "connection-harbor",
  account_label: "Harbor Dental",
  accounts: [{ name: "accounts/harbor", accountName: "Harbor Dental" }],
  page_token: pageToken,
  next_page_token: "accounts-next",
  state: "incomplete",
});
const locations: BusinessProfileLocationsPreview = {
  connection_id: "connection-harbor",
  account_label: "Harbor Dental",
  account_name: "accounts/harbor",
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
  page_token: null,
  next_page_token: null,
  state: "terminal",
};
const reviews: BusinessProfileReviewsPreview = {
  connection_id: "connection-harbor",
  account_label: "Harbor Dental",
  account_name: "accounts/harbor",
  location_name: "locations/downtown",
  reviews: [
    {
      reviewId: "review-1",
      starRating: "FIVE",
      reviewer: { displayName: "Morgan Lee" },
      comment: "The check-in was kind and quick.",
      createTime: "2026-02-03T15:00:00Z",
      reviewReply: { comment: "Thank you for visiting." },
    },
  ],
  page_token: null,
  next_page_token: "reviews-next",
  state: "incomplete",
};
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function button(host: HTMLElement, text: string) {
  const found = Array.from(host.querySelectorAll("button")).find((item) =>
    item.textContent?.includes(text),
  ) as HTMLButtonElement | undefined;
  if (!found) throw new Error(`Missing ${text}`);
  return found;
}
function buttons(host: HTMLElement, text: string) {
  return Array.from(host.querySelectorAll("button")).filter((item) =>
    item.textContent?.includes(text),
  ) as HTMLButtonElement[];
}
function context(
  overrides: Partial<BusinessProfileReviewContext> = {},
): BusinessProfileReviewContext {
  return {
    organizationId: "org-harbor",
    actorId: "actor-harbor",
    connections: [connection()],
    ...overrides,
  };
}
describe("BusinessProfileReviewBody", () => {
  let root: Root;
  let host: HTMLDivElement;
  afterEach(() => {
    act(() => root.unmount());
    host.remove();
  });
  it("has an honest no-account state and cannot read before explicit selection", () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const service: BusinessProfileReviewService = {
      previewAccounts: jest.fn(),
      previewLocations: jest.fn(),
      previewReviews: jest.fn(),
    };
    act(() =>
      root.render(
        <BusinessProfileReviewBody
          context={context({ connections: [] })}
          service={service}
        />,
      ),
    );
    expect(host.textContent).toContain("No connected personal account");
    expect(button(host, "View accounts").disabled).toBe(true);
    expect(service.previewAccounts).not.toHaveBeenCalled();
  });
  it("discards an old account result after identity switch and retries the exact failed page", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const first = deferred<BusinessProfileAccountsPreview>();
    const service: BusinessProfileReviewService = {
      previewAccounts: jest
        .fn()
        .mockImplementationOnce(() => first.promise)
        .mockRejectedValueOnce(new Error("temporary outage"))
        .mockResolvedValueOnce(accounts("accounts-next")),
      previewLocations: jest.fn(async () => locations),
      previewReviews: jest.fn(async () => reviews),
    };
    act(() =>
      root.render(
        <StrictMode>
          <BusinessProfileReviewBody
            context={context({
              connections: [connection(), connection("connection-riverside")],
            })}
            service={service}
          />
        </StrictMode>,
      ),
    );
    act(() => button(host, "Choose connection-harbor").click());
    act(() => button(host, "View accounts").click());
    act(() => button(host, "Choose connection-riverside").click());
    await act(async () => {
      first.resolve(accounts());
      await first.promise;
    });
    expect(host.textContent).not.toContain("Harbor Dental");
    act(() => button(host, "View accounts").click());
    await act(async () => {});
    expect(host.textContent).toContain("temporary outage");
    act(() => button(host, "Retry this page").click());
    await act(async () => {});
    expect(service.previewAccounts).toHaveBeenLastCalledWith(
      { connection_id: "connection-riverside", page_token: null },
      "org-harbor",
    );
  });
  it("discards a pending account page after the organization context changes", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const pending = deferred<BusinessProfileAccountsPreview>();
    const service: BusinessProfileReviewService = {
      previewAccounts: jest.fn(() => pending.promise),
      previewLocations: jest.fn(),
      previewReviews: jest.fn(),
    };
    act(() =>
      root.render(
        <BusinessProfileReviewBody context={context()} service={service} />,
      ),
    );
    act(() => button(host, "Choose connection-harbor").click());
    act(() => button(host, "View accounts").click());
    act(() =>
      root.render(
        <BusinessProfileReviewBody
          context={context({ organizationId: "org-riverside" })}
          service={service}
        />,
      ),
    );

    await act(async () => {
      pending.resolve(accounts());
      await pending.promise;
    });

    expect(host.textContent).not.toContain("Accounts from Harbor Dental");
    expect(button(host, "View accounts").disabled).toBe(true);
  });
  it("discards a pending account page after the actor context changes", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const pending = deferred<BusinessProfileAccountsPreview>();
    const service: BusinessProfileReviewService = {
      previewAccounts: jest.fn(() => pending.promise),
      previewLocations: jest.fn(),
      previewReviews: jest.fn(),
    };
    act(() =>
      root.render(
        <BusinessProfileReviewBody context={context()} service={service} />,
      ),
    );
    act(() => button(host, "Choose connection-harbor").click());
    act(() => button(host, "View accounts").click());
    act(() =>
      root.render(
        <BusinessProfileReviewBody
          context={context({
            actorId: "actor-riverside",
            connections: [
              {
                ...connection(),
                owner_user_id: "actor-riverside",
              },
            ],
          })}
          service={service}
        />,
      ),
    );

    await act(async () => {
      pending.resolve(accounts());
      await pending.promise;
    });

    expect(host.textContent).not.toContain("Accounts from Harbor Dental");
    expect(button(host, "View accounts").disabled).toBe(true);
  });
  it("carries selected account and location through paginated review request", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const service: BusinessProfileReviewService = {
      previewAccounts: jest.fn(async () => accounts()),
      previewLocations: jest.fn(async () => locations),
      previewReviews: jest.fn(async () => reviews),
    };
    act(() =>
      root.render(
        <BusinessProfileReviewBody context={context()} service={service} />,
      ),
    );
    act(() => button(host, "Choose connection-harbor").click());
    await act(async () => {
      button(host, "View accounts").click();
    });
    await act(async () => {
      button(host, "Harbor Dental").click();
    });
    const mapsLink = host.querySelector(
      'a[aria-label="Open Harbor Dental Downtown in Google Maps"]',
    );
    expect(mapsLink?.getAttribute("href")).toBe(
      "https://www.google.com/maps/place/?q=place_id:harbor-dental-downtown",
    );
    expect(mapsLink?.closest("button")).toBeNull();
    expect(
      button(host, "Harbor Dental Downtown").querySelector("a"),
    ).toBeNull();
    await act(async () => {
      button(host, "Harbor Dental Downtown").click();
    });
    expect(service.previewReviews).toHaveBeenCalledWith(
      {
        connection_id: "connection-harbor",
        account_name: "accounts/harbor",
        location_name: "locations/downtown",
        page_token: null,
      },
      "org-harbor",
    );
    await act(async () => {
      const next = buttons(host, "Next page").at(-1);
      if (!next) throw new Error("Missing reviews next page");
      next.click();
    });
    expect(service.previewReviews).toHaveBeenLastCalledWith(
      {
        connection_id: "connection-harbor",
        account_name: "accounts/harbor",
        location_name: "locations/downtown",
        page_token: "reviews-next",
      },
      "org-harbor",
    );
    expect(host.textContent).toContain("Business reply");
  });
  it("does not synthesize Maps links when provider metadata is absent or null", async () => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
    const locationsWithoutMaps: BusinessProfileLocationsPreview = {
      ...locations,
      locations: [
        { name: "locations/north", title: "Harbor Dental North" },
        {
          name: "locations/south",
          title: "Harbor Dental South",
          metadata: null,
        },
        {
          name: "locations/east",
          title: "Harbor Dental East",
          metadata: { mapsUri: null },
        },
      ],
    };
    const service: BusinessProfileReviewService = {
      previewAccounts: jest.fn(async () => accounts()),
      previewLocations: jest.fn(async () => locationsWithoutMaps),
      previewReviews: jest.fn(async () => reviews),
    };
    act(() =>
      root.render(
        <BusinessProfileReviewBody context={context()} service={service} />,
      ),
    );
    act(() => button(host, "Choose connection-harbor").click());
    await act(async () => {
      button(host, "View accounts").click();
    });
    await act(async () => {
      button(host, "Harbor Dental").click();
    });
    expect(host.querySelector('a[aria-label$="in Google Maps"]')).toBeNull();
    expect(host.innerHTML).not.toContain("google.com/maps");
  });
});
