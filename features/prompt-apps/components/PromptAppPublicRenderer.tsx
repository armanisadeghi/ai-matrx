"use client";

/**
 * PromptAppPublicRenderer (shell)
 *
 * Lightweight client-only wrapper around `PromptAppPublicRendererImpl`. The
 * impl statically imports `@babel/standalone` (~5.7 MB uncompressed); this
 * shell keeps that heavy module out of the SSR bundle.
 *
 * NOTE: This entire prompt-apps subsystem is scheduled for removal in
 * migration phases 16-19 (see `features/agents/migration/`). When that
 * happens, delete both this shell AND the `*Impl` file.
 *
 * See `features/agent-apps/components/AgentAppPublicRenderer.tsx` for the
 * full rationale.
 */

import dynamic from "next/dynamic";

export const PromptAppPublicRenderer = dynamic(
  () =>
    import("./PromptAppPublicRendererDirectImpl").then((m) => ({
      default: m.PromptAppPublicRendererDirect,
    })),
  { ssr: false },
);
