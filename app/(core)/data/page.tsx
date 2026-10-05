// app/(core)/data/page.tsx — the server half of /data.
//
// WHICH DATA HOME DRAWS FIRST IS DECIDED ON THE SERVER (lane DATA-PAGE-DEFECTS): the page used to
// render the old home until the browser's read of `custom.data_home_shell` landed (~2 s), then swap to
// the new one. The knob is read here, for the signed-in person, and handed down, so the right home is
// in the first paint. `?home=new|old` still decides one visit, and a server read that cannot answer
// hands down `undefined`, which the browser's own read then settles as before.

import { readEffectiveKnobOnServer } from "@/lib/scoped-config/effectiveKnobs.server";
import { DATA_HOME_SHELL_KNOB } from "@/features/unified-data/home/dataHomeKnobs";

import DataHomePageClient from "./DataHomePageClient";

export default async function DataHomeRoutePage() {
  const serverKnob = await readEffectiveKnobOnServer(DATA_HOME_SHELL_KNOB);
  return <DataHomePageClient serverKnob={serverKnob} />;
}
