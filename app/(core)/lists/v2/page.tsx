import { PicklistManagerV2 } from "@/features/udt-picklist/PicklistManagerV2";


export default function PicklistsV2Page() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <PicklistManagerV2 />
    </div>
  );
}
