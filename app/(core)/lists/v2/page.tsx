import { redirect } from "next/navigation";

import { readFinalSwitchState } from "@/features/administration/final-switch/finalSwitchState.server";
import { StructuredListManagerV2 } from "@/features/structured-lists/StructuredListManagerV2";
import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";

export default async function PicklistsV2Page() {
  // FINAL-SWITCH: after the final switch the older list managers land on the current one, /lists/v3.
  const state = await readFinalSwitchState();
  if (state?.state === "new") redirect("/lists/v3");
  return (
    <>
      <StructuredListEditorHeader />
      <div className="h-full flex flex-col overflow-hidden pt-[var(--shell-header-h)]">
        <StructuredListManagerV2 />
      </div>
    </>
  );
}
