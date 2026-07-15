import { PicklistManagerV3Client } from "@/features/udt-picklist/PicklistManagerV3Client";
import { PicklistEditorHeader } from "@/features/udt-picklist/PicklistEditorHeader";

export default function PicklistsV3Page() {
  return (
    <>
      <PicklistEditorHeader />
      <div className="h-full flex flex-col overflow-hidden">
        <PicklistManagerV3Client />
      </div>
    </>
  );
}
