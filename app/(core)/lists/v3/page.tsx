import { StructuredListManagerV3Client } from "@/features/structured-lists/StructuredListManagerV3Client";
import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";

export default function PicklistsV3Page() {
  return (
    <>
      <StructuredListEditorHeader />
      <div className="h-full flex flex-col overflow-hidden">
        <StructuredListManagerV3Client />
      </div>
    </>
  );
}
