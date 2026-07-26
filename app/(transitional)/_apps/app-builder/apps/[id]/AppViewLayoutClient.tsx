"use client";

import React, { ReactNode } from "react";
import StructuredSectionCard from "@/components/official/StructuredSectionCard";
import { useAppSelector } from "@/lib/redux/hooks";
import { selectAppName } from "@/lib/redux/app-builder/selectors/appSelectors";
import { Button } from "@/components/ui/button";
import { Pencil } from "lucide-react";
import { useRouter } from "next/navigation";

export default function AppViewLayoutClient({
  children,
  params,
}: {
  children: ReactNode;
  params: Promise<{ id: string }>;
}) {
  // Use React.use() to unwrap the params Promise
  const resolvedParams = React.use(params);
  const { id } = resolvedParams;

  const router = useRouter();
  const appName = useAppSelector((state) => selectAppName(state, id)) || "App";

  const handleEdit = () => {
    router.push(`/apps/app-builder/apps/${id}/edit`);
  };

  return (
    <StructuredSectionCard
      title={`${appName}`}
      description="App details and configuration"
      className="w-full my-4"
      headerActions={[
        <Button key="edit" size="sm" onClick={handleEdit}>
          <Pencil className="w-4 h-4 mr-2" />
          Edit App
        </Button>,
      ]}
    >
      <div className="px-1 py-2">{children}</div>
    </StructuredSectionCard>
  );
}
