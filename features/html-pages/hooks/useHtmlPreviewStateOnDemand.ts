"use client";

// The `useHtmlPreviewState` the chat package's HtmlPreviewBridge calls (registered in
// providers/chatUiRegistration.ts, which every signed-in route loads). The real hook carries
// @ai-matrx/print/markdown and with it KaTeX (~680 KB); this door loads it the first time a preview
// opens. Until then the bridge suspends into its overlay's loading state (lazyOverlay), and after
// that every render reads the cached module synchronously. Guard: pnpm check:shell-eager-graph.
import { use } from "react";
import type { HtmlPreviewHookProps } from "../components/types";

type HookModule = typeof import("./useHtmlPreviewState");

let loading: Promise<HookModule> | null = null;

function loadHook(): Promise<HookModule> {
  loading ??= import("./useHtmlPreviewState").catch((error: unknown) => {
    // A failed chunk must be retryable on the next open, never cached as a permanent failure.
    loading = null;
    throw error;
  });
  return loading;
}

export function useHtmlPreviewStateOnDemand(
  props: HtmlPreviewHookProps,
): ReturnType<HookModule["useHtmlPreviewState"]> {
  const { useHtmlPreviewState } = use(loadHook());
  return useHtmlPreviewState(props);
}
