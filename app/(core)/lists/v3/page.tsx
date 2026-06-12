import { PicklistManagerV3Client } from "@/features/udt-picklist/PicklistManagerV3Client";


export default function PicklistsV3Page() {
  return (
    <div className="h-[calc(100dvh-var(--header-height))] flex flex-col overflow-hidden">
      <PicklistManagerV3Client />
    </div>
  );
}
