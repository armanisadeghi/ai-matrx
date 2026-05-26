import React from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import MessagesLayoutClient from "./MessagesLayoutClient";

export const metadata = createRouteMetadata("/messages", {
    title: "Messages",
    description: "Direct messages and conversations",
});

export default function MessagesLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <MessagesLayoutClient>{children}</MessagesLayoutClient>;
}
