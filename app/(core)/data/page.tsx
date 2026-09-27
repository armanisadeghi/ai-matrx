// app/(core)/data/page.tsx — the /data list. After the final switch (lane FINAL-SWITCH) it lands on
// the new tables page, /data-v2, for everyone; until then it is the older list as before.
import { redirect } from "next/navigation";

import { readFinalSwitchState } from "@/features/administration/final-switch/finalSwitchState.server";
import DataHomeClient from "./DataHomeClient";

export default async function UserGeneratedDataPage() {
  const state = await readFinalSwitchState();
  if (state?.data_screen === "new") redirect("/data-v2");
  return <DataHomeClient />;
}
