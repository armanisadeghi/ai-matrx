import type { ReactNode } from "react";
import { createRouteMetadata } from "@/utils/route-metadata";
import PageHeader from "@/features/shell/components/header/PageHeader";
import { BrowseImageProvider } from "@/features/image-manager/browse/BrowseImageProvider";
import { ImagesListHeader } from "./_components/ImagesListHeader";
import { ImagesSidebar } from "./_components/ImagesSidebar";

export const metadata = createRouteMetadata("/images", {
  title: "Images",
  description:
    "Browse, generate, edit, annotate, and convert images — every tool in one place.",
  letter: "I",
  additionalMetadata: {
    keywords: [
      "image manager",
      "image studio",
      "image editor",
      "image converter",
      "favicon generator",
      "avatar generator",
      "image library",
      "cloud images",
    ],
  },
});

// Cloud-files realtime is mounted globally in app/Providers.tsx — no
// per-route provider needed.
export default function ImagesLayout({ children }: { children: ReactNode }) {
  return (
    <BrowseImageProvider>
      <PageHeader>
        <ImagesListHeader />
      </PageHeader>
      <div className="flex h-full min-h-0 overflow-hidden bg-textured">
        <ImagesSidebar />
        <main className="min-h-0 min-w-0 flex-1 overflow-y-auto overflow-x-hidden pt-[var(--shell-header-h)] max-md:pb-24">
          {children}
        </main>
      </div>
    </BrowseImageProvider>
  );
}
