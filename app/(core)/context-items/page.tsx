"use client";

// All context items across every organization the user belongs to.
import { RecordPageHeader } from "@/features/shell/components/header/templates/RecordPageHeader";
import { AllContextItemsHub } from "@/features/scopes/components/pages/ContextItemsHub";

export default function AllContextItemsPage() {
  return (
    <>
      <RecordPageHeader
        backHref="/scopes"
        parents={[{ label: "Scopes", href: "/scopes" }]}
        record={{ name: "All context items" }}
      />
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
