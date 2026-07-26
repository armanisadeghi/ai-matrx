"use client";

import { ReactNode } from "react";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";

export default function ContainerCreateLayoutClient({
  children,
}: {
  children: ReactNode;
}) {
  return (
    <StructuredSectionCard
      title="Create New Container"
      description="Configure your new field container for reuse throughout your applications."
      className="w-full my-4"
    >
      <div className="px-1 py-2">{children}</div>
    </StructuredSectionCard>
  );
}
