"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const ImageStudioShell = dynamic(
  () =>
    import("@/features/image-studio/components/ImageStudioShell").then((m) => ({
      default: m.ImageStudioShell,
    })),
  {
    ssr: false,
    loading: () => <ConvertShellSkeleton />,
  },
);

export default function ImageStudioShellClient({
  defaultFolder,
}: {
  defaultFolder?: string;
}) {
  return <ImageStudioShell defaultFolder={defaultFolder} />;
}

function ConvertShellSkeleton() {
  return (
    <div className="flex h-full min-h-0">
      <div className="hidden md:flex flex-col w-72 lg:w-80 xl:w-96 border-r border-border bg-card/30 min-h-0 p-3 gap-2">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-4 w-24" />
        <div className="space-y-1 pt-2">
          {Array.from({ length: 8 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-md" />
          ))}
        </div>
      </div>
      <div className="flex-1 min-w-0 flex flex-col min-h-0 overflow-y-auto p-3 md:p-5 space-y-4">
        <Skeleton className="h-[220px] md:h-[260px] w-full rounded-lg md:rounded-2xl" />
      </div>
      <div className="hidden lg:flex flex-col w-80 xl:w-96 min-h-0 border-l border-border p-3 gap-3">
        <Skeleton className="h-8 w-32" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-14 w-full" />
        <Skeleton className="h-10 w-full mt-auto" />
        <Skeleton className="h-10 w-full" />
      </div>
    </div>
  );
}
