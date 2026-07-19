import { StructuredListManagerV2 } from "@/features/structured-lists/StructuredListManagerV2";
import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";

export default function PicklistsV2Page() {
  return (
    <>
      <StructuredListEditorHeader />
      <div className="h-full flex flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <StructuredListManagerV2 />
      </div>
    </>
  );
}
