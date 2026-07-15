import { StructuredListManagerV1Client } from "@/features/structured-lists/StructuredListManagerV1Client";
import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";

export default function PicklistsV1Page() {
  return (
    <>
      <StructuredListEditorHeader />
      <div className="h-full overflow-hidden p-4">
        <StructuredListManagerV1Client />
      </div>
    </>
  );
}
