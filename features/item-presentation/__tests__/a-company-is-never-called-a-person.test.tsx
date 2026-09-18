/**
 * 🚨 N6 + N5 (VERIFY-U-P1-R5) — A COMPANY IS NEVER CALLED A PERSON, AND A
 * PERSON'S DOSSIER IS NOT A COLUMN DUMP.
 *
 * THE DEFECTS, both found on the live data:
 *
 *   N6 — `crm.party` holds 1,892 rows: 460 `person` and 1,432 `organization`
 *   (read live 2026-09-18). The registration's label was "Person", so the real
 *   company `d3dc196a…` ("Environmentalbusinessoutlook") rendered as
 *   "Environmentalbusinessoutlook Person Person" — the word twice, above a
 *   field reading `organization`. RED below: mounting that REAL row through the
 *   REAL type map put "Person" in all three presentations.
 *
 *   N5 — every type got the generic formatter, so the real Angie Sadeghi row
 *   opened with `Version=2 | Name Key=angie sadeghi | … | Party Kind=person |
 *   Visibility=internal | Record Class=contact` — PostgREST's key order, with
 *   her own name tenth.
 *
 * GREEN: the party registration carries a curated, ordered, human-labelled
 * field list (`features/crm/party-detail.ts`) and every place the host controls
 * the word takes it from the ONE resolver (`features/crm/party-words.ts`).
 *
 * WHAT THIS TEST CANNOT CLOSE: the header's TYPE CHIP reads
 * `DetailRecordType.label`, which is per type, so it says "Contact" for a
 * Person and a Company alike. The honest generic beats a lie about three rows
 * in four; the per-row chip needs `labelForRow` in the primitive's contract
 * (escalation C, recorded in this feature's FEATURE.md).
 */

import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import {
  DetailDockedPresentation,
  DetailPagePresentation,
  DetailWindowPresentation,
} from "@/lib/detail/presentations";
import { DetailHostProvider, type DetailHostPorts } from "@/lib/detail/host";
import type {
  DetailDockedShellProps,
  DetailPageShellProps,
  DetailWindowShellProps,
} from "@/lib/detail/host";

import { resolveItemDetailType } from "../detail";
import {
  REAL_COMPANY,
  REAL_EMPLOYER,
  REAL_PERSON,
  REAL_PERSON_WITH_CONTACT,
} from "./party-fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

window.matchMedia = ((query: string) => ({
  matches: false,
  media: query,
  onchange: null,
  addListener() {},
  removeListener() {},
  addEventListener() {},
  removeEventListener() {},
  dispatchEvent: () => false,
})) as unknown as typeof window.matchMedia;

// The real loader, the real extras read and the real field list, over a client
// that answers with the REAL rows read from the live database.
jest.mock("@/utils/supabase/client", () => {
  const {
    REAL_COMPANY: COMPANY,
    REAL_PERSON: PERSON,
    REAL_PERSON_WITH_CONTACT: CONTACTFUL,
    REAL_EMPLOYER: EMPLOYER,
    REAL_CONTACT_POINTS: POINTS,
  } = jest.requireActual("./party-fixtures");
  const PARTIES: Record<string, unknown> = {
    [COMPANY.id]: COMPANY,
    [PERSON.id]: PERSON,
    [CONTACTFUL.id]: CONTACTFUL,
    [EMPLOYER.id]: EMPLOYER,
  };
  const POINTS_BY_PARTY: Record<string, unknown[]> = {
    [CONTACTFUL.id]: [...POINTS],
  };
  function builder(table: string) {
    let capturedId: string | null = null;
    const b: Record<string, unknown> = {};
    const self = () => b;
    Object.assign(b, {
      select: self,
      order: self,
      is: self,
      limit: self,
      abortSignal: self,
      eq: (_column: string, value: string) => {
        capturedId = value;
        return b;
      },
      maybeSingle: async () => ({
        data: capturedId ? (PARTIES[capturedId] ?? null) : null,
        error: null,
      }),
      // The contact-points query is awaited directly, so the builder is a
      // thenable exactly like PostgREST's.
      then: (resolve: (v: unknown) => unknown) =>
        Promise.resolve({
          data:
            table === "party_contact_point" && capturedId
              ? (POINTS_BY_PARTY[capturedId] ?? [])
              : [],
          error: null,
        }).then(resolve),
    });
    return b;
  }
  const client: Record<string, unknown> = {
    schema: () => client,
    from: (table: string) => builder(table),
  };
  return { supabase: client };
});

const partyType = () => {
  const recordType = resolveItemDetailType("party");
  if (!recordType) throw new Error("the party type must resolve through THE type map");
  return recordType;
};

describe("N6 — the word for a party comes from its own kind", () => {
  it("names a Company a Company and a Person a Person, from the real rows", () => {
    const fields = (row: Record<string, unknown>) =>
      new Map(partyType().fields(row).map((f) => [f.label, f.text]));
    expect(fields(REAL_COMPANY).get("Type")).toBe("Company");
    expect(fields(REAL_PERSON).get("Type")).toBe("Person");
  });

  it("names a nameless record by its OWN kind, never 'Untitled Person' for a company", () => {
    const { title } = partyType();
    expect(title({ ...REAL_COMPANY, display_name: null }, null)).toBe("Untitled Company");
    expect(title({ ...REAL_PERSON, display_name: null }, null)).toBe("Untitled Person");
    // A kind nobody registered reads the honest generic word — never "Person".
    expect(title({ ...REAL_PERSON, display_name: null, party_kind: "trust" }, null)).toBe(
      "Untitled Contact",
    );
    expect(title({ ...REAL_PERSON, display_name: null, party_kind: null }, null)).toBe(
      "Untitled Contact",
    );
  });

  it("no longer labels the whole type 'Person' — the lie about 1,432 of 1,892 rows", () => {
    expect(partyType().label).toBe("Contact");
    expect(partyType().label).not.toBe("Person");
  });
});

describe("N5 — the curated dossier", () => {
  const labels = (row: Record<string, unknown>) =>
    partyType()
      .fields(row)
      .map((f) => f.label);

  it("leads with the record's name, not with Version", () => {
    expect(labels(REAL_PERSON)[0]).toBe("Name");
    expect(labels(REAL_COMPANY)[0]).toBe("Name");
  });

  it("never shows plumbing, an id, or a machine word", () => {
    for (const row of [REAL_PERSON, REAL_COMPANY, REAL_PERSON_WITH_CONTACT]) {
      const shown = partyType().fields(row);
      for (const banned of [
        "Version",
        "Name Key",
        "Record Class",
        "Party Kind",
        "Sort Name",
        "Field Provenance",
        "Locked Fields",
        "Canonical ID",
        "Source Party ID",
        "Organization ID",
        "Created By",
      ]) {
        expect(shown.map((f) => f.label)).not.toContain(banned);
      }
      // `internal`, `person` and `organization` are Postgres labels, not
      // English. ("Everyone in this ORGANIZATION can see it" is the sentence
      // that replaced `Visibility=internal`, so that field is read separately.)
      const plainText = shown
        .filter((f) => !f.ref && f.label !== "Who can see this")
        .map((f) => f.text)
        .join(" | ");
      expect(plainText).not.toMatch(/\binternal\b/);
      expect(plainText).not.toMatch(/\bperson\b/);
      expect(plainText).not.toMatch(/\borganization\b/);
    }
  });

  it("says who can see the record in plain English", () => {
    const fields = partyType().fields(REAL_PERSON);
    const visibility = fields.find((f) => f.label === "Who can see this");
    expect(visibility?.text).toBe("Everyone in this organization can see it");
  });

  it("says so honestly when a record has no email or phone", () => {
    const contact = partyType()
      .fields(REAL_COMPANY)
      .find((f) => f.label === "Contact");
    expect(contact?.text).toBe("No email, phone or handle is recorded here yet.");
  });
});

describe("N5 — the reads the dossier needs beyond one table", () => {
  it("shows the real email and phone, and names the employer on a door", async () => {
    const load = partyType().load;
    if (!load) throw new Error("the party type must have a loader");
    const result = await load(REAL_PERSON_WITH_CONTACT.id, new AbortController().signal);
    if (!("row" in result)) throw new Error("the real row must load");
    const fields = partyType().fields(result.row);
    const byLabel = new Map(fields.map((f) => [f.label, f]));
    expect(byLabel.get("Email")?.text).toBe("jordan.reyes@acmerobotics.com");
    expect(byLabel.get("Phone")?.text).toBe("+13105550199");
    const employer = fields.find((f) => f.key === "employer");
    expect(employer?.label).toBe("Company · Acme Robotics");
    expect(employer?.ref).toEqual({ token: "party", id: REAL_EMPLOYER.id });
  });
});

// ─── The real company row, composed, in all three presentations ──────────────

function ports(shells: DetailHostPorts["shells"]): DetailHostPorts {
  return {
    resolveType: resolveItemDetailType,
    usePresentationSetting: () => ({ value: "window", error: null }),
    resolvePresentation: async () => "window",
    warmPresentation: () => {},
    open: jest.fn(),
    close: jest.fn(),
    navigate: {
      pageHref: () => `/detail/party/${REAL_COMPANY.id}`,
      toPage: jest.fn(),
      back: jest.fn(),
      canGoBack: () => false,
      toRecordHome: jest.fn(),
    },
    shells,
    doors: {
      RecordDoors: ({ id }: { id: string }) => <span data-doors={id} />,
      RefCell: ({ value }: { value: string }) => <span>{value}</span>,
      tokenFromColumnName: () => null,
      isUuidValue: (v: unknown): v is string => typeof v === "string",
      hasDoor: () => true,
    },
    associations: { defaultTokens: [], canAnchor: () => false },
    history: { list: async () => [] },
    notify: { error: jest.fn(), success: jest.fn() },
    copyText: async () => true,
  } as unknown as DetailHostPorts;
}

const DATA = { type: "party", id: REAL_COMPANY.id, seed: null, list: null };

const PRESENTATIONS = [
  {
    name: "window",
    shells: {
      Window: ({ titleNode, actions, children }: DetailWindowShellProps) => (
        <div data-shell="window">
          {titleNode}
          {actions}
          {children}
        </div>
      ),
    },
    node: <DetailWindowPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "docked",
    shells: {
      Docked: ({ titleNode, actions, children }: DetailDockedShellProps) => (
        <div data-shell="docked">
          {titleNode}
          {actions}
          {children}
        </div>
      ),
    },
    node: <DetailDockedPresentation data={DATA} onClose={() => {}} />,
  },
  {
    name: "page",
    shells: {
      Page: ({ titleNode, actions, children }: DetailPageShellProps) => (
        <div data-shell="page">
          {titleNode}
          {actions}
          {children}
        </div>
      ),
    },
    node: <DetailPagePresentation data={DATA} />,
  },
] as const;

describe("the REAL company row, in all three presentations", () => {
  for (const which of PRESENTATIONS) {
    it(`never says "Person" about a company in the ${which.name} presentation`, async () => {
      const container = document.createElement("div");
      document.body.appendChild(container);
      const root = createRoot(container);
      await act(async () => {
        root.render(
          <DetailHostProvider ports={ports(which.shells)}>{which.node}</DetailHostProvider>,
        );
      });
      for (let i = 0; i < 8; i += 1) {
        await act(async () => {
          await Promise.resolve();
        });
      }
      const text = container.textContent ?? "";
      expect(text).toContain("Environmentalbusinessoutlook");
      // RED: "Person" appeared twice — the type chip and the stand-in title.
      expect(text).not.toContain("Person");
      expect(text).toContain("Company");
      // RED: the dossier printed the enum label and the dedupe key.
      expect(text).not.toMatch(/\bParty Kind\b/);
      expect(text).not.toMatch(/\bName Key\b/);
      expect(text).not.toMatch(/\bVersion\b/);
      act(() => root.unmount());
      container.remove();
    });
  }
});
