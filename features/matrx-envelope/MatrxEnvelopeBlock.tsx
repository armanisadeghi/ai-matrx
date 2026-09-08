"use client";

/**
 * MatrxEnvelopeBlock — the in-content renderer for a ```matrx fence, and the
 * PREFIX-DEFAULT component for every `directive_v1_*` shape.
 *
 * SINCE 2026-09-08 THIS IS A THIN HOST WRAPPER. The pipeline it used to carry
 * — decode → registered renderer → side-effect card → the never-null floor —
 * is `DirectiveRender` from `@ai-matrx/content-ir-react/directives`, so every
 * AI Matrx client (this app, the dashboard, Workflow Studio, the extension)
 * draws a directive through ONE implementation instead of four that drift.
 *
 * This file does exactly two host jobs:
 *
 *   1. Import the host renderers module for its side effects, so this app's
 *      bespoke registrations (reference chips, plan trees, the context-groom
 *      receipt) are in the package registry before anything renders.
 *   2. Mount `DirectiveHostProvider` around the render. It is mounted HERE and
 *      not only on `ContentIrRenderProvider` because a ```matrx fence renders
 *      in trees that never adopted the render provider — and a directive that
 *      loses its Apply/open/copy seams because of where it was mounted is
 *      exactly the silent degradation the seams exist to prevent.
 *
 * Position decides capability, inside the package decoder: in content only
 * `reference`/`secret` resolve to a live value; a side-effect directive in
 * prose is a card with an explicit Apply, never executed on sight.
 */

import React from "react";
import {
  DirectiveHostProvider,
  DirectiveRender,
} from "@ai-matrx/content-ir-react";

import { matrxDirectiveHost } from "@/features/matrx-envelope/directiveHost";
// Side-effect import: the host-specific renderer registrations must have run
// before `DirectiveRender` consults the registry.
import "@/features/matrx-envelope/registry";

interface MatrxEnvelopeBlockProps {
  /** The raw fence body (JSON string) or an already-parsed shell. */
  content: unknown;
}

const MatrxEnvelopeBlock: React.FC<MatrxEnvelopeBlockProps> = ({ content }) => (
  <DirectiveHostProvider host={matrxDirectiveHost}>
    <DirectiveRender content={content} />
  </DirectiveHostProvider>
);

export default MatrxEnvelopeBlock;
