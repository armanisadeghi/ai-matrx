"use client";

import { Suspense } from "react";
import { useRouter } from "next/navigation";
import { ContextItemForm } from "@/features/agent-context/components/ContextItemForm";
import {
  useCreateContextItem,
  useCreateContextValue,
} from "@/features/agent-context/hooks/useContextItems";
import { useContextScope } from "@/features/agent-context/hooks/useContextScope";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ContextItemFormData,
  ContextValueFormData,
} from "@/features/agent-context/types";

export default function NewItemPage() {
  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <NewItemContent />
    </Suspense>
  );
}

function NewItemContent() {
  const router = useRouter();
  const { scope } = useContextScope();
  const createItem = useCreateContextItem(scope.scopeType, scope.scopeId);
  const createValue = useCreateContextValue(scope.scopeType, scope.scopeId);

  const handleSave = (
    formData: ContextItemFormData,
    valueData: ContextValueFormData,
  ) => {
    createItem.mutate(formData, {
      onSuccess: (newItem) => {
        const hasValue =
          valueData.value_text ||
          valueData.value_number != null ||
          valueData.value_boolean != null ||
          valueData.value_json ||
          valueData.value_document_url ||
          valueData.value_reference_id;
        if (hasValue) {
          createValue.mutate(
            { itemId: newItem.id, valueData },
            {
              onSuccess: () => router.push(`/app-context/items/${newItem.id}`),
            },
          );
        } else {
          router.push(`/app-context/items/${newItem.id}`);
        }
      },
    });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-base font-bold">Create Context Item</h1>
      <ContextItemForm
        onSave={handleSave}
        isPending={createItem.isPending || createValue.isPending}
      />
    </div>
  );
}
