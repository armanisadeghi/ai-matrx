import { Suspense } from "react";
import SuspenseLoader from "@/components/loaders/SuspenseLoader";
import { ShowDetailClient } from "@/features/podcasts/components/admin/ShowDetailClient";

interface Props {
  params: Promise<{ showId: string }>;
}

export default async function ShowDetailPage({ params }: Props) {
  const { showId } = await params;
  return (
    <div className="h-[calc(100dvh-2.5rem)] flex flex-col overflow-hidden">
      <Suspense
        fallback={
          <div className="flex-1 flex items-center justify-center text-muted-foreground text-sm">
            <SuspenseLoader centered={false} message="Loading podcast show…" />
          </div>
        }
      >
        <ShowDetailClient showId={showId} />
      </Suspense>
    </div>
  );
}
