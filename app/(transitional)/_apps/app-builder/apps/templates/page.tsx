"use client";

import React from "react";
import { useRouter } from "next/navigation";
import SmartAppList from "@/features/applet/builder/modules/smart-parts/apps/SmartAppList";
import { CustomAppConfig } from "@/types/customAppTypes";

export default function AppsListPage() {
  const router = useRouter();

  const handleViewApp = (app: CustomAppConfig) => {
    router.push(`/apps/app-builder/apps/${app.id}`);
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <SmartAppList onSelectApp={handleViewApp} />
    </div>
  );
}
