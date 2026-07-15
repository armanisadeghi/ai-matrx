import { StudioDashboard } from "@/features/podcasts/studio/components/StudioDashboard";
import PageHeader from "@/features/shell/components/header/PageHeader";


export default function PodcastStudioPage() {
  return (
    <>
      <PageHeader>
        <span className="ml-2 text-sm font-medium text-foreground truncate">Podcast Studio</span>
      </PageHeader>
      <div className="h-full w-full overflow-y-auto overscroll-contain bg-textured">
        <StudioDashboard />
      </div>
    </>
  );
}
