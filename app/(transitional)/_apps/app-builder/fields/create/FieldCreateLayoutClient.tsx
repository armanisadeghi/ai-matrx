"use client";

import { ReactNode } from "react";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";

export default function FieldCreateLayoutClient({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <StructuredSectionCard
      title="Create New Field Component"
      description="Configure your new field component for reuse throughout your applications."
      className="w-full my-4"
    >
      <div className="px-1 py-2">{children}</div>
    </StructuredSectionCard>
  );
}
