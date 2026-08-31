"use client";

/**
 * SettingsTabContent — thin front door (MarkdownStream pattern, right-way experiment).
 * ONE dynamic({ssr:false}) edge; everything inside (SettingsTabContentImpl) is a single
 * statically-imported piece built once.
 */

import React from "react";
import dynamic from "next/dynamic";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";

const SettingsTabContentImplLazy = dynamic(
  () =>
    import("./SettingsTabContentImpl").then((m) => ({
      default: m.SettingsTabContentImpl,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="flex min-h-40 items-center justify-center p-6">
        <SuspenseLoader size="sm" message="Loading settings section…" />
      </div>
    ),
  },
);

export function SettingsTabContent(
  props: React.ComponentProps<typeof SettingsTabContentImplLazy>,
) {
  return <SettingsTabContentImplLazy {...props} />;
}
