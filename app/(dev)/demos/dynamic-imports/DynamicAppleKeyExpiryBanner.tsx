"use client";

import dynamic from "next/dynamic";

const AppleKeyExpiryBanner = dynamic(
    () => import("@/components/admin/AppleKeyExpiryBanner"),
    { ssr: false }
);

export function DynamicAppleKeyExpiryBanner() {
    return <AppleKeyExpiryBanner />;
}
