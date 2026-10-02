"use client";
// Next binding (slice P10): the dynamic() front doors moved verbatim from the package call sites.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";
import type { ScrollAssistantLauncherImplProps } from "../../agents/components/ambient-assistant/ScrollAssistantLauncherImpl";

export const ScrollAssistantLauncherImpl = dynamic<ScrollAssistantLauncherImplProps>(
  () => import("../../agents/components/ambient-assistant/ScrollAssistantLauncherImpl"),
  {
    ssr: false,
    // A prop-blind loading shell would jump between the two supported heights.
    // Reveal the correctly sized implementation once its chunk is ready.
    loading: () => null,
  },
);

export const ScrollVoiceAssistantLauncherImpl = dynamic(
  () => import("../../agents/components/ambient-assistant/ScrollVoiceAssistantLauncherImpl"),
  {
    ssr: false,
    loading: () => null,
  },
);
