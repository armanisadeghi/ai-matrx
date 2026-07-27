"use client";

/**
 * SettingsRouteSidebar — thin front door (MarkdownStream pattern, right-way experiment).
 * ONE dynamic({ssr:false}) edge; everything inside (SettingsRouteSidebarImpl) is a single
 * statically-imported piece built once.
 */

import React from "react";
import dynamic from "next/dynamic";

const SettingsRouteSidebarImplLazy = dynamic(
  () => import("./SettingsRouteSidebarImpl").then((m) => ({ default: m.SettingsRouteSidebarImpl })),
  { ssr: false, loading: () => null },
);

export function SettingsRouteSidebar(
  props: React.ComponentProps<typeof SettingsRouteSidebarImplLazy>,
) {
  return <SettingsRouteSidebarImplLazy {...props} />;
}
