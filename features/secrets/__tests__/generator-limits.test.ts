import { fetchKnobIndex } from "@/lib/scoped-config/service";
import { fetchVaultGeneratorLimits } from "../generator-limits";

jest.mock("@/lib/scoped-config/service", () => ({ fetchKnobIndex: jest.fn() }));

const fetchIndex = jest.mocked(fetchKnobIndex);

describe("fetchVaultGeneratorLimits", () => {
  test("uses the canonical scoped index and rejects a missing limit instead of inventing a default", async () => {
    fetchIndex.mockResolvedValueOnce([
      { key: "max_password_length", effective_value: 1024 },
    ] as never);

    await expect(fetchVaultGeneratorLimits("org-1", "user-1")).rejects.toThrow(
      "Password generation is not configured",
    );
    expect(fetchIndex).toHaveBeenCalledWith({
      organizationId: "org-1",
      userId: "user-1",
      featurePrefix: "vault.generator",
    });
  });

  test("accepts only complete bounded integer settings", async () => {
    fetchIndex.mockResolvedValueOnce([
      { key: "max_password_length", effective_value: 1024 },
      { key: "max_passphrase_words", effective_value: 64 },
    ] as never);

    await expect(fetchVaultGeneratorLimits("org-1", "user-1")).resolves.toEqual(
      {
        maxPasswordLength: 1024,
        maxPassphraseWords: 64,
      },
    );
  });
});
