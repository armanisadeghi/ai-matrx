"use client";
import React from "react";
import { TextCursorInput, Section, LayoutPanelLeft, AppWindow } from "lucide-react";
import { CardGrid } from "@/components/official/cards/CardGrid";

const builderCards = [
    {
        title: "Apps",
        description: "Combine applets into complete applications for your users",
        href: "/apps/app-builder/apps",
        icon: <AppWindow className="h-12 w-12" />,
        descriptionClassName: "text-sm"
    },
    {
        title: "Applets",
        description: "Design functional components that connect to data and services",
        href: "/apps/app-builder/applets",
        icon: <LayoutPanelLeft className="h-12 w-12" />,
        descriptionClassName: "text-sm"
    },
    {
        title: "Containers",
        description: "Create groups of fields and organize them into containers",
        href: "/apps/app-builder/containers",
        icon: <Section className="h-12 w-12" />,
        descriptionClassName: "text-sm"
    },
    {
        title: "Fields",
        description: "Build and manage reusable form fields for your applications",
        href: "/apps/app-builder/fields",
        icon: <TextCursorInput className="h-12 w-12" />,
        descriptionClassName: "text-sm"
    },
];

export default function AppBuilderPage() {
    return (
        <CardGrid
            title="Application Builder Overview"
            description="Welcome to the Application Builder. Select a component type to start building your application."
            cards={builderCards}
            columns={2}
            headerClassName="text-left pb-6"
        />
    );
}