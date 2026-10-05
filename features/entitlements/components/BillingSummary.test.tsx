import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { BillingSummary } from "./BillingSummary";
import {
  readBillingSummary,
  type BillingSummaryRead,
} from "../billing-summary";

const mockOpenFeedback = jest.fn();

declare global {
  var IS_REACT_ACT_ENVIRONMENT: boolean;
}

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

jest.mock("../billing-summary", () => ({
  ...jest.requireActual("../billing-summary"),
  readBillingSummary: jest.fn(),
}));

jest.mock("../catalog/usePlanCatalog", () => ({
  usePlanCatalog: () => ({ status: "ready", plans: [] }),
}));

jest.mock("@/features/pricing/components/SubscriptionControls", () => ({
  SubscriptionControls: () => <button type="button">Manage billing</button>,
}));

jest.mock("@/features/overlays/openers/feedbackDialog", () => ({
  useOpenFeedbackWindow: () => mockOpenFeedback,
}));

type Deferred<T> = {
  promise: Promise<T>;
  resolve: (value: T) => void;
  reject: (reason?: unknown) => void;
};

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, resolve, reject };
}

const activeRead = {
  ok: true as const,
  subscription: {
    id: "sub_harbor_monthly",
    plan_key: "personal-entry",
    price_id: "price_monthly",
    status: "active",
    current_period_end: "2026-11-01T00:00:00.000Z",
    cancel_at_period_end: false,
    beneficiary_user_id: "member-harbor",
  },
  price: null,
} satisfies Extract<BillingSummaryRead, { ok: true }>;

const paymentDueRead = {
  ...activeRead,
  subscription: { ...activeRead.subscription, status: "past_due" },
} satisfies Extract<BillingSummaryRead, { ok: true }>;

describe("BillingSummary account switching", () => {
  let host: HTMLDivElement;
  let root: Root;
  const mockRead = readBillingSummary as jest.MockedFunction<
    typeof readBillingSummary
  >;
  const mockFetch = jest.fn();

  beforeEach(() => {
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    mockRead.mockReset();
    mockFetch.mockReset();
    mockOpenFeedback.mockReset();
    mockFetch.mockResolvedValue({
      ok: true,
      json: async () => ({ livemode: true }),
    });
    global.fetch = mockFetch;
  });

  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("clears a prior account invoice immediately while a new account is loading", async () => {
    const organizationRead = deferred<BillingSummaryRead>();
    const recovery = deferred<{
      invoice: {
        id: string;
        url: string;
        status: string;
        requiresAction: boolean;
      };
    }>();
    mockRead
      .mockResolvedValueOnce(paymentDueRead)
      .mockReturnValueOnce(organizationRead.promise);
    mockFetch.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST")
          return recovery.promise.then((body) => ({
            ok: true,
            json: async () => body,
          }));
        return Promise.resolve({
          ok: true,
          json: async () => ({ livemode: true }),
        });
      },
    );

    await act(async () => {
      root.render(
        <BillingSummary
          scope={{ kind: "personal", userId: "member-harbor" }}
        />,
      );
    });
    recovery.resolve({
      invoice: {
        id: "in_harbor_due",
        url: "https://stripe.test/invoices/harbor",
        status: "open",
        requiresAction: false,
      },
    });
    await act(async () => {});
    expect(host.textContent).toContain("Pay invoice");

    await act(async () => {
      root.render(
        <BillingSummary
          scope={{ kind: "organization", organizationId: "org-river" }}
        />,
      );
    });
    expect(host.querySelector('[aria-label="Loading organization billing"]')).not.toBeNull();
    expect(host.textContent).not.toContain("Pay invoice");

    organizationRead.reject(new Error("Organization billing read failed"));
    await act(async () => {});
    expect(host.textContent).toContain("Organization billing read failed");
  });

  it("hides a completed recovery invoice when the same account becomes active", async () => {
    mockRead
      .mockResolvedValueOnce(paymentDueRead)
      .mockResolvedValueOnce(activeRead);
    mockFetch.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST")
          return Promise.resolve({
            ok: true,
            json: async () => ({
              invoice: {
                id: "in_harbor_due",
                url: "https://stripe.test/invoices/harbor",
                status: "open",
                requiresAction: false,
              },
            }),
          });
        return Promise.resolve({
          ok: true,
          json: async () => ({ livemode: true }),
        });
      },
    );
    await act(async () => {
      root.render(
        <BillingSummary
          scope={{ kind: "personal", userId: "member-harbor" }}
        />,
      );
    });
    await act(async () => {});
    expect(host.textContent).toContain("Pay invoice");
    const refresh = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Refresh billing",
    );
    expect(refresh).toBeDefined();
    await act(async () => {
      refresh?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });
    expect(host.textContent).not.toContain("Pay invoice");
    expect(host.textContent).toContain("Active");
  });

  it("opens the canonical feedback intake with the authorized subscription and invoice context", async () => {
    mockRead.mockResolvedValue(paymentDueRead);
    mockFetch.mockImplementation(
      (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === "POST")
          return Promise.resolve({
            ok: true,
            json: async () => ({
              invoice: {
                id: "in_harbor_due",
                url: "https://stripe.test/invoices/harbor",
                status: "open",
                requiresAction: false,
              },
            }),
          });
        return Promise.resolve({
          ok: true,
          json: async () => ({ livemode: true }),
        });
      },
    );

    await act(async () => {
      root.render(
        <BillingSummary
          scope={{ kind: "personal", userId: "member-harbor" }}
        />,
      );
    });
    await act(async () => {});
    const support = Array.from(host.querySelectorAll("button")).find(
      (button) => button.textContent === "Billing support",
    );
    expect(support).toBeDefined();
    await act(async () => {
      support?.dispatchEvent(new MouseEvent("click", { bubbles: true }));
    });

    expect(mockOpenFeedback).toHaveBeenCalledWith({
      title: "Billing support",
      subject: {
        kind: "billing_subscription",
        billingScope: "personal",
        subscriptionId: "sub_harbor_monthly",
        planKey: "personal-entry",
        subscriptionStatus: "past_due",
        invoiceId: "in_harbor_due",
        invoiceStatus: "open",
      },
    });
  });

  it.each([
    {},
    { invoice: { id: 4, url: null, status: "open", requiresAction: false } },
    { invoice: null, supportInvoices: "invalid" },
    { invoice: null, supportInvoices: [{ id: "in_bad", status: "paid", number: null, created: "yesterday" }] },
  ])("shows a recoverable error for malformed invoice data: %j", async (payload) => {
    mockRead.mockResolvedValue(activeRead);
    mockFetch.mockImplementation((_input: RequestInfo | URL, init?: RequestInit) => Promise.resolve({
      ok: true, json: async () => init?.method === "POST" ? payload : { livemode: true },
    }));
    await act(async () => root.render(<BillingSummary scope={{ kind: "personal", userId: "member-harbor" }} />));
    await act(async () => {});
    expect(host.textContent).toContain("Billing invoice data could not be read. Refresh billing.");
    expect(host.textContent).not.toContain("Pay invoice");
    expect(host.textContent).toContain("Billing support");
  });

  it("keeps support reachable after a failed billing read without inventing subscription context", async () => {
    mockRead.mockResolvedValue({
      ok: false,
      reason: "Billing access was rejected.",
    });
    await act(async () => {
      root.render(
        <BillingSummary
          scope={{ kind: "personal", userId: "member-harbor" }}
        />,
      );
    });
    await act(async () => {});
    expect(host.textContent).toContain("Billing access was rejected.");
    const support = Array.from(host.querySelectorAll("button")).find(button => button.textContent === "Billing support");
    expect(support).toBeDefined();
    await act(async () => support?.click());
    expect(mockOpenFeedback).toHaveBeenCalledWith({ title: "Billing support", subject: {
      kind: "billing_subscription", billingScope: "personal", subscriptionId: null,
      planKey: null, subscriptionStatus: null, invoiceId: null, invoiceStatus: null,
    } });
  });
});
