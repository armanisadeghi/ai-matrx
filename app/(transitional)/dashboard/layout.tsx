import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/dashboard", {
    title: "Dashboard",
    description: "Your central hub for all activities and insights",
});

export default function DashboardLayout({ children }: { children: React.ReactNode }) {
    return children;
}
