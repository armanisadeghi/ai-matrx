"use client";

/**
 * SettingsRouteSidebar — thin front door (MarkdownStream pattern, right-way experiment).
 * ONE dynamic({ssr:false}) edge; everything inside (SettingsRouteSidebarImpl) is a single
 * statically-imported piece built once.
 */

import React from "react";
import dynamic from "next/dynamic";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";

const SettingsRouteSidebarImplLazy = dynamic(
  () =>
    import("./SettingsRouteSidebarImpl").then((m) => ({
      default: m.SettingsRouteSidebarImpl,
    })),
  {
    ssr: false,
    loading: () => (
      <div className="p-4">
        <SuspenseLoader
          centered={false}
          size="xs"
          message="Loading settings sections…"
        />
      </div>
    ),
  },
);

export function SettingsRouteSidebar(
  props: React.ComponentProps<typeof SettingsRouteSidebarImplLazy>,
) {
  return <SettingsRouteSidebarImplLazy {...props} />;
}
