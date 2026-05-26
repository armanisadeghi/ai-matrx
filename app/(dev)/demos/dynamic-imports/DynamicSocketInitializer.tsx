"use client";

import dynamic from "next/dynamic";

const SocketInitializer = dynamic(
    () => import("@/lib/redux/socket-io/connection/SocketInitializer").then((m) => m.default),
    { ssr: false }
);

export function DynamicSocketInitializer() {
    return <SocketInitializer />;
}
