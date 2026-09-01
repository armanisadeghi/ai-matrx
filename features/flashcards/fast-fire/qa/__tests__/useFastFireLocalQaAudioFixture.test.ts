import {
  FASTFIRE_QA_AUDIO_QUERY_KEY,
  FASTFIRE_QA_AUDIO_QUERY_VALUE,
  playNextFastFireQaAnswer,
  shouldInstallFastFireLocalQaAudioFixture,
} from "../useFastFireLocalQaAudioFixture";

const enabledSearch = `?${FASTFIRE_QA_AUDIO_QUERY_KEY}=${FASTFIRE_QA_AUDIO_QUERY_VALUE}`;

describe("FastFire local QA audio activation", () => {
  it("names the spoken-answer fixture contract explicitly", () => {
    expect(FASTFIRE_QA_AUDIO_QUERY_VALUE).toBe(
      "fastfire-browser-spoken-answer-fixture-v2",
    );
  });

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

  it("asks the installed local fixture for the next real spoken answer", async () => {
    const playNextAnswer = jest.fn(async () => undefined);
    Object.assign(window, {
      __matrxFastFireBrowserAudioFixture: {
        version: FASTFIRE_QA_AUDIO_QUERY_VALUE,
        playNextAnswer,
      },
    });

    playNextFastFireQaAnswer();
    await Promise.resolve();
    expect(playNextAnswer).toHaveBeenCalledTimes(1);

    delete (
      window as Window & {
        __matrxFastFireBrowserAudioFixture?: unknown;
      }
    ).__matrxFastFireBrowserAudioFixture;
  });
});
