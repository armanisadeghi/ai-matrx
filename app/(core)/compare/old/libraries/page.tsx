// Old Libraries list (/libraries, the Media Source Catalog front door, before
// H6b, 2026-09-27), review-only. LibrariesFrontDoor and its list config and
// service were deleted in H6b and are restored verbatim under ../_restored
// from 28aa6caa06^ (relative imports re-pointed to features/source-library).
import { LibrariesFrontDoor } from "../_restored/LibrariesFrontDoor";
import { HUB_LIBRARIES_HREF } from "@/features/knowledge/hub/legacyRoutes";
import { OldPageBanner } from "../_components/OldPageBanner";

export default function OldLibrariesPage() {
  return (
    <>
      <LibrariesFrontDoor />
      <OldPageBanner newHref={HUB_LIBRARIES_HREF} newLabel="Libraries in the Knowledge hub" />
    </>
  );
}
