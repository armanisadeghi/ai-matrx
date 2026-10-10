import { act } from "react";
import { createRoot } from "react-dom/client";
import { CustomerAccountsPanel } from "../CustomerAccountsPanel";
import { disconnectCustomerSocialAccount, discoverCustomerSocialAccount, loadCustomerSocialConnections, loadSocialConfigs, readCustomerSocialAccount, selectCustomerSocialAccount, type CustomerSocialConnection, type SocialProviderConfig } from "../customer-service";
import { toast } from "@/lib/toast";

jest.mock("../customer-service", () => ({
  CUSTOMER_SOCIAL_PROVIDERS: ["facebook"],
  loadSocialConfigs: jest.fn(),
  loadCustomerSocialConnections: jest.fn(),
  disconnectCustomerSocialAccount: jest.fn(),
  readCustomerSocialAccount: jest.fn(),
  discoverCustomerSocialAccount: jest.fn(),
  selectCustomerSocialAccount: jest.fn(),
}));
jest.mock("../PinterestDataPanel", () => ({ PinterestDataPanel: () => null }));
jest.mock("../pinterest-service", () => ({ pinterestRequest: jest.fn() }));
jest.mock("@/lib/toast", () => ({ toast: { success: jest.fn(), warning: jest.fn(), error: jest.fn() } }));

(globalThis as typeof globalThis & { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((onResolve, onReject) => { resolve = onResolve; reject = onReject; });
  return { promise, resolve, reject };
}

describe("customer disconnect receipts", () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.mocked(loadSocialConfigs).mockResolvedValue([{ provider: "facebook", status: "available", scopes: [], accessMode: "internal_test" }]);
    jest.mocked(loadCustomerSocialConnections).mockResolvedValue([{ id: "customer-grant", provider: "facebook", status: "connected", accountName: "Customer Page", providerSubject: "subject", issuer: null }]);
  });

  it("keeps Connect available while saved accounts are still loading", async () => {
    const savedAccounts = deferred<CustomerSocialConnection[]>();
    jest.mocked(loadCustomerSocialConnections).mockReturnValue(savedAccounts.promise);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="customer-org" providers={["facebook"]} />); await Promise.resolve(); });
      const connect = Array.from(host.querySelectorAll("button")).find((element) => element.textContent === "Connect");
      expect(connect?.hasAttribute("disabled")).toBe(false);
      expect(host.textContent).toContain("Not connected");
      expect(host.textContent).not.toContain("This provider is not available.");
    } finally {
      savedAccounts.resolve([]);
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });

  it("does not let a prior organization overwrite the current provider status", async () => {
    const previousConfigs = deferred<SocialProviderConfig[]>();
    const previousConnections = deferred<CustomerSocialConnection[]>();
    jest.mocked(loadSocialConfigs).mockReturnValueOnce(previousConfigs.promise).mockResolvedValueOnce([{ provider: "facebook", status: "unavailable", scopes: [], reason: "This organization cannot use Facebook." }]);
    jest.mocked(loadCustomerSocialConnections).mockReturnValueOnce(previousConnections.promise).mockResolvedValueOnce([]);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="first-org" providers={["facebook"]} />); await Promise.resolve(); });
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="second-org" providers={["facebook"]} />); await Promise.resolve(); });
      previousConfigs.resolve([{ provider: "facebook", status: "available", scopes: [] }]);
      previousConnections.resolve([]);
      await act(async () => { await Promise.resolve(); });
      expect(host.textContent).toContain("This organization cannot use Facebook.");
      expect(Array.from(host.querySelectorAll("button")).find((element) => element.textContent === "Connect")?.hasAttribute("disabled")).toBe(true);
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });

  it("does not report a saved-account failure after the panel unmounts", async () => {
    const savedAccounts = deferred<CustomerSocialConnection[]>();
    jest.mocked(loadCustomerSocialConnections).mockReturnValue(savedAccounts.promise);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    await act(async () => { root.render(<CustomerAccountsPanel organizationId="customer-org" providers={["facebook"]} />); await Promise.resolve(); });
    await act(async () => { root.unmount(); });
    savedAccounts.reject(new Error("Saved accounts are unavailable."));
    await act(async () => { await Promise.resolve(); });
    expect(toast.error).not.toHaveBeenCalled();
    host.remove();
  });

  it("does not refresh a former organization after its disconnect completes", async () => {
    const disconnect = deferred<{ connectionId: string; providerRevocation: "retained" }>();
    jest.mocked(loadSocialConfigs)
      .mockResolvedValueOnce([{ provider: "facebook", status: "available", scopes: [] }])
      .mockResolvedValueOnce([{ provider: "facebook", status: "unavailable", scopes: [], reason: "This organization cannot use Facebook." }]);
    jest.mocked(loadCustomerSocialConnections)
      .mockResolvedValueOnce([{ id: "customer-grant", provider: "facebook", status: "connected", accountName: "Customer Page", providerSubject: "subject", issuer: null }])
      .mockResolvedValueOnce([]);
    jest.mocked(disconnectCustomerSocialAccount).mockReturnValue(disconnect.promise);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="first-org" providers={["facebook"]} />); await Promise.resolve(); });
      const disconnectButton = Array.from(host.querySelectorAll("button")).find((element) => element.textContent === "Disconnect");
      await act(async () => { disconnectButton!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="second-org" providers={["facebook"]} />); await Promise.resolve(); });
      disconnect.resolve({ connectionId: "customer-grant", providerRevocation: "retained" });
      await act(async () => { await Promise.resolve(); });
      expect(host.textContent).toContain("This organization cannot use Facebook.");
      expect(loadSocialConfigs).toHaveBeenCalledTimes(2);
      expect(toast.success).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
  });

  it("does not discover a resource for a former organization after Select completes", async () => {
    const select = deferred<unknown>();
    jest.mocked(loadSocialConfigs)
      .mockResolvedValueOnce([{ provider: "facebook", status: "available", scopes: [] }])
      .mockResolvedValueOnce([{ provider: "facebook", status: "available", scopes: [] }])
      .mockResolvedValueOnce([{ provider: "facebook", status: "unavailable", scopes: [], reason: "This organization cannot use Facebook." }]);
    jest.mocked(loadCustomerSocialConnections)
      .mockResolvedValueOnce([{ id: "customer-grant", provider: "facebook", status: "connected", accountName: "Customer Page", providerSubject: "subject", issuer: null }])
      .mockResolvedValueOnce([{ id: "customer-grant", provider: "facebook", status: "connected", accountName: "Customer Page", providerSubject: "subject", issuer: null }])
      .mockResolvedValueOnce([]);
    jest.mocked(readCustomerSocialAccount).mockResolvedValue({ subject: { id: "subject", display_name: "Customer Page" }, resources: [{ resource_id: "page-1", resource_ref: "page-1", display_name: "Customer Page", resource_type: "page", selected: false }] });
    jest.mocked(selectCustomerSocialAccount).mockReturnValue(select.promise);
    const host = document.createElement("div");
    document.body.append(host);
    const root = createRoot(host);
    try {
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="first-org" providers={["facebook"]} />); await Promise.resolve(); });
      const check = Array.from(host.querySelectorAll("button")).find((element) => element.textContent === "Check");
      await act(async () => { check!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      jest.clearAllMocks();
      const selectButton = Array.from(host.querySelectorAll("button")).find((element) => element.textContent === "Select");
      expect(selectButton).toBeDefined();
      await act(async () => { selectButton!.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
      expect(selectCustomerSocialAccount).toHaveBeenCalledWith("facebook", "first-org", "customer-grant", expect.objectContaining({ resource_ref: "page-1" }), undefined);
      await act(async () => { root.render(<CustomerAccountsPanel organizationId="second-org" providers={["facebook"]} />); await Promise.resolve(); });
      select.resolve(undefined);
      await act(async () => { await Promise.resolve(); });
      expect(discoverCustomerSocialAccount).not.toHaveBeenCalled();
      expect(toast.error).not.toHaveBeenCalled();
    } finally {
      await act(async () => { root.unmount(); });
      host.remove();
    }
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
