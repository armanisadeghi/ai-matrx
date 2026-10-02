"use client";
// Next binding (slice P10): the dynamic() front door moved verbatim from the package call site.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";

export const AgentAssistantMessage = dynamic(
  () =>
    import("../../agents/components/messages-display/assistant/AgentAssistantMessage").then(
      (m) => ({
        default: m.AgentAssistantMessage,
      }),
    ),
  { ssr: false },
);
