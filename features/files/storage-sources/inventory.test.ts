import { readConnectionStatus } from "@/features/connectors/connection-status";
import { loadStoragePickerAccounts } from "@/features/files/storage-sources/inventory";

const mockGetSession = jest.fn();
const mockMicrosoft = jest.fn();
const mockStorage = jest.fn();

jest.mock("@/utils/supabase/client", () => ({
  createClient: () => ({ auth: { getSession: mockGetSession } }),
}));
jest.mock("@/features/microsoft-integration/service", () => ({
  listMicrosoftConnections: (...args: unknown[]) => mockMicrosoft(...args),
}));
jest.mock("@/features/storage-connections/service", () => ({
  listStorageConnections: (...args: unknown[]) => mockStorage(...args),
}));

beforeEach(() => {
  jest.clearAllMocks();
  mockGetSession.mockResolvedValue({
    data: { session: { access_token: "present", user: { id: "user-1" } } },
  });
  mockMicrosoft.mockResolvedValue([]);
  mockStorage.mockResolvedValue([]);
});

test("missing live session is an error and inventories are not queried", async () => {
  mockGetSession.mockResolvedValue({ data: { session: null } });
  await expect(loadStoragePickerAccounts()).rejects.toThrow("Sign in again");
  expect(mockMicrosoft).not.toHaveBeenCalled();
  expect(mockStorage).not.toHaveBeenCalled();
});

test("only connected actor-owned inventory rows with OneDrive Files.Read are eligible", async () => {
  mockMicrosoft.mockResolvedValue([
    {
      id: "ms-good",
      accountEmail: "good@example.com",
      accountName: null,
      scopes: ["https://graph.microsoft.com/Files.Read"],
      status: "connected",
    },
    {
      id: "ms-no-scope",
      accountEmail: "no-scope@example.com",
      accountName: null,
      scopes: ["User.Read"],
      status: "connected",
    },
    {
      id: "ms-unhealthy",
      accountEmail: "bad@example.com",
      accountName: null,
      scopes: ["Files.Read"],
      status: "needs_attention",
    },
  ]);
  mockStorage.mockResolvedValue([
    {
      id: "dropbox-good",
      provider: "dropbox",
      accountEmail: "dropbox@example.com",
      accountName: null,
      status: readConnectionStatus("connected"),
    },
    {
      id: "box-unknown",
      provider: "box",
      accountEmail: "box@example.com",
      accountName: null,
      status: readConnectionStatus("future_state"),
    },
  ]);

  await expect(loadStoragePickerAccounts()).resolves.toEqual([
    {
      id: "ms-good",
      provider: "onedrive",
      label: "good@example.com",
      email: "good@example.com",
    },
    {
      id: "dropbox-good",
      provider: "dropbox",
      label: "dropbox@example.com",
      email: "dropbox@example.com",
    },
  ]);
});

test("either inventory failure rejects the picker instead of claiming no accounts", async () => {
  mockStorage.mockRejectedValue(new Error("storage inventory unavailable"));
  await expect(loadStoragePickerAccounts()).rejects.toThrow(
    "storage inventory unavailable",
  );
});
