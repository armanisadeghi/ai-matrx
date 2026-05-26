import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import SettingsLayoutClient from "./SettingsLayoutClient";

export const metadata = createRouteMetadata("/settings", {
    title: "Settings",
    description: "Manage your account and preferences",
});

export default function SettingsLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <SettingsLayoutClient>{children}</SettingsLayoutClient>;
}
