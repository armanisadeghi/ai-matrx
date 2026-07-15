import { PicklistManagerV1Client } from "@/features/udt-picklist/PicklistManagerV1Client";
import { PicklistEditorHeader } from "@/features/udt-picklist/PicklistEditorHeader";

export default function PicklistsV1Page() {
  return (
    <>
      <PicklistEditorHeader />
      <div className="h-full overflow-hidden p-4">
        <PicklistManagerV1Client />
      </div>
    </>
  );
}
