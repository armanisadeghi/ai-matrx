/**
 * 🚨 N6 (VERIFY-U-P1-R5) — THE PEEK NEVER TITLES A COMPANY "Person".
 *
 * `PartyPeek`'s title was `party?.display_name || "Person"`, so a company with
 * no display name — and EVERY record, of either kind, for the length of the
 * read — was titled "Person" in the quick look. 1,432 of the table's 1,892 rows
 * are companies (live, 2026-09-18).
 *
 * The real company row here is the one VERIFY-U-P1-R5 judged against.
 */
import * as React from "react";
import { act } from "react";
import { createRoot } from "react-dom/client";

import { REAL_COMPANY } from "@/features/item-presentation/__tests__/party-fixtures";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let resolveDetail: (value: unknown) => void = () => {};
const detailPromise = new Promise((resolve) => {
  resolveDetail = resolve;
});

jest.mock("@/features/crm/service", () => ({
  fetchPartyDetail: jest.fn(() => detailPromise),
}));

jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), back: jest.fn(), replace: jest.fn() }),
}));

import PartyPeek from "../kinds/PartyPeek";

async function settle(): Promise<void> {
  for (let i = 0; i < 6; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
}

describe("the Person peek is titled by the record's own kind", () => {
  it("titles a company with no name 'Company', and says 'Contact' while it loads", async () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => {
      root.render(<PartyPeek id={REAL_COMPANY.id} open onClose={() => {}} />);
    });
    // While the read is in flight nothing knows the kind: the honest generic,
    // never "Person" (RED: "Person", for every record of every kind).
    const whileLoading = document.body.textContent ?? "";
    expect(whileLoading).toContain("Contact");
    expect(whileLoading).not.toContain("Person");

    resolveDetail({
      party: { ...REAL_COMPANY, display_name: null, employer: null },
      contactPoints: [],
      addresses: [],
      affiliations: [],
      members: [],
      interactions: [],
    });
    await settle();

    const loaded = document.body.textContent ?? "";
    expect(loaded).toContain("Company");
    expect(loaded).not.toContain("Person");
    act(() => root.unmount());
    container.remove();
  });
});
