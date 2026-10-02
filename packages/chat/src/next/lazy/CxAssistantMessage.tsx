"use client";
// Next binding (slice P10): the dynamic() front door moved verbatim from the package call site.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";

export const AssistantMessage = dynamic(
  () =>
    import("../../cx-conversation/AssistantMessage").then(
      (m) => m.AssistantMessage,
    ),
  { ssr: false },
);
