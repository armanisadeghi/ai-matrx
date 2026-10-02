"use client";
// Next binding (slice P10): the dynamic() front doors moved verbatim from the package call sites.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";

export const GuidedVariableInputs = dynamic(
  () =>
    import("../../public-chat/components/GuidedVariableInputs").then(
      (m) => ({ default: m.GuidedVariableInputs }),
    ),
  { ssr: false },
);

export const PublicVariableInputs = dynamic(
  () =>
    import("../../public-chat/components/PublicVariableInputs").then(
      (m) => ({ default: m.PublicVariableInputs }),
    ),
  { ssr: false },
);
