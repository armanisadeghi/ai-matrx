import { act } from "react";
import { createRoot, type Root } from "react-dom/client";
import { CheckoutFeedback } from "../CheckoutFeedback";
import { fetchWithOrganization } from "@/lib/organizations/fetchWithOrganization";

const mockDispatch = jest.fn();
const mockSearch = new URLSearchParams(
  "checkout=success&session_id=cs_test_billing_return&plan=personal-entry&cycle=monthly",
);
jest.mock("next/navigation", () => ({ useSearchParams: () => mockSearch }));
jest.mock("@/lib/redux/hooks", () => ({ useAppDispatch: () => mockDispatch }));
jest.mock("@/lib/organizations/fetchWithOrganization", () => ({
  fetchWithOrganization: jest.fn(),
}));
jest.mock("@/features/entitlements/service", () => ({
  fetchEntitlementSnapshot: async () => null,
}));
jest.mock("@/features/entitlements/usage-gate/usageRead", () => ({
  readUsageSnapshot: async () => null,
}));

const fetchStatus = jest.mocked(fetchWithOrganization);

describe("CheckoutFeedback rendered return", () => {
  let host: HTMLDivElement;
  let root: Root;
  beforeEach(() => {
    jest.clearAllMocks();
    host = document.createElement("div");
    document.body.appendChild(host);
    root = createRoot(host);
    fetchStatus.mockResolvedValue(
      new Response(JSON.stringify({ status: "active" }), { status: 200 }),
    );
  });
  afterEach(async () => {
    await act(async () => root.unmount());
    host.remove();
  });

  it("confirms subscription access without claiming a trial collected payment", async () => {
    await act(async () => {
      root.render(<CheckoutFeedback />);
    });
    expect(host.textContent).toContain("Your subscription is active.");
    expect(host.textContent).not.toContain("Payment confirmed");
    expect(fetchStatus).toHaveBeenCalledTimes(1);
    expect(JSON.parse(fetchStatus.mock.calls[0][1]?.body as string)).toEqual({
      sessionId: "cs_test_billing_return",
    });
    await act(async () => {
      root.render(<CheckoutFeedback />);
    });
    expect(fetchStatus).toHaveBeenCalledTimes(1);
  });
});
