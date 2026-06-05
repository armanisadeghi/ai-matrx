import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import SandboxesLanding from "@/features/auth/components/module-landing/landings/SandboxesLanding";
import { getServerAuth } from "@/utils/supabase/getServerAuth";

export const metadata = createRouteMetadata("/sandbox", {
    title: "Sandboxes",
    description: "Manage ephemeral sandbox environments for your projects",
});

/**
 * Server-side auth branch keeps the heavy `"use client"` sandbox page
 * (and its Redux + container-management bundle) from shipping to guests.
 * Guests see the marketing landing; authed users get the workspace tree.
 */
export default async function SandboxLayout({ children }: { children: React.ReactNode }) {
    const { isAuthenticated } = await getServerAuth();
    if (!isAuthenticated) return <SandboxesLanding />;
    return children;
}
