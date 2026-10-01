import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";

export const metadata = createRouteMetadata("/settings", {
    title: "Settings",
    description: "Manage your account and preferences",
});

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    // The menu is the shell sidebar's "Account" route menu
    // (features/settings/route-menu/AccountSettingsRouteMenu).
    return children;
}
