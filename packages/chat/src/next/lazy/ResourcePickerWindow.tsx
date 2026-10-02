"use client";
// Next binding (slice P10): the dynamic() front door moved verbatim from the package call site.
// `next/dynamic` is imported here, literally, so Next's transform still applies.

import dynamic from "next/dynamic";

export const ResourcePickerWindow = dynamic(
  () =>
    import("@host/features/window-panels/windows/ResourcePickerWindow").then(
      (m) => ({ default: m.ResourcePickerWindow }),
    ),
  { ssr: false },
);
