"use client";

import React from "react";
import { useRouter } from "next/navigation";
import SmartFieldsList from "@/features/applet/builder/modules/smart-parts/fields/SmartFieldsList";
import { FieldDefinition } from "@/types/customAppTypes";

export default function FieldsPage() {
  const router = useRouter();

  const handleViewField = (field: FieldDefinition) => {
    router.push(`/apps/app-builder/fields/${field.id}`);
  };

  return (
    <div className="p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
      <SmartFieldsList onSelectField={handleViewField} />
    </div>
  );
}
