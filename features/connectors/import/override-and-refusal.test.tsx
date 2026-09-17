/**
 * FORCING TESTS — A TICK IS AN INSTRUCTION, AND A REFUSED WRITE IS NEVER SILENT.
 *
 * aidream lane B-10 (2026-09-17, `/projects/google-native/VERIFY-B1-B2-R2.md` N1
 * and BREAK K) closed two halves of one story on the server:
 *
 * 1. **The apply now honours an explicit "take Google's value here"** — the new
 *    `ContactFieldChoice.override_manual`. Before it, `_explicit_choice` was
 *    `include && value is not None`, so this panel's tick on a `kept_manual` row
 *    was SENT AND SILENTLY DISCARDED while the row said, in words, *"will replace
 *    yours"*. The panel sends `value: null` for a row nobody retyped, which is
 *    exactly the shape that was ignored.
 * 2. **A field locked between the review and the save is REFUSED by name** —
 *    `ContactImportOutcome.refused_fields`, with the remedy. A promise the review
 *    made and the row would not keep must reach the person's screen; the outcome
 *    card said only "Enriched".
 *
 * So the choice is built in ONE place (`./contract.ts` → `contactFieldChoice`) and
 * the outcome card states every refusal by FIELD LABEL with what to do about it.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import type {
  ContactFieldPlanPending,
  ContactImportOutcomePending,
} from "./types";

const mockImport = jest.fn();
const mockSearch = jest.fn();
const mockFields = jest.fn();

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
import { contactFieldChoice, decideContactField } from "./contract";
// eslint-disable-next-line import/first -- after the mocks above
import { GoogleContactsImportPanel } from "./GoogleContactsImportPanel";

const KEPT_MANUAL: ContactFieldPlanPending = {
  key: "job_title",
  label: "Job title",
  person_field: "job_title",
  person_label: "Job title",
  value: "Head of Data",
  current_value: "Director of Data",
  action: "kept_manual",
  current_state: "manual",
  explanation:
    "This Person says “Director of Data” and somebody set that here, so the " +
    "import leaves it alone.",
  source_ref: null,
  imported_at: null,
};

const FILL: ContactFieldPlanPending = {
  ...KEPT_MANUAL,
  key: "company",
  label: "Company",
  person_field: "company",
  person_label: "Company",
  value: "Example Ltd",
  current_value: null,
  action: "fill",
  current_state: "empty",
  explanation: "Nothing is recorded here, so the import writes Google's value.",
};

describe("the wire choice is built in one place", () => {
  it("a ticked `kept_manual` row carries `override_manual` — the tick IS the instruction", () => {
    expect(
      contactFieldChoice(KEPT_MANUAL, { include: true, value: null }),
    ).toEqual({ key: "job_title", include: true, value: null, override_manual: true });
  });

  it("a typed value counts as explicit too, and still says so out loud", () => {
    expect(
      contactFieldChoice(KEPT_MANUAL, { include: true, value: "VP of Data" }),
    ).toEqual({
      key: "job_title",
      include: true,
      value: "VP of Data",
      override_manual: true,
    });
  });

  it("an UNTICKED row overrides nothing — the default keeps what the Person says", () => {
    expect(
      contactFieldChoice(KEPT_MANUAL, { include: false, value: null }),
    ).toEqual({ key: "job_title", include: false, value: null });
  });

  it("an ordinary row never claims an override it was not given", () => {
    expect(contactFieldChoice(FILL, { include: true, value: null })).toEqual({
      key: "company",
      include: true,
      value: null,
    });
    // And the panel's own default for such a row is ticked, as before.
    expect(decideContactField(FILL).includeByDefault).toBe(true);
  });
});

/** The panel, driven for real: search → review → tick → save. */
describe("the panel sends what the row promised", () => {
  let container: HTMLDivElement;
  let root: Root;

  const outcome = (
    over: Partial<ContactImportOutcomePending> = {},
  ): ContactImportOutcomePending => ({
    external_id: "people/1",
    display_name: "Ada Lovelace",
    person_id: "p1",
    person_name: "Ada Lovelace",
    created: false,
    matched_by: "email",
    fields: [KEPT_MANUAL, FILL],
    written_fields: [],
    kept_manual_fields: ["job_title"],
    contact_points_added: 0,
    note: "Enriched from Google Contacts.",
    ...over,
  });

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
  });

  afterEach(() => {
    act(() => root.unmount());
    container.remove();
    mockImport.mockReset();
    mockSearch.mockReset();
    mockFields.mockReset();
  });

  async function settle(times = 25) {
    for (let attempt = 0; attempt < times; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  function click(label: string) {
    const button = [...container.querySelectorAll("button")].find((candidate) =>
      (candidate.textContent ?? "").includes(label),
    );
    if (!button) throw new Error(`no button matching ${label}`);
    act(() => {
      button.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  /** The review's own checkbox for one field row, found by its aria-label. */
  function tick(match: string) {
    const box = [...container.querySelectorAll("button,input")].find((element) =>
      (element.getAttribute("aria-label") ?? "").includes(match),
    );
    if (!box) throw new Error(`no checkbox matching ${match}`);
    act(() => {
      box.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
  }

  async function review() {
    await act(async () => {
      root.render(
        <GoogleContactsImportPanel
          organizationId="org-1"
          initialExternalId="people/1"
        />,
      );
    });
    mockImport.mockResolvedValue({
      provider_key: "google_contacts",
      google_account: "me@example.com",
      dry_run: true,
      results: [outcome()],
      warnings: [],
    });
    await settle();
    // The person's own step: the preselected contact, then the field map.
    click("Review the field map");
    await settle();
  }

  it("a ticked locked field goes to the server as an explicit override", async () => {
    await review();
    expect(container.textContent).toContain("Job title");
    mockImport.mockClear();
    tick("Take Google's");
    mockImport.mockResolvedValue({
      provider_key: "google_contacts",
      google_account: "me@example.com",
      dry_run: false,
      results: [outcome({ written_fields: ["job_title"] })],
      warnings: [],
    });
    click("Save");
    await settle();

    const sent = mockImport.mock.calls.at(-1)?.[0] as {
      dryRun: boolean;
      contacts: {
        externalId: string;
        fields?: { key: string; include: boolean; override_manual?: boolean }[];
      }[];
    };
    expect(sent.dryRun).toBe(false);
    const job = sent.contacts[0]?.fields?.find(
      (field) => field.key === "job_title",
    );
    // 🚨 Without this the tick was sent, ignored, and the row's "will replace
    // yours" was a promise nothing kept.
    expect(job).toMatchObject({ include: true, override_manual: true });
  });

  it("a field the row REFUSED is named on the outcome, with the remedy", async () => {
    await review();
    mockImport.mockResolvedValue({
      provider_key: "google_contacts",
      google_account: "me@example.com",
      dry_run: false,
      results: [
        outcome({
          written_fields: ["company"],
          refused_fields: ["job_title"],
        }),
      ],
      warnings: [
        "Job title on Ada Lovelace is locked, so the import left it as it is — " +
          "even though the review offered to write it. Unlock the field on the " +
          "Person and import again.",
      ],
    });
    click("Save");
    await settle();

    const text = container.textContent ?? "";
    // The FIELD LABEL, never the column name, and the remedy with it.
    expect(text).toContain("Job title");
    expect(text).not.toContain("job_title");
    expect(text.toLowerCase()).toContain("locked");
    expect(text).toContain("Unlock the field on the Person and import again");
  });

  it("an ordinary save says nothing about refusals", async () => {
    await review();
    mockImport.mockResolvedValue({
      provider_key: "google_contacts",
      google_account: "me@example.com",
      dry_run: false,
      results: [outcome({ written_fields: ["company"] })],
      warnings: [],
    });
    click("Save");
    await settle();
    expect((container.textContent ?? "").toLowerCase()).not.toContain("locked");
  });
});
