/** @jest-environment jsdom */

import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import type { GoogleConnectionSummary } from "@/features/marketing/google/types";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { DirectoryReviewBody, type DirectoryReviewContext } from "./DirectoryReview";
import type {
  DirectoryPreview,
  DirectoryReviewService,
} from "./service";

(
  globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

Object.defineProperties(HTMLElement.prototype, {
  hasPointerCapture: { value: () => false, configurable: true },
  setPointerCapture: { value: () => undefined, configurable: true },
  releasePointerCapture: { value: () => undefined, configurable: true },
  scrollIntoView: { value: () => undefined, configurable: true },
});

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

const readyPreview = {
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

function context(
  overrides: Partial<DirectoryReviewContext> = {},
): DirectoryReviewContext {
  return {
    organizationId: "org-harbor",
    actorId: "reviewer-harbor",
    reviewerEligible: true,
    connections: [connection()],
    ...overrides,
  };
}

async function chooseAccount(host: HTMLElement, label = "Harbor Dental reviewer") {
  const trigger = host.querySelector<HTMLElement>("[role=combobox]");
  expect(trigger).not.toBeNull();
  await act(async () => {
    trigger?.focus();
    trigger?.dispatchEvent(
      new KeyboardEvent("keydown", { bubbles: true, key: "ArrowDown" }),
    );
  });
  const option = [...document.querySelectorAll<HTMLElement>("[role=option]")].find(
    (item) => item.textContent?.includes(label),
  );
  expect(option).not.toBeNull();
  await act(async () => option?.click());
}

function button(host: HTMLElement, label: string): HTMLButtonElement {
  const match = [...host.querySelectorAll("button")].find((item) =>
    item.textContent?.includes(label),
  );
  if (!(match instanceof HTMLButtonElement)) {
    throw new Error(`Button not found: ${label}`);
  }
  return match;
}

describe("DirectoryReviewBody", () => {
  let host: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    host = document.createElement("div");
    document.body.append(host);
    root = createRoot(host);
  });

  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = "";
  });

  it("renders no reviewer controls when the internal-test identity is refused", () => {
    act(() =>
      root.render(
        <DirectoryReviewBody
          context={context({ reviewerEligible: false })}
          service={{ preview: jest.fn() }}
        />,
      ),
    );
    expect(host.textContent).toBe("");
    expect(host.querySelector("button")).toBeNull();
  });

  it("shows a neutral unavailable state when no exact personal grant is eligible", () => {
    act(() =>
      root.render(
        <DirectoryReviewBody
          context={context({
            connections: [connection({ scopes: ["openid"] })],
          })}
          service={{ preview: jest.fn() }}
        />,
      ),
    );
    expect(host.textContent).toContain("Directory preview unavailable");
    expect(host.textContent).toContain(
      "No personal Google account has Directory access.",
    );
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("shows literal directory fields, account provenance, and the first-page limit", async () => {
    const service: DirectoryReviewService = {
      preview: jest.fn(async () => readyPreview),
    };
    act(() =>
      root.render(
        <DirectoryReviewBody context={context()} service={service} />,
      ),
    );
    await chooseAccount(host);
    await act(async () => button(host, "Preview directory").click());

    expect(host.textContent).toContain("Morgan Reyes");
    expect(host.textContent).toContain("morgan@harbordental.invalid");
    expect(host.textContent).toContain("Operations Director");
    expect(host.textContent).toContain("Operations");
    expect(host.textContent).toContain("Taylor Kim");
    expect(host.textContent).toContain(
      "Workspace profile, Workspace contact",
    );
    expect(host.textContent).not.toContain("DOMAIN_PROFILE");
    expect(host.textContent).toContain("Harbor Dental Workspace");
    expect(host.textContent).toContain("First 50");
    expect(host.textContent).toContain("More people available");
  });

  it("retries only the exact failed request and keeps stale people cleared", async () => {
    const preview = jest
      .fn<ReturnType<DirectoryReviewService["preview"]>, Parameters<DirectoryReviewService["preview"]>>()
      .mockRejectedValueOnce(new Error("Directory request refused."))
      .mockResolvedValueOnce(readyPreview);
    act(() =>
      root.render(
        <DirectoryReviewBody context={context()} service={{ preview }} />,
      ),
    );
    await chooseAccount(host);
    await act(async () => button(host, "Preview directory").click());
    expect(host.textContent).toContain("Directory request refused.");
    expect(host.textContent).not.toContain("Morgan Reyes");
    await act(async () => button(host, "Try again").click());
    expect(preview.mock.calls).toEqual([
      [{ connection_id: "connection-harbor" }, "org-harbor"],
      [{ connection_id: "connection-harbor" }, "org-harbor"],
    ]);
    expect(host.textContent).toContain("Morgan Reyes");
  });

  it("clears fetched people when the organization or eligibility changes", async () => {
    const service: DirectoryReviewService = {
      preview: jest.fn(async () => readyPreview),
    };
    act(() =>
      root.render(
        <DirectoryReviewBody context={context()} service={service} />,
      ),
    );
    await chooseAccount(host);
    await act(async () => button(host, "Preview directory").click());
    expect(host.textContent).toContain("Morgan Reyes");

    act(() =>
      root.render(
        <DirectoryReviewBody
          context={context({ organizationId: "org-riverside" })}
          service={service}
        />,
      ),
    );
    expect(host.textContent).not.toContain("Morgan Reyes");
    expect(button(host, "Preview directory").disabled).toBe(true);

    await chooseAccount(host);
    await act(async () => button(host, "Preview directory").click());
    expect(host.textContent).toContain("Morgan Reyes");

    act(() =>
      root.render(
        <DirectoryReviewBody
          context={context({
            organizationId: "org-riverside",
            connections: [
              connection({ account_name: "Riverside Dental reviewer" }),
            ],
          })}
          service={service}
        />,
      ),
    );
    expect(host.textContent).not.toContain("Morgan Reyes");
    expect(button(host, "Preview directory").disabled).toBe(true);

    act(() =>
      root.render(
        <DirectoryReviewBody
          context={context({ reviewerEligible: false })}
          service={service}
        />,
      ),
    );
    expect(host.textContent).toBe("");
  });

  it("renders provider unavailability as neutral state without raw reason text", async () => {
    const unavailablePreview = {
      status: "workspace_directory_unavailable",
      source: "google_workspace_directory",
      account_label: "Personal Google account",
      next_page_available: false,
      unavailable_reason: "provider-internal-reason",
      people: [],
    } satisfies DirectoryPreview;
    const service: DirectoryReviewService = {
      preview: jest.fn(async () => unavailablePreview),
    };
    act(() =>
      root.render(
        <DirectoryReviewBody context={context()} service={service} />,
      ),
    );
    await chooseAccount(host);
    await act(async () => button(host, "Preview directory").click());
    expect(host.textContent).toContain("Workspace Directory unavailable");
    expect(host.textContent).toContain("Personal Google account");
    expect(host.textContent).not.toContain("provider-internal-reason");
    expect(host.querySelector('[role="alert"]')).toBeNull();
  });

  it("clears fetched people when the selected Google account changes", async () => {
    const service: DirectoryReviewService = {
      preview: jest.fn(async () => readyPreview),
    };
    act(() =>
      root.render(
        <DirectoryReviewBody
          context={context({
            connections: [
              connection(),
              connection({
                id: "connection-riverside",
                provider_subject: "subject-riverside",
                account_name: "Riverside Dental reviewer",
                account_email: "riverside@mail.invalid",
              }),
            ],
          })}
          service={service}
        />,
      ),
    );
    await chooseAccount(host);
    await act(async () => button(host, "Preview directory").click());
    expect(host.textContent).toContain("Morgan Reyes");

    await chooseAccount(host, "Riverside Dental reviewer");
    expect(host.textContent).not.toContain("Morgan Reyes");
    expect(button(host, "Preview directory").disabled).toBe(false);
  });
});
