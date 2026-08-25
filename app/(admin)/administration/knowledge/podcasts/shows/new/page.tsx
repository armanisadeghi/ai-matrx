import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { ShowDetailClient } from "@/features/podcasts/components/admin/ShowDetailClient";

export const metadata = { title: "New Podcast Show" };

export default function NewShowPage() {
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader
              centered={false}
              message="Loading new-show editor…"
            />
          </div>
        }
      >
        <ShowDetailClient showId="new" />
      </Suspense>
    </div>
  );
}
