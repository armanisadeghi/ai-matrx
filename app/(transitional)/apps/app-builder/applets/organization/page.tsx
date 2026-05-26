"use client";

import React from "react";
import { useRouter } from "next/navigation";
import SmartAppletList from "@/features/applet/builder/modules/smart-parts/applets/SmartAppletList";
import { CustomAppletConfig } from "@/types/customAppTypes";

export default function AppletsPage() {
  const router = useRouter();

  const handleViewApplet = (applet: CustomAppletConfig) => {
    router.push(`/apps/app-builder/applets/${applet.id}`);
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <SmartAppletList onSelectApplet={handleViewApplet} />
    </div>
  );
}
