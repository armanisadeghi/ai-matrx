import {
  FASTFIRE_QA_AUDIO_QUERY_KEY,
  FASTFIRE_QA_AUDIO_QUERY_VALUE,
  shouldInstallFastFireLocalQaAudioFixture,
} from "../useFastFireLocalQaAudioFixture";

const enabledSearch = `?${FASTFIRE_QA_AUDIO_QUERY_KEY}=${FASTFIRE_QA_AUDIO_QUERY_VALUE}`;

describe("FastFire local QA audio activation", () => {
  it.each(["localhost", "127.0.0.1"])(
    "permits the exact fixture on development %s only",
    (hostname) => {
      expect(
        shouldInstallFastFireLocalQaAudioFixture({
          nodeEnv: "development",
          hostname,
          search: enabledSearch,
        }),
      ).toBe(true);
    },
  );

  it.each([
    { nodeEnv: "production", hostname: "localhost", search: enabledSearch },
    { nodeEnv: "test", hostname: "localhost", search: enabledSearch },
    {
      nodeEnv: "development",
      hostname: "www.aimatrx.com",
      search: enabledSearch,
    },
    { nodeEnv: "development", hostname: "localhost", search: "" },
    {
      nodeEnv: "development",
      hostname: "localhost",
      search: `?${FASTFIRE_QA_AUDIO_QUERY_KEY}=wrong-fixture`,
    },
  ])(
    "rejects activation outside the exact local-development boundary",
    (input) => {
      expect(shouldInstallFastFireLocalQaAudioFixture(input)).toBe(false);
    },
  );
});
