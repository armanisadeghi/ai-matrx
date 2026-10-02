import type React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/devices", {
  title: "Devices",
  description: "Your computers — terminal and files from anywhere",
  letter: "DK",
});

export default function DevicesLayout({ children }: { children: React.ReactNode }) {
  return children;
}
