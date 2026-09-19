/**
 * FORCING TEST — A READ THAT FAILED IS NOT A READ THAT CAME BACK EMPTY.
 *
 * F-113 (`/projects/google-native/VERIFY-R10-FIX-WAVE.md` NEW-1 and NEW-2,
 * seat-proven on a live screen 2026-09-18). With the server refusing the read
 * (409 `several_google_accounts`) the contacts panel printed, at once:
 *
 *   "2 connected Google accounts can read Contacts: …. Re-run with
 *    google_account set to the one you mean."
 *   "Still looking for the contact this link named…"
 *   "This Google account has no contacts we can read."
 *
 * Nothing was looking, nothing was read, and "this Google account" was said
 * while the server had just named two — with the only control on the panel,
 * Refresh, re-running the identical failing request.
 *
 * These tests fail on the bytes before `read-failure.ts`: each of the three
 * sentences is asserted absent, the person's remedy is asserted present as a
 * PRESSABLE account, and the Tasks sibling is held to the same law.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BackendApiError } from "@/lib/api/errors";
import {
  SEVERAL_ACCOUNTS_SENTENCE,
  SEVERAL_ACCOUNTS_UNNAMED_SENTENCE,
  googleAccountsNamedIn,
  readGoogleImportFailure,
} from "./read-failure";

const mockImport = jest.fn();
const mockSearch = jest.fn();
const mockFields = jest.fn();
const mockTaskList = jest.fn();
const mockTaskImport = jest.fn();

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
  listGoogleTasks: (...args: unknown[]) => mockTaskList(...args),
  importGoogleTasks: (...args: unknown[]) => mockTaskImport(...args),
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

/* eslint-disable import/first -- after the mocks above */
import { GoogleContactsImportPanel } from "./GoogleContactsImportPanel";
import { GoogleTasksImportPanel } from "./GoogleTasksImportPanel";
/* eslint-enable import/first */

/** The live 409 the verifier met, byte for byte from aidream's own wording. */
const AMBIGUOUS = () =>
  new BackendApiError({
    code: "several_google_accounts",
    detail:
      "2 connected Google accounts can read Contacts: arman@armansadeghi.com, titanium-succes-4898@pages.plusgoogle.com. Re-run with google_account set to the one you mean.",
    userMessage:
      "2 connected Google accounts can read Contacts: arman@armansadeghi.com, titanium-succes-4898@pages.plusgoogle.com. Re-run with google_account set to the one you mean.",
    details: { remedy: "name_the_google_account" },
    status: 409,
  });

describe("the accounts the server named are read from its own sentence", () => {
  it("finds both accounts in the live 409 wording", () => {
    expect(
      googleAccountsNamedIn(
        "2 connected Google accounts can read Contacts: arman@armansadeghi.com, titanium-succes-4898@pages.plusgoogle.com. Re-run with google_account set to the one you mean.",
      ),
    ).toEqual([
      "arman@armansadeghi.com",
      "titanium-succes-4898@pages.plusgoogle.com",
    ]);
  });

  it("degrades to the honest sentence when the wording names none", () => {
    const failure = readGoogleImportFailure(
      new BackendApiError({
        code: "several_google_accounts",
        detail: "Several connected Google accounts can read Contacts.",
        userMessage: "Several connected Google accounts can read Contacts.",
        status: 409,
      }),
    );
    expect(failure.kind).toBe("several_accounts");
    expect(failure.sentence).toBe(SEVERAL_ACCOUNTS_UNNAMED_SENTENCE);
    expect(failure.kind === "several_accounts" && failure.accounts).toEqual([]);
  });

  it("keeps any other refusal as the server's own sentence", () => {
    const failure = readGoogleImportFailure(
      new BackendApiError({
        code: "internal_error",
        detail: "boom",
        userMessage: "Google could not be reached just now.",
        status: 502,
      }),
    );
    expect(failure).toEqual({
      kind: "failed",
      sentence: "Google could not be reached just now.",
    });
  });
});

describe("a failed Google read never speaks as an empty one", () => {
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
    mockTaskList.mockReset();
    mockTaskImport.mockReset();
  });

  async function settle(times = 10) {
    for (let attempt = 0; attempt < times; attempt += 1) {
      await act(async () => {
        await new Promise((resolve) => setTimeout(resolve, 0));
      });
    }
  }

  function findButton(label: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((candidate) =>
      (candidate.textContent ?? "").includes(label),
    );
    if (!button) throw new Error(`no button matching ${label}`);
    return button as HTMLButtonElement;
  }

  const ADA = {
    external_id: "people/1",
    display_name: "Ada Lovelace",
    first_name: "Ada",
    last_name: "Lovelace",
    job_title: "Head of Data",
    company: "Example Ltd",
    emails: ["ada@example.com"],
    phones: [],
    source_updated_at: null,
    already_imported: false,
    person_id: null,
    person_name: null,
    imported_at: null,
  };

  it("CONTACTS: the 409 becomes a choice of account, not three contradicting sentences (F-113 NEW-1/NEW-2)", async () => {
    mockSearch.mockImplementation(
      async (args: { googleAccount?: string | null }) => {
        if (!args.googleAccount) throw AMBIGUOUS();
        return {
          provider_key: "google_contacts",
          google_account: args.googleAccount,
          contacts: [ADA],
          count: 1,
          total_read: 1,
          already_imported: 0,
          truncated: false,
          warnings: [],
        };
      },
    );

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel
          organizationId="org-1"
          initialExternalId="people/does-not-exist"
        />,
      );
    });
    await settle();

    let text = container.textContent ?? "";

    // 🚨 THE THREE SENTENCES THAT CANNOT ALL BE TRUE.
    expect(text).not.toContain("Still looking for the contact this link named");
    expect(text).not.toContain("This Google account has no contacts we can read.");
    // The machine instruction never reaches a person.
    expect(text).not.toContain("Re-run with");
    expect(text).not.toContain("google_account");

    // The honest posture, and the remedy AS A CONTROL.
    expect(text).toContain(SEVERAL_ACCOUNTS_SENTENCE);
    const choice = findButton("arman@armansadeghi.com");
    expect(findButton("titanium-succes-4898@pages.plusgoogle.com")).toBeTruthy();

    // Refresh cannot silently re-run the same failing request.
    expect(findButton("Refresh").disabled).toBe(true);

    // Pressing an account re-runs the read against it.
    await act(async () => {
      choice.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    await settle();

    expect(mockSearch).toHaveBeenLastCalledWith(
      expect.objectContaining({ googleAccount: "arman@armansadeghi.com" }),
    );
    text = container.textContent ?? "";
    expect(text).toContain("Ada Lovelace");
    expect(text).not.toContain(SEVERAL_ACCOUNTS_SENTENCE);
    expect(findButton("Refresh").disabled).toBe(false);
  });

  it("CONTACTS: any other failed read says the server's sentence and offers the press", async () => {
    mockSearch.mockRejectedValue(
      new BackendApiError({
        code: "internal_error",
        detail: "boom",
        userMessage: "Google could not be reached just now.",
        status: 502,
      }),
    );

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
    expect(text).toContain("Google could not be reached just now.");
    expect(text).not.toContain("This Google account has no contacts we can read.");
    expect(text).not.toContain("Still looking for the contact this link named");

    // The press really re-runs the read.
    const before = mockSearch.mock.calls.length;
    await act(async () => {
      findButton("Try again").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await settle();
    expect(mockSearch.mock.calls.length).toBeGreaterThan(before);
  });

  it("TASKS: the sibling panel obeys the same law (the census of this class)", async () => {
    mockTaskList.mockImplementation(
      async (args: { googleAccount?: string | null }) => {
        if (!args.googleAccount) throw AMBIGUOUS();
        return {
          google_account: args.googleAccount,
          task_lists: [
            {
              task_list_id: "list-1",
              title: "My Tasks",
              tasks: [
                {
                  task_id: "t1",
                  title: "Write the brief",
                  notes: null,
                  due_at: null,
                  status: "needsAction",
                  completed_at: null,
                  source_updated_at: null,
                  already_imported: false,
                  matrx_task_id: null,
                  imported_at: null,
                  changes: [],
                  kept_local: [],
                },
              ],
              total: 1,
              already_imported: 0,
              importable: 1,
              has_more: false,
              count_line: "1 task in My Tasks",
            },
          ],
          total: 1,
          already_imported: 0,
          importable: 1,
          warnings: [],
        };
      },
    );

    await act(async () => {
      root.render(<GoogleTasksImportPanel organizationId="org-1" />);
    });
    await settle();

    let text = container.textContent ?? "";
    // 🚨 THE SAME CLASS: nothing was read, so neither empty sentence may show.
    expect(text).not.toContain("This Google account has no task lists we can read.");
    expect(text).not.toContain("This list has no tasks.");
    expect(text).not.toContain("Re-run with");
    expect(text).toContain(SEVERAL_ACCOUNTS_SENTENCE);
    expect(findButton("Refresh").disabled).toBe(true);
    // Absent or honest, never dead: no Select/Import controls over a list
    // nobody read.
    expect(text).not.toContain("Select the 0 not here yet");
    expect(text).not.toContain("Import 0");

    await act(async () => {
      findButton("arman@armansadeghi.com").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await settle();

    expect(mockTaskList).toHaveBeenLastCalledWith(
      expect.objectContaining({ googleAccount: "arman@armansadeghi.com" }),
    );
    text = container.textContent ?? "";
    expect(text).toContain("Write the brief");
    expect(text).not.toContain(SEVERAL_ACCOUNTS_SENTENCE);
  });
});
