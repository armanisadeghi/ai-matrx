import { StudioDashboard } from "@/features/podcasts/studio/components/StudioDashboard";
import { ChevronLeftTapButton } from "@/components/icons/tap-buttons";
import RouteHeader from "@/features/shell/components/header/RouteHeader";

export default function PodcastStudioPage() {
  return (
    <>
      <RouteHeader
        left={
          <>
            <ChevronLeftTapButton
              href="/podcast"
              ariaLabel="Back to podcasts"
              variant="transparent"
            />
            <span className="min-w-0 truncate text-sm font-medium text-foreground">
              Podcast Studio
            </span>
          </>
        }
      />
      <div className="h-full w-full overflow-hidden bg-textured">
        <div className="h-full overflow-y-auto overscroll-contain">
          <StudioDashboard />
        </div>
      </div>
    </>
  );
}
