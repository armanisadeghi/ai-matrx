import assert from "node:assert/strict";
import test from "node:test";

import { installFastFireBrowserAudioFixture } from "./fastfire-browser-audio-fixture.mjs";

function fixtureScope() {
  const calls = [];
  const sourceTrack = {
    clone: () => ({ kind: "audio", fixture: true, stop() {} }),
    stop() {},
  };
  const destination = {
    stream: {
      getAudioTracks: () => [sourceTrack],
      getTracks: () => [sourceTrack],
    },
  };
  class AudioContextFake {
    currentTime = 0;
    createMediaStreamDestination() {
      return destination;
    }
    createGain() {
      return {
        gain: { value: 0, setValueAtTime() {} },
        connect() {},
      };
    }
    createOscillator() {
      return {
        type: "sine",
        frequency: { value: 0, setValueAtTime() {} },
        connect() {},
        start() {},
        stop() {},
      };
    }
    async resume() {}
    async close() {}
  }
  class MediaStreamFake {
    constructor(tracks) {
      this.tracks = tracks;
    }
    getAudioTracks() {
      return this.tracks;
    }
  }
  let nextTimer = 0;
  const timers = new Set();
  const scope = {
    AudioContext: AudioContextFake,
    MediaStream: MediaStreamFake,
    navigator: {
      mediaDevices: {
        async getUserMedia(constraints) {
          calls.push(constraints);
          return { original: true };
        },
      },
    },
    setInterval() {
      nextTimer += 1;
      timers.add(nextTimer);
      return nextTimer;
    },
    clearInterval(timer) {
      timers.delete(timer);
    },
  };
  return { calls, scope, timers };
}

test("intercepts audio-only capture but delegates video and restores exactly", async () => {
  const { calls, scope, timers } = fixtureScope();
  const original = scope.navigator.mediaDevices.getUserMedia;
  const controller = installFastFireBrowserAudioFixture(scope);

  const audio = await scope.navigator.mediaDevices.getUserMedia({
    audio: { channelCount: 1 },
  });
  assert.equal(audio.getAudioTracks()[0].fixture, true);
  assert.deepEqual(calls, []);

  const combinedConstraints = Object.fromEntries([
    ["audio", true],
    ["video", true],
  ]);
  const video =
    await scope.navigator.mediaDevices.getUserMedia(combinedConstraints);
  assert.deepEqual(video, { original: true });
  assert.deepEqual(calls, [{ audio: true, video: true }]);
  assert.equal(timers.size, 2);

  await controller.restore();
  assert.equal(scope.navigator.mediaDevices.getUserMedia, original);
  assert.equal(timers.size, 0);
  assert.equal(scope.__matrxFastFireBrowserAudioFixture, undefined);
});

test("is idempotent within one isolated Browser tab", () => {
  const { scope } = fixtureScope();
  const first = installFastFireBrowserAudioFixture(scope);
  const second = installFastFireBrowserAudioFixture(scope);
  assert.equal(second, first);
});
