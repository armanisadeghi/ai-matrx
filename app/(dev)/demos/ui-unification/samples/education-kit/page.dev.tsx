import { Suspense } from "react";
import { EducationKitSample } from "./_components/EducationKitSample";

/** Sample: /education/kits/[sourceId] rebuilt on the 28px system, real kit data (`?id=`). */
export default function EducationKitSamplePage() {
  return (
    <Suspense>
      <EducationKitSample />
    </Suspense>
  );
}
