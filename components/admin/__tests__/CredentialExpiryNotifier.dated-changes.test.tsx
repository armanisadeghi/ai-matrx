/**
 * The dated-changes half of the admin reminder (Arman: "super annoying, always gets my attention",
 * joined with the 2026-09-28 rule "no permanent global alert months before the date"):
 * the database says WHEN a change speaks (quiet until `dated_changes.remind_days` before its date;
 * refused / failed / overdue at once). This proves what the toast does with what it is told:
 *   - a change inside its lead window ("upcoming") toasts and never times out;
 *   - a change the database says nothing about (attention null: months away) raises no toast;
 *   - a refused change and an unconfirmed time zone cannot be dismissed, and the zone one asks
 *     "confirm the time zone this change uses" with a door to set it.
 */

import React from "react";
import { act } from "react";
import { createRoot, type Root } from "react-dom/client";

import CredentialExpiryNotifier from "../CredentialExpiryNotifier";
import type { DatedChange } from "@/features/admin/dated-changes/service";

const toastFn = jest.fn();
jest.mock("@/lib/toast", () => {
  const t = Object.assign((...args: unknown[]) => toastFn(...args), {
    error: jest.fn(),
    dismiss: jest.fn(),
    success: jest.fn(),
  });
  return { toast: t };
});

jest.mock("@/lib/redux/hooks", () => ({ useAppSelector: () => true }));
jest.mock("@/lib/redux/slices/userSlice", () => ({ selectIsSuperAdmin: () => true }));
jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({
    from: () => ({
      select: () => ({
        eq: () => ({ is: () => ({ maybeSingle: async () => ({ data: null, error: null }) }) }),
      }),
    }),
  }),
}));

const fetchDatedChanges = jest.fn();
jest.mock("@/features/admin/dated-changes/service", () => ({
  fetchDatedChanges: (all: boolean) => fetchDatedChanges(all),
}));

const TODAY = [{ max_tokens: null, input_price: 0.75, output_price: 3.75, cached_input_price: 0.075 }];
const NEXT = [{ max_tokens: null, input_price: 1.5, output_price: 7.5, cached_input_price: 0.15 }];

function change(over: Partial<DatedChange>): DatedChange {
  return {
    id: "c1", organizationId: "o", target: "ai.offering.pricing", targetRowId: "r", targetLabel: "gemini-3.8-flash",
    expected: TODAY, newValue: NEXT, currentValue: TODAY, projectedExpected: TODAY, drift: false,
    effectiveLocal: "2027-01-01T00:00:00", timeZone: "UTC", effectiveAt: "2027-01-01T00:00:00Z",
    effectiveNote: null, status: "scheduled", outcome: {}, appliedAt: null, reason: "Intro price ends.",
    sourceUrl: null, createdAt: "2026-09-28T00:00:00Z", resolvedAt: null, resolutionNote: null,
    attention: "upcoming", mutable: true, ...over,
  };
}

let container: HTMLDivElement;
let root: Root;

async function mount() {
  await act(async () => {
    root.render(<CredentialExpiryNotifier />);
  });
  await act(async () => {
    await Promise.resolve();
  });
}

beforeEach(() => {
  (globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
  toastFn.mockClear();
  fetchDatedChanges.mockReset();
  localStorage.clear();
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe("dated changes on the admin reminder toast", () => {
  it("a change inside its lead window toasts loudly: it never times out", async () => {
    fetchDatedChanges.mockResolvedValue([change({ attention: "upcoming" })]);
    await mount();
    const call = toastFn.mock.calls.find(([headline]) => String(headline).startsWith("Coming up"));
    expect(call).toBeDefined();
    expect(call?.[1]).toMatchObject({ duration: Infinity, dismissible: true });
    expect(call?.[1].action.label).toBe("Manage");
  });

  it("a change the database says nothing about (months away) raises no toast", async () => {
    fetchDatedChanges.mockResolvedValue([change({ attention: null })]);
    await mount();
    expect(toastFn).not.toHaveBeenCalled();
  });

  it("a refused change cannot be dismissed", async () => {
    fetchDatedChanges.mockResolvedValue([
      change({ attention: "refused", status: "refused", mutable: false, outcome: { observed: TODAY, sentence: "Nothing was changed." } }),
    ]);
    await mount();
    const call = toastFn.mock.calls.find(([headline]) => String(headline).startsWith("Refused"));
    expect(call?.[1]).toMatchObject({ duration: Infinity, dismissible: false });
    expect(call?.[1].cancel).toBeUndefined();
  });

  it("an unstated time zone asks to confirm it, with a door to set it, and cannot be dismissed", async () => {
    fetchDatedChanges.mockResolvedValue([change({ attention: "zone_unconfirmed", timeZone: null, mutable: false })]);
    await mount();
    const call = toastFn.mock.calls.find(([headline]) => String(headline).includes("time zone not stated"));
    expect(call).toBeDefined();
    expect(call?.[1].description).toContain("Confirm the time zone this change uses");
    expect(call?.[1]).toMatchObject({ duration: Infinity, dismissible: false });
    expect(call?.[1].action.label).toBe("Confirm time zone");
  });
});
