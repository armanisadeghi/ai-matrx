/**
 * FORCING TEST — A SELECTION CAN ONLY CONTAIN IDS THE CURRENT READ RETURNED.
 *
 * V-24 (hostile verifier, `/projects/google-native/VERIFY-R9-FIX-WAVE.md`):
 * opening `?panels=google_contacts_import:<bogus externalId>:o-<org>` rendered
 * "This Google account has no contacts we can read. 1 selected  Review the
 * field map" — the panel said it found nothing AND pre-selected one contact
 * and offered a field map for it.
 *
 * Root cause: `selected` starts from the window address's `initialExternalId`
 * before any read has happened, and was never reconciled against what the
 * read actually returned. A stale link, a contact removed from Google, or an
 * id outside this read's page left a phantom id in `selected` forever.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

const mockImport = jest.fn();
const mockSearch = jest.fn();
const mockFields = jest.fn();

// The organization gate the surface reads (VERIFY-R7-FIX-WAVE NEW-1) — the
// same stand-in `override-and-refusal.test.tsx` uses for this exact panel.
jest.mock("@/features/organizations/useOrganizationRequired", () => ({
  useOrganizationRequired: () => ({
    organizationId: "11111111-2222-3333-4444-555555555555",
    canLoad: true,
    organizationRequired: false,
    resolving: false,
    organizationState: "ready",
  }),
}));

jest.mock("./service", () => ({
  importGoogleContacts: (...args: unknown[]) => mockImport(...args),
  searchGoogleContacts: (...args: unknown[]) => mockSearch(...args),
  fetchContactFieldSpecs: (...args: unknown[]) => mockFields(...args),
}));
jest.mock("@/lib/toast", () => ({
  toast: {
    success: jest.fn(),
    error: jest.fn(),
    warning: jest.fn(),
    info: jest.fn(),
  },
}));
jest.mock("next/link", () => ({
  __esModule: true,
  default: ({ children }: { children: React.ReactNode }) => <a>{children}</a>,
}));

// eslint-disable-next-line import/first -- after the mocks above
import { GoogleContactsImportPanel } from "./GoogleContactsImportPanel";

describe("the address's externalId is reconciled against what the read returns", () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeAll(() => {
    (
      globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
    ).IS_REACT_ACT_ENVIRONMENT = true;
  });

  beforeEach(() => {
    container = document.createElement("div");
    document.body.appendChild(container);
    root = createRoot(container);
    mockFields.mockResolvedValue([]);
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockImport.mockReset();
    mockSearch.mockReset();
    mockFields.mockReset();
  });

  async function settle(times = 10) {
    for (let attempt = 0; attempt < times; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  it("a bogus externalId in the address never leaves a phantom selection over an empty read", async () => {
    mockSearch.mockResolvedValue({
      provider_key: "google_contacts",
      google_account: "me@example.com",
      contacts: [],
      count: 0,
      total_read: 0,
      already_imported: 0,
      truncated: false,
      warnings: [],
    });

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel
          organizationId="org-1"
          initialExternalId="people/does-not-exist"
        />,
      );
    });
    await settle();

    const text = container.textContent ?? "";

    // The empty-read sentence still tells the truth about the account.
    expect(text).toContain("This Google account has no contacts we can read.");

    // 🚨 THE DEFECT: a phantom selection over a list the read says is empty,
    // and a "Review the field map" a person could click into for a contact
    // that does not exist.
    expect(text).not.toContain("1 selected");
    expect(text).toContain("0 selected");

    const reviewButton = [...container.querySelectorAll("button")].find(
      (candidate) => (candidate.textContent ?? "").includes("Review the field map"),
    );
    expect(reviewButton).toBeTruthy();
    expect((reviewButton as HTMLButtonElement).disabled).toBe(true);

    // And the reason is said BY NAME — not silently folded into "no contacts".
    expect(text).toContain(
      "The contact this link named is not in this account's readable contacts.",
    );
  });

  it("an externalId the read DOES return stays selected, with no false warning", async () => {
    mockSearch.mockResolvedValue({
      provider_key: "google_contacts",
      google_account: "me@example.com",
      contacts: [
        {
          external_id: "people/1",
          resource_name: "people/1",
          display_name: "Ada Lovelace",
          given_name: "Ada",
          family_name: "Lovelace",
          job_title: "Head of Data",
          company: "Example Ltd",
          emails: ["ada@example.com"],
          phones: [],
          source_updated_at: null,
          already_imported: true,
          person_id: "p1",
          person_name: "Ada Lovelace",
          imported_at: "2026-09-16T00:00:00Z",
        },
      ],
      count: 1,
      total_read: 1,
      already_imported: 1,
      truncated: false,
      warnings: [],
    });

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel
          organizationId="org-1"
          initialExternalId="people/1"
        />,
      );
    });
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain("1 selected");
    expect(text).not.toContain(
      "The contact this link named is not in this account's readable contacts.",
    );

    const reviewButton = [...container.querySelectorAll("button")].find(
      (candidate) => (candidate.textContent ?? "").includes("Review the field map"),
    );
    expect((reviewButton as HTMLButtonElement).disabled).toBe(false);
  });
});
