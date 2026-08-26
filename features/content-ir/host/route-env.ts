/**
 * THE MATRIX BINDING of `@ai-matrx/content-ir-react`'s route environment.
 *
 * The render DECISIONS live in the package; the registries, the resolution
 * platform, and the error sink are ours. This module is the one place those
 * two halves meet, and it is deliberately React-free so reducers, stream
 * accumulators, and tests can import it.
 */

import type { KindRouteEnv } from "@ai-matrx/content-ir-react";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";
import { kindRegistry } from "../registry/kind-registry";
import { componentRegistry } from "../registry/component-registry";

/**
 * `web` is not a placeholder: `content_ir.kind_component.platform` already
 * models react-native and friends, and a host that lies here renders the wrong
 * component everywhere. This app is the web one.
 */
export const MATRX_CONTENT_IR_PLATFORM = "web" as const;

export const matrxKindRouteEnv: KindRouteEnv = {
  kinds: kindRegistry,
  components: componentRegistry,
  reportError: captureError,
  platform: MATRX_CONTENT_IR_PLATFORM,
};

/**
 * Block types THIS app owns and the route must never re-type.
 *
 * An `artifact` block has an identity, a version, and a Canvas to open in, and
 * since 2026-08-18 it carries `metadata.__ir` so SELECTORS can read the
 * envelope (`selectKindEnvelope` — the live flashcard preview and every other
 * wrapped-payload surface). That envelope is DATA there, not a route: routing
 * it to the bare kind component would strip the artifact chrome and lose the
 * door to the Canvas.
 *
 * A `matrx` block is a Kind Directive — its reserved-namespace slug is BY
 * DESIGN never a kind_definition row, so any resolution the route could find
 * for it would be wrong, and re-typing it away from MatrxEnvelopeBlock
 * re-opens the raw-JSON break the Kind Directives merge closed (adversarial
 * finding A-8: today the block survives only because the lookup misses).
 */
export const MATRX_OWNED_BLOCK_TYPES = ["artifact", "matrx"] as const;
