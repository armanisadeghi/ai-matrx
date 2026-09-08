"use client";

import dynamic from "next/dynamic";

const MessagingSideSheet = dynamic(
    () => import("@/features/messaging/components/MessagingSideSheet").then((m) => m.MessagingSideSheet),
    { ssr: false }
);

export function DynamicMessagingSideSheet() {
    return <MessagingSideSheet />;
}
