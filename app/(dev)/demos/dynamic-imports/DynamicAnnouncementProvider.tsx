"use client";

import dynamic from "next/dynamic";

const AnnouncementProvider = dynamic(
    () => import("@/components/layout/AnnouncementProvider"),
    { ssr: false }
);

export function DynamicAnnouncementProvider() {
    return <AnnouncementProvider />;
}
