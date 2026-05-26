"use client";

import dynamic from "next/dynamic";

const WindowTraySync = dynamic(
  () => import("@/features/window-panels/WindowTraySync"),
  { ssr: false },
);

export function DynamicWindowTraySync() {
  return <WindowTraySync />;
}
