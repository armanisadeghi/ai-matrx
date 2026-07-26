"use client";

import React from "react";
import { useRouter } from "next/navigation";
import SmartGroupList from "@/features/applet/builder/modules/smart-parts/containers/SmartContainerList";
import { ComponentGroup } from "@/types/customAppTypes";

export default function ContainersPage() {
  const router = useRouter();

  const handleViewContainer = (container: ComponentGroup) => {
    router.push(`/apps/app-builder/containers/${container.id}`);
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <SmartGroupList onSelectGroup={handleViewContainer} />
    </div>
  );
}
