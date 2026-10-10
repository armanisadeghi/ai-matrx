import { act } from "react";
import { createRoot } from "react-dom/client";
import { CustomerAccountsPanel } from "../CustomerAccountsPanel";
import { disconnectCustomerSocialAccount, loadCustomerSocialConnections, loadSocialConfigs } from "../customer-service";
import { toast } from "@/lib/toast";

jest.mock("../customer-service", () => ({
  CUSTOMER_SOCIAL_PROVIDERS: ["facebook"],
  loadSocialConfigs: jest.fn(),
  loadCustomerSocialConnections: jest.fn(),
  disconnectCustomerSocialAccount: jest.fn(),
}));
jest.mock("../PinterestDataPanel", () => ({ PinterestDataPanel: () => null }));
jest.mock("../pinterest-service", () => ({ pinterestRequest: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe("customer disconnect receipts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadSocialConfigs).mockResolvedValue([{ provider: "facebook", status: "available", scopes: [], accessMode: "internal_test" }]);
    jest.mocked(loadCustomerSocialConnections).mockResolvedValue([{ id: "customer-grant", provider: "facebook", status: "connected", accountName: "Customer Page", providerSubject: "subject", issuer: null }]);
  });

  it.each([
    ["retained", "success", "Disconnected from AI Matrx; Meta authorization remains."],
    ["failed", "warning", "Disconnected from AI Matrx; provider access could not be revoked."],
  ] as const)("shows the actual %s provider outcome", async (providerRevocation, severity, message) => {
    jest.mocked(disconnectCustomerSocialAccount).mockResolvedValue({ connectionId: "customer-grant", providerRevocation });
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="customer-org" providers={["facebook"]} />); });
      const button = Array.from(host.querySelectorAll("button")).find((element) => element.textContent === "Disconnect");
      expect(button).toBeDefined();
      await act(async () => { button!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(disconnectCustomerSocialAccount).toHaveBeenCalledWith("facebook", "customer-org", "customer-grant");
      expect(toast[severity]).toHaveBeenCalledWith(message);
      expect(toast.success).not.toHaveBeenCalledWith("Account disconnected.");
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });
});
