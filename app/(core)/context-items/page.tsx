"use client";

// All context items across every organization the user belongs to.
import { AllContextItemsHub } from "@/features/scope-system/components/ContextItemsHub";

export default function AllContextItemsPage() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-y-auto bg-textured">
      <div className="max-w-4xl mx-auto p-6 md:p-8">
        <AllContextItemsHub />
      </div>
    </div>
  );
}
