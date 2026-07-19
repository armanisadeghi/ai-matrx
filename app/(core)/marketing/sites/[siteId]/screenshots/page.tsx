import { Suspense } from "react";
import { ScreenshotGallery } from "@/features/marketing/components/inspection/ScreenshotGallery";
import { LoadingSurface } from "@/features/marketing/components/shared/MarketingUi";

export default function MarketingSiteScreenshotsPage() {
  return (
    <Suspense fallback={<LoadingSurface label="Loading screenshots…" />}>
      <ScreenshotGallery />
    </Suspense>
  );
}
