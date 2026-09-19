/**
 * FORCING TEST — THE INVARIANT: A SELECTION HOLDS ONLY IDS A READ HAS
 * RETURNED; AN ADDRESS NAMES A REQUEST, NEVER A SELECTION.
 *
 * V-24 (hostile verifier, `/projects/google-native/VERIFY-R9-FIX-WAVE.md`):
 * opening `?panels=google_contacts_import:<bogus externalId>:o-<org>` rendered
 * "This Google account has no contacts we can read. 1 selected  Review the
 * field map" — the panel said it found nothing AND pre-selected one contact
 * and offered a field map for it.
 *
 * Three rounds of Bugbot findings on this file's fix turned out to be THREE
 * INSTANCES OF ONE ROOT DEFECT: the address's `initialExternalId` was seeded
 * directly into `selected` before any read had proven it existed, and every
 * later patch (`75fd614c` reconciling against the latest page, `8e612aa2`'s
 * `seenIds` union) still let that provisional id leak through a hole a read
 * could not close — a typed query's narrower page (a), a truncated first
 * page (b), the "not in this account" banner firing off either (c), a
 * keystroke aborting the ONE read that proves absence before it resolved
 * (review 5247049760 comment 4046121991), and an organization change that
 * reset `seenIds`/`unfilteredSearch` but not `selected` itself (comment
 * 4046121996).
 *
 * The class fix (`contactSelectionReducer` in the panel): the address id
 * never enters `selected` directly — it is held as `requestedExternalId`
 * until the FIRST read that returns it promotes it, exactly once. `selected`,
 * `seenIds`, `unfilteredSearch` and `requestedExternalId` are one
 * `useReducer`, reset together on an organization change, so there is no
 * field left half-reset. Two independent abort controllers (unfiltered vs.
 * typed) mean a keystroke narrows the visible list without ever cancelling
 * the one read that can prove the address's contact does not exist.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import { BackendApiError } from "@/lib/api/errors";

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

  /** Types into the search box and lets the 250ms debounce fire for real. */
  async function typeQuery(text: string) {
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    // Past the panel's 250ms keystroke debounce, with real timers.
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await settle();
  }

  const ADA = {
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
  };

  it("a typed query whose page omits the id never drops a real selection (Bugbot 4046052473 a)", async () => {
    mockSearch.mockImplementation(
      async (args: { query?: string | null }) =>
        args.query
          ? {
              provider_key: "google_contacts",
              google_account: "me@example.com",
              contacts: [], // the narrowed page has nothing — proves nothing about Ada
              count: 0,
              total_read: 0,
              already_imported: 0,
              truncated: false,
              warnings: [],
            }
          : {
              provider_key: "google_contacts",
              google_account: "me@example.com",
              contacts: [ADA],
              count: 1,
              total_read: 1,
              already_imported: 1,
              truncated: false,
              warnings: [],
            },
    );

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel organizationId="org-1" initialExternalId="people/1" />,
      );
    });
    await settle();
    expect(container.textContent ?? "").toContain("1 selected");

    await typeQuery("zzz-no-match");

    const text = container.textContent ?? "";
    // 🚨 THE DEFECT: the old fix reconciled against the LATEST page (the
    // typed-query miss), which dropped the real, already-confirmed contact.
    expect(text).toContain("1 selected");
    expect(text).not.toContain(
      "The contact this link named is not in this account's readable contacts.",
    );
  });

  it("a TRUNCATED unfiltered read gets the honest bounded sentence, never 'not in this account' (Bugbot 4046052473 b/d)", async () => {
    mockSearch.mockImplementation(
      async (args: { query?: string | null }) =>
        args.query
          ? {
              // Searching by name is how the contact is later PROVEN to
              // exist — the selection must still be honoured once it is.
              provider_key: "google_contacts",
              google_account: "me@example.com",
              contacts: [ADA],
              count: 1,
              total_read: 1,
              already_imported: 1,
              truncated: false,
              warnings: [],
            }
          : {
              // The unfiltered read is TRUNCATED and never reaches Ada.
              provider_key: "google_contacts",
              google_account: "me@example.com",
              contacts: [],
              count: 0,
              total_read: 50,
              already_imported: 0,
              truncated: true,
              warnings: [],
            },
    );

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel organizationId="org-1" initialExternalId="people/1" />,
      );
    });
    await settle();

    let text = container.textContent ?? "";
    // Never the class of sentence that claims certainty a truncated read
    // cannot back up.
    expect(text).not.toContain(
      "The contact this link named is not in this account's readable contacts.",
    );
    // The honest, weaker sentence instead. THE INVARIANT: `selected` holds
    // only ids a read has proven — a truncated read that has not (yet)
    // turned Ada up proves NOTHING, so she is not selected either. The
    // pre-invariant version of this test asserted "1 selected" here, which
    // was the address's id riding as a provisional selection — exactly the
    // shape of all three Bugbot findings.
    expect(text).toContain("We could not find this contact in the first");
    expect(text).toContain("0 selected");
    const reviewButtonBeforeFound = [...container.querySelectorAll("button")].find(
      (candidate) => (candidate.textContent ?? "").includes("Review the field map"),
    );
    expect((reviewButtonBeforeFound as HTMLButtonElement).disabled).toBe(true);

    // (d) Finding it later (searching by name) PROMOTES the request to a
    // real selection for the first time — there is nothing to "restore",
    // because nothing false was ever selected in the first place.
    await typeQuery("Ada Lovelace");
    text = container.textContent ?? "";
    expect(text).toContain("1 selected");
    expect(text).not.toContain("We could not find this contact in the first");
  });

  function findButton(label: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((candidate) =>
      (candidate.textContent ?? "").includes(label),
    );
    if (!button) throw new Error(`no button matching ${label}`);
    return button as HTMLButtonElement;
  }

  function clickByAriaLabel(label: string) {
    const el = [...container.querySelectorAll("[aria-label]")].find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    if (!el) throw new Error(`no control with aria-label ${label}`);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  it("a keystroke before the mount read resolves never re-creates the phantom, and stays honest until the unfiltered read settles (review 5247049760, comment 4046121991)", async () => {
    let resolveUnfiltered: ((value: unknown) => void) | null = null;
    let resolveTyped: ((value: unknown) => void) | null = null;

    mockSearch.mockImplementation(
      (args: { query?: string | null }) =>
        new Promise((resolve) => {
          if (args.query) resolveTyped = resolve;
          else resolveUnfiltered = resolve;
        }),
    );

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel organizationId="org-1" initialExternalId="people/1" />,
      );
    });
    await settle();

    // Type BEFORE the mount's unfiltered read has resolved at all.
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(input, "zzz-no-match");
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await settle();

    expect(resolveTyped).toBeTruthy();
    expect(resolveUnfiltered).toBeTruthy();

    // Resolve the TYPED read first, without the address's contact.
    await act(async () => {
      resolveTyped!({
        provider_key: "google_contacts",
        google_account: "me@example.com",
        contacts: [],
        count: 0,
        total_read: 0,
        already_imported: 0,
        truncated: false,
        warnings: [],
      });
    });
    await settle();

    let text = container.textContent ?? "";
    // 🚨 THE ORIGINAL V-24 PHANTOM, reachable a new way: if the typed miss
    // were allowed to answer for the address, this would read "1 selected"
    // with Review enabled, exactly like the bug report.
    expect(text).toContain("0 selected");
    expect(findButton("Review the field map").disabled).toBe(true);
    // Never silent: the unfiltered (proof) read has not settled yet.
    expect(text).toContain("Still looking for the contact this link named");
    expect(text).not.toContain(
      "The contact this link named is not in this account's readable contacts.",
    );

    // NOW the mount's own unfiltered read settles — complete, and without
    // the address's contact either.
    await act(async () => {
      resolveUnfiltered!({
        provider_key: "google_contacts",
        google_account: "me@example.com",
        contacts: [],
        count: 0,
        total_read: 0,
        already_imported: 0,
        truncated: false,
        warnings: [],
      });
    });
    await settle();

    text = container.textContent ?? "";
    expect(text).toContain("0 selected");
    expect(findButton("Review the field map").disabled).toBe(true);
    expect(text).not.toContain("Still looking for the contact this link named");
    expect(text).toContain(
      "The contact this link named is not in this account's readable contacts.",
    );
  });

  it("an organization change clears the previous account's selection entirely (review 5247049760, comment 4046121996)", async () => {
    const BOB = { ...ADA, external_id: "people/2", display_name: "Bob" };
    mockSearch.mockResolvedValue({
      provider_key: "google_contacts",
      google_account: "me@example.com",
      contacts: [ADA, BOB],
      count: 2,
      total_read: 2,
      already_imported: 0,
      truncated: false,
      warnings: [],
    });

    await act(async () => {
      root.render(<GoogleContactsImportPanel organizationId="org-1" initialExternalId={null} />);
    });
    await settle();

    await act(async () => {
      clickByAriaLabel("Select Ada Lovelace");
      clickByAriaLabel("Select Bob");
    });
    await settle();
    expect(container.textContent ?? "").toContain("2 selected");

    // A DIFFERENT organization is a different Google account — nothing from
    // the old one may survive, including the selection itself.
    await act(async () => {
      root.render(<GoogleContactsImportPanel organizationId="org-2" initialExternalId={null} />);
    });
    await settle();

    const text = container.textContent ?? "";
    // 🚨 THE HOLE: the previous fix reset `seenIds`/`unfilteredSearch` on an
    // organization change but left `selected` holding the OLD account's ids
    // — Review could fire them at the NEW account.
    expect(text).toContain("0 selected");
    expect(findButton("Review the field map").disabled).toBe(true);
  });
});

/**
 * F-114 — TWO WAYS THE PROOF READ AND THE ADDRESS'S REQUEST STILL LIED
 * (VERIFY-R10-FIX-WAVE NEW findings, 2026-09-18).
 *
 * (1) The mount branch of the read effect returned
 *     `() => unfilteredAbortRef.current?.abort()` as its CLEANUP, and the
 *     effect re-runs on every `query` change — so the FIRST keystroke aborted
 *     the one read that can prove the address's contact exists. Every test
 *     above missed it because the mock resolves whatever the signal says; the
 *     tests below honour the signal, exactly as `fetch` does.
 *
 * (2) `requestedExternalId` survived its own promotion, so a person who
 *     un-ticked the deep-linked contact had it ticked again by the next
 *     Refresh, debounced search, or post-save reload. Promotion happens
 *     ONCE — after it, the address has been answered and holds nothing.
 */
describe("the proof read survives a keystroke, and a promotion happens exactly once", () => {
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

  const ADA = {
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
  };

  const read = (contacts: unknown[]) => ({
    provider_key: "google_contacts",
    google_account: "me@example.com",
    contacts,
    count: contacts.length,
    total_read: contacts.length,
    already_imported: contacts.length,
    truncated: false,
    warnings: [],
  });

  function findButton(label: string): HTMLButtonElement {
    const button = [...container.querySelectorAll("button")].find((candidate) =>
      (candidate.textContent ?? "").includes(label),
    );
    if (!button) throw new Error(`no button matching ${label}`);
    return button as HTMLButtonElement;
  }

  function clickByAriaLabel(label: string) {
    const el = [...container.querySelectorAll("[aria-label]")].find(
      (candidate) => candidate.getAttribute("aria-label") === label,
    );
    if (!el) throw new Error(`no control with aria-label ${label}`);
    el.dispatchEvent(new MouseEvent("click", { bubbles: true }));
  }

  async function typeQuery(text: string) {
    const input = container.querySelector("input") as HTMLInputElement;
    const setter = Object.getOwnPropertyDescriptor(
      window.HTMLInputElement.prototype,
      "value",
    )!.set!;
    await act(async () => {
      setter.call(input, text);
      input.dispatchEvent(new Event("input", { bubbles: true }));
    });
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await settle();
  }

  it("a keystroke does not abort the unfiltered proof read (F-114 NEW-1)", async () => {
    // The mock behaves like `fetch`: an aborted signal REJECTS, it does not
    // hand back a result. That is the only difference from the suite above,
    // and it is the whole defect.
    let unfilteredSignal: AbortSignal | null = null;
    let releaseUnfiltered: (() => void) | null = null;
    mockSearch.mockImplementation(
      (args: { query?: string | null; signal?: AbortSignal }) =>
        new Promise((resolve, reject) => {
          if (args.query) {
            resolve(read([]));
            return;
          }
          unfilteredSignal = args.signal ?? null;
          releaseUnfiltered = () => resolve(read([ADA]));
          args.signal?.addEventListener("abort", () => {
            const error = new Error("Aborted");
            error.name = "AbortError";
            reject(error);
          });
        }),
    );

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel
          organizationId="org-1"
          initialExternalId="people/1"
        />,
      );
    });
    await settle();

    // The person types before the mount's unfiltered read has answered.
    await typeQuery("Ada");

    // 🚨 THE DEFECT: the mount branch's cleanup fired on the keystroke and
    // aborted the ONE read that can prove this contact exists.
    expect(unfilteredSignal).toBeTruthy();
    expect((unfilteredSignal as unknown as AbortSignal).aborted).toBe(false);

    // And when it answers, it still promotes the address's contact.
    await act(async () => {
      releaseUnfiltered!();
    });
    await settle();

    const text = container.textContent ?? "";
    expect(text).toContain("1 selected");
    expect(text).not.toContain("Still looking for the contact this link named");
  });

  it("un-ticking the deep-linked contact survives a Refresh (F-114 NEW-2)", async () => {
    mockSearch.mockResolvedValue(read([ADA]));

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel
          organizationId="org-1"
          initialExternalId="people/1"
        />,
      );
    });
    await settle();
    expect(container.textContent ?? "").toContain("1 selected");

    // The person looks at it and decides not to import it after all.
    await act(async () => {
      clickByAriaLabel("Select Ada Lovelace");
    });
    await settle();
    expect(container.textContent ?? "").toContain("0 selected");

    // 🚨 THE DEFECT: `requestedExternalId` outlived its own promotion, so the
    // next read ticked the box again behind the person's back.
    await act(async () => {
      findButton("Refresh").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await settle();

    expect(container.textContent ?? "").toContain("0 selected");
    expect(findButton("Review the field map").disabled).toBe(true);
  });
  it("the proof read is re-run after a recovery, so the still-looking line does not outlive it (F-115 / V-26 NEW-2)", async () => {
    // THE VERIFIER'S EXACT PATH (VERIFY-R11-FIX-WAVE NEW-2): the server
    // refuses with 409 until an account is named, the person TYPES, and only
    // then presses an account. `typedRef` was sticky, so from the first
    // keystroke on, every later re-run of the read effect fired the TYPED
    // read only — the unfiltered proof read never ran again, `unfilteredSearch`
    // stayed null after the account reset, and "Still looking for the contact
    // this link named…" printed beside a settled read forever.
    const BOB = { ...ADA, external_id: "people/2", display_name: "Bob", already_imported: false, person_id: null, person_name: null, imported_at: null };
    // The contact the LINK named: it is not what the person typed, so only the
    // unfiltered proof read can ever settle whether it is in this account.
    const CAROL = { ...BOB, external_id: "people/9", display_name: "Carol" };
    const ambiguous = () =>
      new BackendApiError({
        code: "several_google_accounts",
        detail: "2 connected Google accounts can read Contacts: one@x.com, two@x.com.",
        userMessage: "2 connected Google accounts can read Contacts: one@x.com, two@x.com.",
        details: { candidate_accounts: ["one@x.com", "two@x.com"] },
        status: 409,
      });
    mockSearch.mockImplementation(
      async (args: { query?: string; googleAccount?: string | null }) => {
        if (!args.googleAccount) throw ambiguous();
        return {
          ...read(args.query ? [BOB] : [BOB, CAROL]),
          google_account: args.googleAccount,
        };
      },
    );

    await act(async () => {
      root.render(
        <GoogleContactsImportPanel
          organizationId="org-1"
          initialExternalId="people/9"
        />,
      );
    });
    await settle();

    // The person types while the server is still refusing.
    await typeQuery("bob");
    // …then takes the remedy the panel offers: an account.
    await act(async () => {
      findButton("one@x.com").dispatchEvent(
        new MouseEvent("click", { bubbles: true }),
      );
    });
    await settle();
    await act(async () => {
      await new Promise((resolve) => setTimeout(resolve, 300));
    });
    await settle();

    // 🚨 THE SYMPTOM THE VERIFIER READ OFF THE DOM: a settled read on screen
    // with the still-looking line beside it, forever.
    const text = container.textContent ?? "";
    expect(text).toContain("Bob");
    expect(text).not.toContain("Still looking for the contact this link named");
    // The proof read settled and ANSWERED the link: Carol is in this account.
    expect(text).toContain("1 selected");

    // …and its cause: the unfiltered proof read must RUN AGAIN under the
    // chosen account. It is owed by the account identity, never by whether
    // anyone has ever typed.
    const proofReads = mockSearch.mock.calls.filter(
      (call: [{ query?: string; googleAccount?: string | null }]) =>
        call[0].query === "" && call[0].googleAccount === "one@x.com",
    );
    expect(proofReads.length).toBeGreaterThan(0);
  });
});
