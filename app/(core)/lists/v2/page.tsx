import { PicklistManagerV2 } from "@/features/udt-picklist/PicklistManagerV2";
import { PicklistEditorHeader } from "@/features/udt-picklist/PicklistEditorHeader";

export default function PicklistsV2Page() {
  return (
    <>
      <PicklistEditorHeader />
      <div className="h-full flex flex-col overflow-hidden">
        <PicklistManagerV2 />
      </div>
    </>
  );
}
