"use client";

import dynamic from "next/dynamic";
import { Skeleton } from "@/components/ui/skeleton";

const Base64DecoderShell = dynamic(
  () =>
    import("@/features/image-studio/components/Base64DecoderShell").then(
      (m) => ({ default: m.Base64DecoderShell }),
    ),
  {
    ssr: false,
    loading: () => <ShellSkeleton />,
  },
);

export default function FromBase64ShellClient() {
  return <Base64DecoderShell />;
}

function ShellSkeleton() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-[1fr_minmax(360px,440px)] gap-3 md:gap-4 p-3 md:p-5 h-full min-h-0 overflow-y-auto lg:overflow-hidden">
      <div className="flex flex-col gap-3 min-h-0">
        <div className="flex items-center justify-between gap-2">
          <Skeleton className="h-5 w-40" />
          <Skeleton className="h-7 w-32" />
        </div>
        <Skeleton className="flex-1 min-h-[280px] w-full rounded-lg" />
      </div>
      <div className="flex flex-col gap-3 min-h-0">
        <Skeleton className="aspect-square w-full rounded-2xl" />
        <Skeleton className="h-16 w-full rounded-lg" />
        <Skeleton className="h-9 w-full rounded-md" />
        <Skeleton className="h-9 w-full rounded-md" />
      </div>
    </div>
  );
}
