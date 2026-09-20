/**
 * PartyPeek — a `RecordUnavailableError` reads as the access refusal it is,
 * never as a transient fault.
 *
 * 🚨 THE DEFECT (Bugbot round 22, PR 228 comment 4042337969, Medium).
 * `PartyPeek`'s catch block stored only `e.message` and handed that STRING to
 * `AccessGate`. `fetchPartyDetail` throws `RecordUnavailableError` on a
 * zero-row/RLS miss; `classifyDataError` can only recognise that class (or a
 * PostgREST error code) as an access question — a bare string has neither, so
 * it always classified as a transient `fault`. `useAccessGate` folds that
 * classification into the `read` hint it sends the resolver
 * (`fetchAccessDeniedContext`), so the flattened string told the platform the
 * read was transient even when it was a genuine access refusal.
 *
 * This test drives the mocked resolver's answer FROM that `read` hint (the
 * same shape the real RPC uses: an access question can come back `denied`; a
 * transient fault comes back `ok` — "you do have access, try again"), so a
 * flattened string reliably produces the wrong screen and the real error
 * object reliably produces the right one.
 */

import * as React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const replaceMock = jest.fn();
jest.mock("next/navigation", () => ({
  useRouter: () => ({ push: jest.fn(), replace: replaceMock, back: jest.fn() }),
  usePathname: () => "/test",
  useSearchParams: () => new URLSearchParams(),
}));

jest.mock("@/components/ui/dialog", () => ({
  Dialog: ({ children }: { children: React.ReactNode }) => <>{children}</>,
  DialogContent: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogHeader: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
  DialogTitle: ({ children }: { children: React.ReactNode }) => (
    <h1>{children}</h1>
  ),
  DialogFooter: ({ children }: { children: React.ReactNode }) => (
    <div>{children}</div>
  ),
}));

// Neither of these bears on the classification defect under test, and both
// pull in Redux / live eligibility RPCs that would otherwise need a store.
jest.mock("@/features/access-gate/components/RequestAccessPanel", () => ({
  RequestAccessPanel: () => null,
}));
jest.mock("@/features/emergency-access/components/EmergencyDoorAffordance", () => ({
  EmergencyDoorAffordance: () => null,
}));

const fetchPartyDetail = jest.fn();
jest.mock("@/features/crm/service", () => ({
  fetchPartyDetail: (...args: unknown[]) => fetchPartyDetail(...args),
}));

/**
 * The mocked resolver. Its answer is keyed off the THIRD argument — the
 * `read` hint `useAccessGate` derives via `classifyDataError(error)` — exactly
 * the piece the defect corrupts. `"access-question"` → the party really is
 * denied; `"fault"` → the platform says the caller can open it and the read
 * was transient (the "ok" retry copy).
 */
const fetchAccessDeniedContext = jest.fn(
  async (token: string, id: string, read: "access-question" | "fault") => ({
    status: read === "access-question" ? "denied" : "ok",
    disclosure: "full",
    level: "none",
    isOwner: false,
    entity: { token, label: "Person", title: "Dana Reyes" },
    owner: null,
    organization: null,
    ancestor: null,
    request: null,
    canRequest: false,
  }),
);
jest.mock("@/features/access-gate/service/accessDeniedContext", () => ({
  fetchAccessDeniedContext: (...args: [string, string, "access-question" | "fault"]) =>
    fetchAccessDeniedContext(...args),
}));

import { recordUnavailable } from "@/lib/records/recordUnavailable";
import PartyPeek from "./PartyPeek";

async function mount(id: string) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  const root: Root = createRoot(container);
  await act(async () => {
    root.render(<PartyPeek id={id} open onClose={() => {}} />);
  });
  // The fetch, the catch, and the resolver RPC are each an awaited hop.
  for (let i = 0; i < 8; i += 1) {
    await act(async () => {
      await Promise.resolve();
    });
  }
  return {
    container,
    unmount: () => {
      act(() => root.unmount());
      container.remove();
    },
  };
}

describe("PartyPeek — a failed read hands AccessGate the real error, not its .message", () => {
  afterEach(() => {
    fetchPartyDetail.mockReset();
    fetchAccessDeniedContext.mockClear();
  });

  it("a RecordUnavailableError (RLS/zero-row miss) renders the access refusal, not the retry copy", async () => {
    fetchPartyDetail.mockRejectedValue(
      recordUnavailable({ entity: "person", reason: "unknown", recordId: "p1", token: "party" }),
    );

    const m = await mount("p1");

    // The resolver must have been told this was an access question — the
    // whole point of keeping the error object instead of its string message.
    expect(fetchAccessDeniedContext).toHaveBeenCalledWith(
      "party",
      "p1",
      "access-question",
    );

    expect(m.container.textContent).toContain("don't have access");
    expect(m.container.textContent).not.toContain(
      "You do have access to it",
    );
    m.unmount();
  });

  it("a plain fault still renders the fault path (retry copy), unaffected by the fix", async () => {
    fetchPartyDetail.mockRejectedValue(new Error("network timeout"));

    const m = await mount("p2");

    expect(fetchAccessDeniedContext).toHaveBeenCalledWith("party", "p2", "fault");

    expect(m.container.textContent).toContain("You do have access to it");
    expect(m.container.textContent).not.toContain("don't have access");
    m.unmount();
  });
});
