/**
 * Install the bounded FastFire Browser canary at the real getUserMedia seam.
 *
 * This helper is imported by the Browser controller and evaluated inside the
 * isolated QA tab immediately before the one authorized canary. It never ships
 * in the application bundle and never runs automatically. Ordinary users keep
 * the untouched browser permission path.
 *
 * The fixture produces the same audible 660/880 Hz pulse vocabulary as
 * `features/transcripts/qa/deterministicRecordingCanary.ts`. FastFire still
 * exercises its real UI, warm-stream singleton, AudioContext recorder, WAV
 * slicing, durable upload, named `answer_audio` offer, grader, persistence, and
 * terminal result. Only the physical microphone source is replaced.
 */
export function installFastFireBrowserAudioFixture(scope = globalThis) {
  const existing = scope.__matrxFastFireBrowserAudioFixture;
  if (existing?.version === "fastfire-browser-audio-fixture-v1") {
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
  const oscillator = context.createOscillator();
  oscillator.type = "sine";
  oscillator.frequency.value = 660;
  gain.gain.value = 0.18;
  oscillator.connect(gain);
  gain.connect(destination);
  oscillator.start();

  let pulseOn = true;
  let frequency = 660;
  const pulseTimer = scope.setInterval(() => {
    pulseOn = !pulseOn;
    gain.gain.setValueAtTime(pulseOn ? 0.18 : 0, context.currentTime);
  }, 350);
  const frequencyTimer = scope.setInterval(() => {
    frequency = frequency === 660 ? 880 : 660;
    oscillator.frequency.setValueAtTime(frequency, context.currentTime);
  }, 500);

  const fixtureGetUserMedia = async (constraints = {}) => {
    const wantsAudio = Boolean(constraints.audio);
    const wantsVideo = Boolean(constraints.video);
    if (!wantsAudio || wantsVideo) {
      return originalGetUserMedia.call(mediaDevices, constraints);
    }

    await context.resume();
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
    version: "fastfire-browser-audio-fixture-v1",
    source: "deterministic-local-web-audio",
    restore: async () => {
      if (mediaDevices.getUserMedia === fixtureGetUserMedia) {
        Object.defineProperty(mediaDevices, "getUserMedia", {
          configurable: true,
          writable: true,
          value: originalGetUserMedia,
        });
      }
      scope.clearInterval(pulseTimer);
      scope.clearInterval(frequencyTimer);
      oscillator.stop();
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
