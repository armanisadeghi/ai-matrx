"use client";

/**
 * SettingsTabContent — thin front door (MarkdownStream pattern, right-way experiment).
 * ONE dynamic({ssr:false}) edge; everything inside (SettingsTabContentImpl) is a single
 * statically-imported piece built once.
 */

import React from "react";
import dynamic from "next/dynamic";

const SettingsTabContentImplLazy = dynamic(
  () => import("./SettingsTabContentImpl").then((m) => ({ default: m.SettingsTabContentImpl })),
  { ssr: false, loading: () => null },
);

export function SettingsTabContent(
  props: React.ComponentProps<typeof SettingsTabContentImplLazy>,
) {
  return <SettingsTabContentImplLazy {...props} />;
}
