"use client";
// Next binding (slice P10): the dynamic() front doors moved verbatim from the package call sites.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";

export const GuidedVariableInputs = dynamic(
  () =>
    import("../../cx-chat/components/user-input/GuidedVariableInputs").then(
      (m) => ({ default: m.GuidedVariableInputs }),
    ),
  { ssr: false },
);

export const StackedVariableInputs = dynamic(
  () =>
    import("../../cx-chat/components/user-input/StackedVariableInputs").then(
      (m) => ({ default: m.StackedVariableInputs }),
    ),
  { ssr: false },
);
