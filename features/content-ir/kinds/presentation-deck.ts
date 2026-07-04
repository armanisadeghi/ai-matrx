/**
 * presentation_deck kind → Slideshow bridge.
 *
 * Successor to the legacy `{ presentation: { slides, theme } }` root-key
 * detection. The kind's authored shape is FLAT:
 *
 *   { __kind:"presentation_deck", title?, slides: [
 *       { __kind:"presentation_slide", type?, title?, subtitle?, bullets?,
 *         ... } ], theme? }
 *
 * PresentationArtifact already tolerates the flattened shape — it reads
 * `payload.presentation?.slides ?? payload.slides ?? payload` — so the
 * bridge just hands over the reconstructed zero-loss value (extras like
 * `imageUrl` aliases ride the residue merge) once `slides` proves to be a
 * non-empty array.
 */

import { makeCompleteEnvelopeBridge } from "./legacy-bridge-utils";

export const presentationServerDataFromEnvelope = makeCompleteEnvelopeBridge(
  "presentation_deck",
  (value) => {
    if (!Array.isArray(value.slides) || value.slides.length === 0) {
      return undefined;
    }
    return value;
  },
);
