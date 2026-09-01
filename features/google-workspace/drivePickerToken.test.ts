import { getBrokeredCredential } from "@/lib/api/broker/cache";
import { GOOGLE_SCOPE } from "@/lib/googleScopes";
import { getGoogleDrivePickerToken } from "./drivePickerToken";

jest.mock("@/lib/api/broker/cache", () => ({
  getBrokeredCredential: jest.fn(),
}));

const mockedGetCredential = getBrokeredCredential as jest.MockedFunction<
  typeof getBrokeredCredential
>;

describe("getGoogleDrivePickerToken", () => {
  beforeEach(() => mockedGetCredential.mockReset());

  it("mints the exact connection-bound drive.file audience", async () => {
    mockedGetCredential.mockResolvedValue({
      credential_mode: "native_ephemeral",
      audience: "google_drive_picker",
      token: "short-lived-google-token",
      expires_at: 2_000_000_000,
      endpoint: "https://www.googleapis.com/",
      protocol: "google_drive_picker",
      model: null,
      grant: {
        user_id: "user-1",
        audience: "google_drive_picker",
        tier_policy: "none",
        scopes: [],
        expires_at: 2_000_000_000,
      },
    });

    await expect(
      getGoogleDrivePickerToken({
        id: "11111111-1111-1111-1111-111111111111",
      }),
    ).resolves.toBe("short-lived-google-token");
    expect(mockedGetCredential).toHaveBeenCalledWith({
      audience: "google_drive_picker",
      tierPolicy: "none",
      scopes: [
        "connection:11111111-1111-1111-1111-111111111111",
        GOOGLE_SCOPE.driveFile,
      ],
    });
  });

  it("fails loudly if the broker returns another protocol", async () => {
    mockedGetCredential.mockResolvedValue({
      credential_mode: "proxied",
      audience: "google_drive_picker",
      token: "scoped-token",
      expires_at: 2_000_000_000,
      endpoint: "https://server.example/api",
      protocol: "wrong",
      model: null,
      grant: {
        user_id: "user-1",
        audience: "google_drive_picker",
        tier_policy: "none",
        scopes: [],
        expires_at: 2_000_000_000,
      },
    });

    await expect(
      getGoogleDrivePickerToken({
        id: "11111111-1111-1111-1111-111111111111",
      }),
    ).rejects.toThrow("wrong Google capability");
  });
});
