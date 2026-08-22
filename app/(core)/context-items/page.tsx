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
            ariaLabel="Back"
          />
          <h1 className="ml-2 text-sm font-medium text-foreground truncate">
            All context items
          </h1>
        </div>
      </PageHeader>
      <div className="h-full overflow-hidden">
        <div className="h-full overflow-y-auto bg-textured">
          <div className="max-w-[1800px] mx-auto px-4 pb-6 pt-[calc(var(--shell-header-h)+1.5rem)] sm:px-6 lg:px-8 md:pb-8 md:pt-[calc(var(--shell-header-h)+2rem)]">
            <AllContextItemsHub />
          </div>
        </div>
      </div>
    </>
  );
}
