import { PicklistManagerV1Client } from "@/features/udt-picklist/PicklistManagerV1Client";


export default function PicklistsV1Page() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] overflow-hidden p-4">
      <PicklistManagerV1Client />
    </div>
  );
}
