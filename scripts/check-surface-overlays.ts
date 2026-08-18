/**
 * Surface OVERLAY COVERAGE check.
 *
 * `check:surface-drift` validates manifests against themselves and
 * `check:surface-routes` discovers route leaves. Neither can see an overlay,
 * window, modal, sheet, or widget registered in the canonical overlay union
 * without a Surface manifest.
 *
 * Missing declarations are the P12 campaign backlog, so they are reported
 * loudly without failing. A manifest pointing at an unknown overlay id, or
 * two manifests claiming one overlay, is unambiguous contract drift and fails.
 */

import { ALL_MANIFESTS } from "@/features/surfaces/manifests/registry";
import { OVERLAY_IDS } from "@/features/window-panels/registry/overlay-ids";

const manifestsByOverlay = new Map<string, string[]>();

for (const manifest of ALL_MANIFESTS) {
  if (!manifest.overlayId) continue;
  const names = manifestsByOverlay.get(manifest.overlayId) ?? [];
  names.push(manifest.surfaceName);
  manifestsByOverlay.set(manifest.overlayId, names);
}

const overlayIds = new Set<string>(OVERLAY_IDS);
const missing = OVERLAY_IDS.filter(
  (overlayId) => !manifestsByOverlay.has(overlayId),
);
const unknown = [...manifestsByOverlay.entries()].filter(
  ([overlayId]) => !overlayIds.has(overlayId),
);
const duplicates = [...manifestsByOverlay.entries()].filter(
  ([, surfaceNames]) => surfaceNames.length > 1,
);

console.log(
  `Surface overlay coverage: ${OVERLAY_IDS.length} registered overlay ids, ${manifestsByOverlay.size} declared by manifests, ${missing.length} UNDECLARED.`,
);

if (missing.length > 0) {
  console.warn(
    `\n${missing.length} registered overlay${missing.length === 1 ? " has" : "s have"} NO Surface manifest. Each needs a completeness audit, canonical declaration, live emitter, Locate anchors, and browser-earned readiness:`,
  );
  for (const overlayId of missing) console.warn(`  - ${overlayId}`);
}

if (unknown.length > 0) {
  console.error(
    "\nPHANTOM overlay declarations: these manifests name an overlay id that is absent from OVERLAY_IDS:",
  );
  for (const [overlayId, surfaceNames] of unknown) {
    console.error(`  - ${overlayId} <- ${surfaceNames.join(", ")}`);
  }
}

if (duplicates.length > 0) {
  console.error(
    "\nDUPLICATE overlay declarations: one overlay may have only one canonical Surface manifest:",
  );
  for (const [overlayId, surfaceNames] of duplicates) {
    console.error(`  - ${overlayId} <- ${surfaceNames.join(", ")}`);
  }
}

process.exit(unknown.length > 0 || duplicates.length > 0 ? 1 : 0);
