// app/(core)/data/page.tsx — /data, the data home.
//
// One home: the list shell (features/unified-data/home/DataHomeShellPage.tsx, every screen from
// @ai-matrx/records-ui). The old hub, the knob `custom.data_home_shell` that chose between them and
// `?home=old` were removed after the switch's soak (lane ONE-HOME wave 4).

import { DataHomeRoute } from "@/features/unified-data/home/DataHomeRoute";

export default function DataHomeRoutePage() {
  return <DataHomeRoute />;
}
