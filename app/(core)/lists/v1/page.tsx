import { redirect } from "next/navigation";

import { readFinalSwitchState } from "@/features/administration/final-switch/finalSwitchState.server";
import { StructuredListManagerV1Client } from "@/features/structured-lists/StructuredListManagerV1Client";
import { StructuredListEditorHeader } from "@/features/structured-lists/StructuredListEditorHeader";

export default async function PicklistsV1Page() {
  // FINAL-SWITCH: after the final switch the older list managers land on the current one, /lists/v3.
  const state = await readFinalSwitchState();
  if (state?.state === "new") redirect("/lists/v3");
  return (
    <>
      <StructuredListEditorHeader />
      <div className="h-full overflow-hidden p-4">
        <StructuredListManagerV1Client />
      </div>
    </>
  );
}
