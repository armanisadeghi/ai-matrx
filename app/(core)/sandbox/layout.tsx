import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/sandbox", {
    title: "Sandboxes",
    description: "Manage ephemeral sandbox environments for your projects",
});

export default function SandboxLayout({ children }: { children: React.ReactNode }) {
    return children;
}
