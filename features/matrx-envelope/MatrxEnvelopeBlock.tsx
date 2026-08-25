"use client";

/**
 * MatrxEnvelopeBlock — the in-content renderer for a ```matrx fence, and the
 * PREFIX-DEFAULT component for every `directive_v1_*` shape.
 *
 * Pipeline (one pipeline, mirroring the backend):
 *
 *   1. parse + `decodeDirective` → the two-key shell
 *      (`{"__kind":"directive_v1_<class>_<noun>","items":[…]}`). Stored 4-key
 *      fences are translated by the read-only shim INSIDE the decoder, so from
 *      here down a 2024 fence and one written this second are the same object.
 *      Not a directive (bad JSON / no reserved `__kind`) → raw <pre>, never throws.
 *   2. `getDirectiveRenderer(directive)` → exact slug, else the CLASS prefix
 *      rule. Found → render it.
 *   3. None registered → the neutral fallback card (never null, never silent).
 *
 * Position decides capability, and the decoder already computed it from the
 * class: in content only `reference`/`secret` resolve to a live value; a
 * side-effect directive in prose is shown as a card with an explicit Apply,
 * never executed on sight.
 *
 * WHAT THIS REPLACED. Until 2026-08-25 detection was `"matrx_version" in value`
 * — the retired shell's sentinel. aidream had been minting the two-key shell in
 * production since 2026-08-23, so every server-minted reference fence failed
 * recognition here and fell to the raw <pre> branch: users saw raw JSON where a
 * reference chip belonged. Detection now reads the `__kind` the shape actually
 * carries, which is the same key every other kind instance carries.
 *
 * Grammar + decoder: features/content-ir/directives/.
 */

import React from "react";

import { tryDecodeDirective } from "@/features/content-ir/directives/decode";
import { EnvelopeFallbackCard } from "@/features/matrx-envelope/EnvelopeFallbackCard";
import { getDirectiveRenderer } from "@/features/matrx-envelope/registry";
import { captureError } from "@/lib/diagnostics/errorCaptureStore";

interface MatrxEnvelopeBlockProps {
  /** The raw fence body (JSON string) or an already-parsed shell. */
  content: unknown;
}

function parseContent(content: unknown): unknown {
  if (typeof content !== "string") return content;
  try {
    return JSON.parse(content) as unknown;
  } catch {
    return null;
  }
}

const MatrxEnvelopeBlock: React.FC<MatrxEnvelopeBlockProps> = ({ content }) => {
  // 1. Recognize the shell. A directive that claims the reserved namespace but
  //    cannot be honored is reported (never swallowed) and falls to raw text —
  //    a render seam must not take a whole message block down over one fence.
  const directive = tryDecodeDirective(parseContent(content), (message) => {
    console.error(`[kind-directives] ${message}`);
    captureError({
      source: "content-ir",
      message: `[kind-directives] ${message}`,
      callSite: "MatrxEnvelopeBlock",
      hint: "The emitter minted a slug outside the directive_v<version>_<class>_<noun> grammar.",
    });
  });

  if (!directive) {
    const raw =
      typeof content === "string" ? content : JSON.stringify(content, null, 2);
    return (
      <pre className="my-3 overflow-x-auto rounded-md border border-border bg-muted px-3 py-2 text-xs text-muted-foreground">
        {raw}
      </pre>
    );
  }

  // 2. Route by slug, then by the class prefix rule.
  const Renderer = getDirectiveRenderer(directive);
  if (Renderer) {
    return <Renderer directive={directive} />;
  }

  // 3. The prefix floor — an unregistered shape is still shown, never dropped.
  //    A REGISTERED renderer must degrade to this same card rather than return
  //    null: step 2 renders a found renderer's output verbatim, so a null there
  //    deletes the message block outright (see EnvelopeFallbackCard).
  return <EnvelopeFallbackCard directive={directive} />;
};

export default MatrxEnvelopeBlock;
