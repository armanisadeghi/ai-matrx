"use client";

// All context items across every organization the user belongs to.
import { useRouter } from "next/navigation";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import { AllContextItemsHub } from "@/features/scope-system/components/ContextItemsHub";

export default function AllContextItemsPage() {
  const router = useRouter();

  return (
    <>
      <PageHeader>
        <div className="flex items-center w-full min-w-0 gap-0 p-0">
          <ChevronLeftTapButton
            onClick={() => router.back()}
            variant="transparent"
            ariaLabel="Back"
          />
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            All context items
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto bg-textured">
          <div className="max-w-4xl mx-auto p-6 md:p-8">
            <AllContextItemsHub />
          </div>
        </div>
      </div>
    </>
  );
}
