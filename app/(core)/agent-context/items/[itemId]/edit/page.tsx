"use client";

import { use, Suspense } from "react";
import { useRouter } from "next/navigation";
import { ContextItemForm } from "@/features/agent-context/components/ContextItemForm";
import {
  useContextItem,
  useContextItemValue,
  useUpdateContextItem,
  useCreateContextValue,
} from "@/features/agent-context/hooks/useContextItems";
import { useContextScope } from "@/features/agent-context/hooks/useContextScope";
import { Skeleton } from "@/components/ui/skeleton";
import type {
  ContextItemFormData,
  ContextValueFormData,
} from "@/features/agent-context/types";

export default function EditItemPage({
  params,
}: {
  params: Promise<{ itemId: string }>;
}) {
  const { itemId } = use(params);

  return (
    <Suspense fallback={<Skeleton className="h-96" />}>
      <EditItemContent itemId={itemId} />
    </Suspense>
  );
}

function EditItemContent({ itemId }: { itemId: string }) {
  const router = useRouter();
  const { scope } = useContextScope();
  const { data: item, isLoading: itemLoading } = useContextItem(itemId);
  const { data: value, isLoading: valueLoading } = useContextItemValue(
    itemId,
    scope.scopeId,
  );
  const updateItem = useUpdateContextItem(scope.scopeType, scope.scopeId);
  const createValue = useCreateContextValue(scope.scopeType, scope.scopeId);

  if (itemLoading || valueLoading) return <Skeleton className="h-96" />;

  const handleSave = (
    formData: ContextItemFormData,
    valueData: ContextValueFormData,
  ) => {
    updateItem.mutate(
      { itemId, updates: formData },
      {
        onSuccess: () => {
          const hasValue =
            valueData.value_text ||
            valueData.value_number != null ||
            valueData.value_boolean != null ||
            valueData.value_date ||
            valueData.value_json ||
            valueData.value_document_url ||
            valueData.value_reference_id;
          if (hasValue) {
            createValue.mutate(
              { itemId, valueData },
              {
                onSuccess: () => router.push(`/agent-context/items/${itemId}`),
              },
            );
          } else {
            router.push(`/agent-context/items/${itemId}`);
          }
        },
      },
    );
  };

  return (
    <div className="space-y-4">
      <h1 className="text-base font-bold">Edit: {item?.display_name}</h1>
      <ContextItemForm
        item={item}
        value={value}
        defaultScopeTypeId={scope.scopeTypeId ?? null}
        onSave={handleSave}
        isPending={updateItem.isPending || createValue.isPending}
      />
    </div>
  );
}
