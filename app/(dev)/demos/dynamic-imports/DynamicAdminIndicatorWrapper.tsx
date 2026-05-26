"use client";

import dynamic from "next/dynamic";

const AdminIndicatorWrapper = dynamic(
    () => import("@/components/admin/controls/AdminIndicatorWrapper"),
    { ssr: false }
);

export function DynamicAdminIndicatorWrapper() {
    return <AdminIndicatorWrapper />;
}
