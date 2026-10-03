import { Suspense } from "react";
import { ProjectSettingsSample } from "./_components/ProjectSettingsSample";

/** Sample: /projects/[id]/settings rebuilt on the 28px system, real clone data. */
export default function ProjectSettingsSamplePage() {
  return (
    <Suspense>
      <ProjectSettingsSample />
    </Suspense>
  );
}
