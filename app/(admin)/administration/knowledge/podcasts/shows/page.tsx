import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { ShowsClient } from "@/features/podcasts/components/admin/ShowsClient";

export const metadata = { title: "Podcast Shows" };

export default function PodcastShowsPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader centered={false} message="Loading podcast shows…" />
          </div>
        }
      >
        <ShowsClient />
      </Suspense>
    </div>
  );
}
