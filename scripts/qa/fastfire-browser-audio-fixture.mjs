// Browser-controller compatibility entrypoint. The implementation is canonical
// beside the FastFire surface so the localhost-only app seam and controller
// tests cannot drift into two different audio sources.
import {
  FASTFIRE_QA_AUDIO_FIXTURE_VERSION as canonicalVersion,
  installFastFireBrowserAudioFixture as installCanonicalFixture,
} from "../../features/flashcards/fast-fire/qa/browserAudioFixture.mjs";

export const FASTFIRE_QA_AUDIO_FIXTURE_VERSION = canonicalVersion;

export function installFastFireBrowserAudioFixture(scope = globalThis) {
  return installCanonicalFixture(scope);
}
