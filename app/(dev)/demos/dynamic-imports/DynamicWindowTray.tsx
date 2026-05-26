"use client";

import dynamic from "next/dynamic";

const WindowTray = dynamic(
  () => import("@/features/window-panels/WindowTray"),
  { ssr: false },
);

export function DynamicWindowTray() {
  return <WindowTray />;
}
