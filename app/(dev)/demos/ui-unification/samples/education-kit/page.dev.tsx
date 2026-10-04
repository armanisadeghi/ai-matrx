import { Suspense } from "react";
import { EducationKitSample } from "./_components/EducationKitSample";

/** Sample: /education/kits/[sourceId] — the real page (`KitHub`) with the owner's four fixes (`?id=`). */
export default function EducationKitSamplePage() {
  return (
    <Suspense>
      <EducationKitSample />
    </Suspense>
  );
}
