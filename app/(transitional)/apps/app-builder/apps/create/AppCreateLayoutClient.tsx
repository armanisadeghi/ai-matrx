"use client";

import { ReactNode } from "react";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";

export default function AppCreateLayoutClient({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <StructuredSectionCard
      title="Create New App"
      description="Configure your new app for your users."
      className="w-full my-4"
    >
      <div className="px-1 py-2">{children}</div>
    </StructuredSectionCard>
  );
}
