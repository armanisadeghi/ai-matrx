"use client";

import { useEffect } from "react";

export const FASTFIRE_QA_AUDIO_QUERY_KEY = "matrxQaAudio";
export const FASTFIRE_QA_AUDIO_QUERY_VALUE =
  "fastfire-browser-audio-fixture-v1";

interface QaAudioActivationInput {
  nodeEnv: string | undefined;
  hostname: string;
  search: string;
}

export function shouldInstallFastFireLocalQaAudioFixture({
  nodeEnv,
  hostname,
  search,
}: QaAudioActivationInput): boolean {
  if (nodeEnv !== "development") return false;
  if (hostname !== "localhost" && hostname !== "127.0.0.1") return false;
  return (
    new URLSearchParams(search).get(FASTFIRE_QA_AUDIO_QUERY_KEY) ===
    FASTFIRE_QA_AUDIO_QUERY_VALUE
  );
}

interface QaAudioController {
  restore: () => Promise<void>;
}

export function useFastFireLocalQaAudioFixture(): void {
  useEffect(() => {
    if (
      !shouldInstallFastFireLocalQaAudioFixture({
        nodeEnv: process.env.NODE_ENV,
        hostname: window.location.hostname,
        search: window.location.search,
      })
    ) {
      return;
    }

    let disposed = false;
    let controller: QaAudioController | null = null;

    void import("./browserAudioFixture.mjs")
      .then(({ installFastFireBrowserAudioFixture }) => {
        if (disposed) return;
        controller = installFastFireBrowserAudioFixture(window);
      })
      .catch((error: unknown) => {
        console.error("[fastfire.qa-audio] fixture activation failed:", error);
      });

    return () => {
      disposed = true;
      if (controller) void controller.restore();
    };
  }, []);
}
