"use client";

import dynamic from "next/dynamic";

const MessagingInitializer = dynamic(
    () => import("@/features/messaging/components/MessagingInitializer").then((m) => m.MessagingInitializer),
    { ssr: false }
);

const MessagingSideSheet = dynamic(
    () => import("@/features/messaging/components/MessagingSideSheet").then((m) => m.MessagingSideSheet),
    { ssr: false }
);

export function DynamicMessagingInitializer() {
    return <MessagingInitializer />;
}

export function DynamicMessagingSideSheet() {
    return <MessagingSideSheet />;
}
