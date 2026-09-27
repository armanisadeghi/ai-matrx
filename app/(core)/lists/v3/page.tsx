import { StructuredListManagerV3Client } from "@/features/structured-lists/StructuredListManagerV3Client";
import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";

export default function PicklistsV3Page() {
  return (
    <>
      <StructuredListEditorHeader />
      {/* BELOW THE GLASS HEADER, FILLING THE PAGE (lane HANDOVER, 2026-09-27): the body started at
          the top of the window, so the rail's New picklist button sat under the header where no
          click reaches it, the open list's title was cut in half, and a fixed-height grid left a
          band of empty page below it. */}
      <div className="h-full flex flex-col overflow-hidden px-3 pb-3 pt-[calc(var(--shell-header-h)+0.5rem)]">
        <StructuredListManagerV3Client />
      </div>
    </>
  );
}
