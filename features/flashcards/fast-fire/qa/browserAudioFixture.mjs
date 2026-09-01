/**
 * Deterministic audio source for the bounded FastFire certification canary.
 *
 * This module is loaded by the FastFire surface only when the caller passes the
 * exact QA query flag on localhost in a development build. Production builds,
 * non-local origins, and ordinary FastFire sessions retain the native browser
 * permission path.
 */
export const FASTFIRE_QA_AUDIO_FIXTURE_VERSION =
  "fastfire-browser-spoken-answer-fixture-v2";

const ANSWER_FIXTURES = [
  "/qa/fastfire-answer-paris.wav",
  "/qa/fastfire-answer-fifty-six.wav",
];

export function installFastFireBrowserAudioFixture(scope = globalThis) {
  const existing = scope.__matrxFastFireBrowserAudioFixture;
  if (existing?.version === FASTFIRE_QA_AUDIO_FIXTURE_VERSION) {
    return existing;
  }

  const mediaDevices = scope.navigator?.mediaDevices;
  if (!mediaDevices || typeof mediaDevices.getUserMedia !== "function") {
    throw new Error(
      "FastFire QA audio fixture requires MediaDevices.getUserMedia.",
    );
  }

  const AudioContextCtor = scope.AudioContext ?? scope.webkitAudioContext;
  if (!AudioContextCtor) {
    throw new Error("FastFire QA audio fixture requires Web Audio.");
  }

  const originalGetUserMedia = mediaDevices.getUserMedia;
  const context = new AudioContextCtor();
  const destination = context.createMediaStreamDestination();
  const gain = context.createGain();
  gain.gain.value = 1;
  gain.connect(destination);

  // Load both real spoken-answer WAVs before the mic grant resolves. The first
  // answer window can open immediately after the countdown; lazy decoding at
  // that boundary would recreate the exact first-card warm-up race this fixture
  // exists to catch.
  const answersReady = Promise.all(
    ANSWER_FIXTURES.map(async (url) => {
      const response = await scope.fetch(url);
      if (!response.ok) {
        throw new Error(`FastFire QA answer fixture failed to load ${url}.`);
      }
      return context.decodeAudioData(await response.arrayBuffer());
    }),
  );
  const activeSources = new Set();
  let nextAnswer = 0;

  const fixtureGetUserMedia = async (constraints = {}) => {
    const wantsAudio = Boolean(constraints.audio);
    const wantsVideo = Boolean(constraints.video);
    if (!wantsAudio || wantsVideo) {
      return originalGetUserMedia.call(mediaDevices, constraints);
    }

    await Promise.all([context.resume(), answersReady]);
    const sourceTrack = destination.stream.getAudioTracks()[0];
    if (!sourceTrack) {
      throw new Error("FastFire QA audio fixture produced no audio track.");
    }
    return new scope.MediaStream([sourceTrack.clone()]);
  };

  Object.defineProperty(mediaDevices, "getUserMedia", {
    configurable: true,
    writable: true,
    value: fixtureGetUserMedia,
  });

  const controller = {
    version: FASTFIRE_QA_AUDIO_FIXTURE_VERSION,
    source: "deterministic-local-spoken-answer-audio",
    answerCount: ANSWER_FIXTURES.length,
    playNextAnswer: async () => {
      await context.resume();
      const answers = await answersReady;
      const answer = answers[nextAnswer];
      if (!answer) {
        throw new Error(
          `FastFire QA answer fixture exhausted after ${answers.length} cards.`,
        );
      }
      nextAnswer += 1;
      const source = context.createBufferSource();
      source.buffer = answer;
      source.connect(gain);
      activeSources.add(source);
      source.onended = () => activeSources.delete(source);
      source.start();
    },
    restore: async () => {
      if (mediaDevices.getUserMedia === fixtureGetUserMedia) {
        Object.defineProperty(mediaDevices, "getUserMedia", {
          configurable: true,
          writable: true,
          value: originalGetUserMedia,
        });
      }
      for (const source of activeSources) source.stop();
      activeSources.clear();
      destination.stream.getTracks().forEach((track) => track.stop());
      await context.close();
      if (scope.__matrxFastFireBrowserAudioFixture === controller) {
        delete scope.__matrxFastFireBrowserAudioFixture;
      }
    },
  };

  scope.__matrxFastFireBrowserAudioFixture = controller;
  return controller;
}
